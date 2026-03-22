import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let rid: string | null = null;

  if (req.method === "GET") {
    rid = new URL(req.url).searchParams.get("rid");
  } else {
    try { rid = (await req.json()).rid ?? null; } catch { /* ignore */ }
  }

  if (!rid) {
    return new Response(
      JSON.stringify({ error: "Missing recipient id" }),
      { status: 400, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  // Look up recipient
  const { data: recipient, error } = await db
    .from("email_campaign_recipients")
    .select("id, email, org_id, campaign_id")
    .eq("id", rid)
    .single();

  if (error || !recipient) {
    return new Response(
      JSON.stringify({ error: "Invalid unsubscribe link" }),
      { status: 404, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  // Mark recipient as unsubscribed
  await db.from("email_campaign_recipients")
    .update({ status: "unsubscribed", unsubscribed_at: new Date().toISOString() })
    .eq("id", rid);

  // Add to org suppression list (upsert — idempotent)
  await db.from("email_suppressions").upsert(
    {
      org_id:      recipient.org_id,
      email:       recipient.email.toLowerCase(),
      reason:      "unsubscribed",
      campaign_id: recipient.campaign_id,
    },
    { onConflict: "org_id,email" }
  );

  // Increment unsubscribe counter on campaign
  if (recipient.campaign_id) {
    await db.rpc("increment_campaign_stat", {
      p_campaign_id: recipient.campaign_id,
      p_field:       "unsubscribe_count",
    });
  }

  return new Response(
    JSON.stringify({ success: true, email: recipient.email }),
    { headers: { ...cors, "Content-Type": "application/json" } }
  );
});
