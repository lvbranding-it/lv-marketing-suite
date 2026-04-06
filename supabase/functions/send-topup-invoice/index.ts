// supabase/functions/send-topup-invoice/index.ts
// Sends the extras (top-up) Wave invoice to the client.
// The invoice is auto-created by finalize-session; this function just emails it.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function waveGQL(apiKey: string, query: string, variables: Record<string, unknown>) {
  const res = await fetch("https://gql.waveapps.com/graphql/public", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, variables }),
  });
  const text = await res.text();
  console.log("[send-topup-invoice] Wave raw response:", text);
  try {
    return JSON.parse(text);
  } catch {
    return { _rawText: text };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  console.log("[send-topup-invoice] Request received");

  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader) return json({ error: "Unauthorized" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAdmin = createClient(supabaseUrl, serviceKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
    if (authErr || !user) return json({ error: "Unauthorized" }, 401);

    // ── Body ─────────────────────────────────────────────────────────────────
    const { session_id } = (await req.json().catch(() => ({}))) as { session_id?: string };
    if (!session_id) return json({ error: "session_id required" }, 400);

    // ── Load session ─────────────────────────────────────────────────────────
    const { data: session, error: sessErr } = await supabaseAdmin
      .from("photo_sessions")
      .select("id, name, client_name, client_email, wave_invoice_id, wave_invoice_url")
      .eq("id", session_id)
      .single();

    if (sessErr || !session) {
      console.error("[send-topup-invoice] Session load error:", sessErr?.message);
      return json({ error: "Session not found" }, 404);
    }

    console.log("[send-topup-invoice] Session loaded:", {
      id: session.id,
      name: session.name,
      has_wave_invoice: !!session.wave_invoice_id,
      has_email: !!session.client_email,
    });

    if (!session.wave_invoice_id) {
      return json({ error: "No top-up invoice exists for this session. It is created automatically when the client confirms their selection." }, 400);
    }

    if (!session.client_email) {
      return json({ error: "No client email on this session." }, 400);
    }

    // ── Wave config ───────────────────────────────────────────────────────────
    const waveApiKey = Deno.env.get("WAVE_API_KEY");
    if (!waveApiKey) return json({ error: "Wave not configured." }, 500);

    // ── Send invoice via Wave ─────────────────────────────────────────────────
    console.log("[send-topup-invoice] Sending invoice ID:", session.wave_invoice_id);

    const sendResult = await waveGQL(waveApiKey, `
      mutation InvoiceSend($input: InvoiceSendInput!) {
        invoiceSend(input: $input) {
          didSucceed
          inputErrors { code message path }
        }
      }
    `, {
      input: {
        invoiceId: session.wave_invoice_id,
        to: [session.client_email],
        subject: `Your extra photos invoice — ${session.name}`,
        message: `Please find your invoice for the additional photos selected during your photography session: ${session.name}.`,
        attachPDF: true,
      },
    });

    console.log("[send-topup-invoice] Send result:", JSON.stringify(sendResult));

    const didSucceed = sendResult?.data?.invoiceSend?.didSucceed;
    const inputErrors = sendResult?.data?.invoiceSend?.inputErrors;

    if (!didSucceed) {
      return json({
        error: "Wave failed to send the top-up invoice",
        detail: inputErrors?.length ? inputErrors : sendResult,
      }, 500);
    }

    // ── Update sent timestamp ─────────────────────────────────────────────────
    await supabaseAdmin.from("photo_sessions").update({
      topup_invoice_sent_at: new Date().toISOString(),
    }).eq("id", session_id);

    console.log("[send-topup-invoice] Invoice sent successfully");
    return json({ ok: true });

  } catch (err) {
    console.error("[send-topup-invoice] Uncaught error:", err);
    return json({ error: "Internal server error", detail: String(err) }, 500);
  }
});
