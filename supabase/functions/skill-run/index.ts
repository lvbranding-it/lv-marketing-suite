import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const CLAUDE_API_KEY = Deno.env.get("CLAUDE_API_KEY");
    if (!CLAUDE_API_KEY) {
      throw new Error("CLAUDE_API_KEY is not configured");
    }

    // Validate auth using service role key (most reliable in Deno edge functions)
    const authHeader = req.headers.get("Authorization");
    const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
    if (!token) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    // Decode the JWT payload without re-verifying the signature.
    // Supabase's gateway already validated the token before this function runs.
    // Re-validating with the JS client fails for ES256-signed tokens.
    let userId: string | null = null;
    try {
      const payloadB64 = token.split(".")[1];
      const payload = JSON.parse(atob(payloadB64.replace(/-/g, "+").replace(/_/g, "/")));
      userId = payload.sub ?? null;
    } catch {
      // malformed token
    }
    if (!userId) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      });
    }

    const {
      skillSystemPrompt,
      userMessage,
      conversationHistory,
      marketingContext,
      orgId,
      branchId,
      sourceType,
    } = await req.json();

    if (!skillSystemPrompt || !userMessage) {
      return new Response(
        JSON.stringify({ error: "skillSystemPrompt and userMessage are required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseAdmin = supabaseUrl && serviceRoleKey
      ? createClient(supabaseUrl, serviceRoleKey)
      : null;

    if (supabaseAdmin && orgId) {
      const { data: membership } = await supabaseAdmin
        .from("team_members")
        .select("user_id")
        .eq("org_id", orgId)
        .eq("user_id", userId)
        .maybeSingle();

      if (!membership) {
        return new Response(JSON.stringify({ error: "Unauthorized organization" }), {
          status: 403,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      }
    }

    if (supabaseAdmin && orgId && branchId) {
      const monthStart = new Date();
      monthStart.setUTCDate(1);
      monthStart.setUTCHours(0, 0, 0, 0);

      const { data: branch } = await supabaseAdmin
        .from("org_branches")
        .select("monthly_budget_cents")
        .eq("org_id", orgId)
        .eq("id", branchId)
        .maybeSingle();

      const monthlyBudgetCents = Number(branch?.monthly_budget_cents ?? 0);
      if (monthlyBudgetCents > 0) {
        const { data: events } = await supabaseAdmin
          .from("branch_usage_events")
          .select("estimated_cost_cents")
          .eq("org_id", orgId)
          .eq("branch_id", branchId)
          .gte("created_at", monthStart.toISOString());

        const monthSpendCents = (events ?? []).reduce(
          (sum, event) => sum + Number(event.estimated_cost_cents ?? 0),
          0
        );

        if (monthSpendCents >= monthlyBudgetCents) {
          return new Response(
            JSON.stringify({ error: "Branch AI usage budget reached for this month." }),
            { status: 402, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // Build messages array
    const messages: { role: string; content: string }[] = [];

    // Add conversation history
    if (conversationHistory && Array.isArray(conversationHistory)) {
      for (const msg of conversationHistory) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }

    // Prepend marketing context to the first user message if provided
    let finalUserMessage = userMessage;
    if (
      messages.length === 0 &&
      marketingContext &&
      typeof marketingContext === "object" &&
      Object.keys(marketingContext).length > 0
    ) {
      const contextStr = (marketingContext as Record<string, unknown>).raw_markdown
        ? String((marketingContext as Record<string, unknown>).raw_markdown)
        : JSON.stringify(marketingContext, null, 2);

      finalUserMessage =
        `## Product Marketing Context\n\nUse this as background — don't re-ask for information already captured here:\n\n${contextStr}\n\n---\n\n${userMessage}`;
    }

    messages.push({ role: "user", content: finalUserMessage });

    // Call Claude API with streaming
    const claudeResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": CLAUDE_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 16000,
        system: skillSystemPrompt,
        messages,
        stream: true,
      }),
    });

    if (!claudeResponse.ok) {
      const errorBody = await claudeResponse.text();
      console.error("Claude API error:", claudeResponse.status, errorBody);
      return new Response(
        JSON.stringify({ error: `Claude API error: ${claudeResponse.status}`, details: errorBody }),
        { status: 502, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Stream SSE back to the browser
    const { readable, writable } = new TransformStream();
    const writer = writable.getWriter();
    const encoder = new TextEncoder();

    (async () => {
      const reader = claudeResponse.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let inputTokens = 0;
      let outputTokens = 0;

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const data = line.slice(6).trim();
            if (data === "[DONE]") continue;

            try {
              const event = JSON.parse(data);
              if (event.type === "message_start") {
                inputTokens = Number(event.message?.usage?.input_tokens ?? inputTokens);
                outputTokens = Number(event.message?.usage?.output_tokens ?? outputTokens);
              }
              if (event.type === "message_delta") {
                outputTokens = Number(event.usage?.output_tokens ?? outputTokens);
              }
              if (
                event.type === "content_block_delta" &&
                event.delta?.type === "text_delta" &&
                event.delta.text
              ) {
                await writer.write(
                  encoder.encode(`data: ${JSON.stringify({ text: event.delta.text })}\n\n`)
                );
              }
            } catch {
              // Skip malformed events
            }
          }
        }

        if (supabaseAdmin && orgId) {
          const estimatedCostCents = Math.ceil(
            (inputTokens * 300 + outputTokens * 1500) / 1_000_000
          );

          await supabaseAdmin.from("branch_usage_events").insert({
            org_id: orgId,
            branch_id: branchId ?? null,
            user_id: userId,
            source_type: sourceType ?? "ai_skill",
            units: inputTokens + outputTokens,
            unit_type: "tokens",
            estimated_cost_cents: estimatedCostCents,
            metadata: {
              model: "claude-sonnet-4-6",
              input_tokens: inputTokens,
              output_tokens: outputTokens,
            },
          });
        }

        await writer.write(encoder.encode("data: [DONE]\n\n"));
      } catch (err) {
        console.error("Stream error:", err);
        await writer.write(
          encoder.encode(`data: ${JSON.stringify({ error: "Stream interrupted" })}\n\n`)
        );
      } finally {
        await writer.close();
      }
    })();

    return new Response(readable, {
      headers: {
        ...CORS_HEADERS,
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
      },
    });
  } catch (err) {
    console.error("skill-run error:", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
