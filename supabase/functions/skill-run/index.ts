import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

import {
  AiAccessError,
  requireAiUser,
  requireAiOrganization,
} from "../_shared/ai-authorization.ts";

import {
  ADVISOR_RULES,
  ADVISOR_BRAND_CONTEXT,
  AMBASSADOR_TRAINING_CONTEXT,
  AMBASSADOR_COMMISSION_CONTEXT,
  parseAdvisorInput,
  completeAdvisorResponse,
} from "../_shared/portal-advisor.ts";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// ─────────────────────────────────────────────────────────────────────────────
// AGENCY IDENTITY: injected at the top of every skill system prompt so every
// Claude call is permanently grounded in who LV Branding is, what they stand
// for, and what quality standard their work must meet.
// ─────────────────────────────────────────────────────────────────────────────
const AGENCY_CONTEXT = `## Agency Identity: LV Branding

You are operating inside LV Branding's Marketing Suite. All work you produce is on behalf of LV Branding and will be used directly in client-facing deliverables.

**Who we are:** LV Branding is a full-service brand strategy and creative agency based in Houston, Texas. We partner with businesses across every industry, from restaurants and healthcare to construction and nonprofits, to build the brand foundation, visual identity, digital presence, and content systems that drive real growth.

**Philosophy: Strategy first. Always.** Every engagement starts with a strategy session. We learn the client's business, their market, their audience, and their goals before we open a design file or turn on a camera. That's not because we're slow. It's because every decision we make; every color, every word, every photograph, is built to perform, not just to look good. The result is a brand that earns trust on first impression, communicates clearly at every touchpoint, and grows with the business over time. That is the difference between a brand and a logo.

**Brand Systems:** A Brand System at LV Branding isn't a deck of abstract ideas, slogans, or archetypes. It's the invisible architecture that aligns business strategy, market positioning, and brand identity into one cohesive system. When built right, it defines how a brand behaves, communicates, and evolves, connecting the audience's emotions to the company's objectives and guiding every action: from pricing and tone to design, campaigns, and culture.

**Your role:** You are a senior member of the LV Branding team producing professional-grade brand and marketing work for our clients. Every output must reflect the agency's standard: strategic, intentional, and built to drive real results. Not generic, not templated. Write with the clarity, confidence, and client-first perspective of a seasoned brand strategist. When you produce copy, strategy, recommendations, or creative direction, do so as LV Branding would: with purpose behind every word.

**Writing style (always):** Never use em dashes (the — character) in anything you write. Where one would go, use a period, comma, colon, or parentheses instead. This applies to every output: copy, strategy documents, emails, captions, headings, and lists. Hyphens in compound words and numeric ranges like 8-15% are fine.`;

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const CLAUDE_API_KEY = Deno.env.get("CLAUDE_API_KEY");
    if (!CLAUDE_API_KEY) {
      throw new Error("CLAUDE_API_KEY is not configured");
    }

    if (req.method !== "POST")
      throw new AiAccessError(405, "Method not allowed");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey)
      throw new Error("AI service unavailable");
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const userId = await requireAiUser(
      supabaseAdmin,
      req.headers.get("Authorization"),
    );

    const requestBody = await req.json();
    const advisor =
      requestBody.mode === "portal_advisor"
        ? parseAdvisorInput(requestBody)
        : null;
    let advisorName: unknown = null;
    let {
      skillSystemPrompt,
      userMessage,
      conversationHistory,
      marketingContext,
      orgId,
      branchId,
      sourceType,
    } = requestBody;

    if (advisor) {
      const scoped = createClient(supabaseUrl, serviceRoleKey, {
        global: {
          headers: { Authorization: req.headers.get("Authorization")! },
        },
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data, error } = await scoped.rpc("portal_advisor_session", {
        p_org: advisor.orgId,
      });
      if (error || !data?.role)
        throw new AiAccessError(
          error?.code === "P0429" ? 429 : 403,
          "Advisor unavailable",
        );
      advisorName = data.first_name;
      skillSystemPrompt = `${ADVISOR_RULES}\nRespond in ${advisor.language === "es" ? "Spanish" : "English"} unless the user requests otherwise.`;
      userMessage = advisor.userMessage;
      conversationHistory = advisor.conversationHistory;
      marketingContext = undefined;
    } else {
      if (!skillSystemPrompt || !userMessage)
        throw new AiAccessError(
          400,
          "skillSystemPrompt and userMessage are required",
        );
      await requireAiOrganization(supabaseAdmin, userId, orgId, branchId);
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
          0,
        );

        if (monthSpendCents >= monthlyBudgetCents) {
          return new Response(
            JSON.stringify({
              error: "Branch AI usage budget reached for this month.",
            }),
            {
              status: 402,
              headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
            },
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
      const contextStr = (marketingContext as Record<string, unknown>)
        .raw_markdown
        ? String((marketingContext as Record<string, unknown>).raw_markdown)
        : JSON.stringify(marketingContext, null, 2);

      finalUserMessage = `## Product Marketing Context\n\nUse this as background; don't re-ask for information already captured here:\n\n${contextStr}\n\n---\n\n${userMessage}`;
    }

    messages.push({ role: "user", content: finalUserMessage });

    // Prepend the permanent LV Branding agency identity to every skill's system prompt.
    // This ensures all Claude calls are grounded in who we are, what we do, and
    // what standard our client deliverables must meet, regardless of which skill runs.
    const fullSystemPrompt = `${advisor ? [ADVISOR_BRAND_CONTEXT, AMBASSADOR_TRAINING_CONTEXT, AMBASSADOR_COMMISSION_CONTEXT].join("\n\n") : AGENCY_CONTEXT}\n\n---\n\n${skillSystemPrompt}`;

    // Call Claude API with streaming
    const claudeResponse = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        signal: advisor ? AbortSignal.timeout(45_000) : undefined,
        headers: {
          "x-api-key": CLAUDE_API_KEY,
          "anthropic-version": "2023-06-01",
          "content-type": "application/json",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: advisor ? 2400 : 16000,
          system: fullSystemPrompt,
          messages,
          stream: true,
        }),
      },
    );

    if (!claudeResponse.ok) {
      if (advisor)
        return new Response(JSON.stringify({ error: "Advisor unavailable" }), {
          status: 502,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        });
      const errorBody = await claudeResponse.text();
      console.error("Claude API error:", claudeResponse.status, errorBody);
      return new Response(
        JSON.stringify({
          error: `Claude API error: ${claudeResponse.status}`,
          details: errorBody,
        }),
        {
          status: 502,
          headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
        },
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
      let advisorText = "";
      let advisorCompleted = false;
      let advisorFailed = false;

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
              if (event.type === "message_stop") advisorCompleted = true;
              if (event.type === "error" && advisor) advisorFailed = true;
              if (
                event.type === "message_delta" &&
                event.delta?.stop_reason === "max_tokens"
              )
                advisorFailed = true;
              if (event.type === "message_start") {
                inputTokens = Number(
                  event.message?.usage?.input_tokens ?? inputTokens,
                );
                outputTokens = Number(
                  event.message?.usage?.output_tokens ?? outputTokens,
                );
              }
              if (event.type === "message_delta") {
                outputTokens = Number(
                  event.usage?.output_tokens ?? outputTokens,
                );
              }
              if (
                event.type === "content_block_delta" &&
                event.delta?.type === "text_delta" &&
                event.delta.text
              ) {
                if (advisor) advisorText += event.delta.text;
                else
                  await writer.write(
                    encoder.encode(
                      `data: ${JSON.stringify({ text: event.delta.text })}\n\n`,
                    ),
                  );
              }
            } catch {
              // Skip malformed events
            }
          }
        }

        if (advisor) {
          if (advisorFailed || !advisorCompleted || !advisorText.trim())
            throw new Error("Advisor response incomplete");
          await writer.write(
            encoder.encode(
              `data: ${JSON.stringify({ text: completeAdvisorResponse(advisorText, advisorName) })}\n\n`,
            ),
          );
        }

        if (!advisor && supabaseAdmin && orgId) {
          const estimatedCostCents = Math.ceil(
            (inputTokens * 300 + outputTokens * 1500) / 1_000_000,
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
          encoder.encode(
            `data: ${JSON.stringify({ error: "Stream interrupted" })}\n\n`,
          ),
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
        Connection: "keep-alive",
      },
    });
  } catch (err) {
    console.error("skill-run error:", err);
    return new Response(
      JSON.stringify({
        error:
          err instanceof AiAccessError ? err.message : "AI service unavailable",
      }),
      {
        status: err instanceof AiAccessError ? err.status : 500,
        headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
      },
    );
  }
});
