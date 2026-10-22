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

  const { error: recordError } = await db.rpc("record_campaign_event", {
    p_recipient_id: recipient.id, p_campaign_id: recipient.campaign_id,
    p_event: "unsubscribe", p_at: new Date().toISOString(),
  });
  if (recordError) return new Response(JSON.stringify({error:"Unable to unsubscribe. Please try again."}),
    {status:500, headers:{...cors,"Content-Type":"application/json"}});

  return new Response(
    JSON.stringify({ success: true, email: recipient.email }),
    { headers: { ...cors, "Content-Type": "application/json" } }
  );
});
