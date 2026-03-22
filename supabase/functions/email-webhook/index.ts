import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let events: Record<string, unknown>[];
  try { events = await req.json(); } catch {
    return new Response("Bad Request", { status: 400 });
  }

  for (const ev of events) {
    const eventType    = ev["event"]       as string | undefined;
    const campaignId   = ev["campaign_id"] as string | undefined;
    const recipientId  = ev["recipient_id"]as string | undefined;
    const orgId        = ev["org_id"]      as string | undefined;
    const email        = ev["email"]       as string | undefined;
    const ts           = ev["timestamp"]   as number | undefined;
    const isoTs        = ts ? new Date(ts * 1000).toISOString() : new Date().toISOString();

    if (!recipientId || !campaignId) continue;

    switch (eventType) {
      case "open":
        await db.from("email_campaign_recipients")
          .update({ status: "opened", opened_at: isoTs })
          .eq("id", recipientId).eq("status", "sent");
        await db.rpc("increment_campaign_stat", { p_campaign_id: campaignId, p_field: "open_count" });
        break;

      case "click":
        await db.from("email_campaign_recipients")
          .update({ status: "clicked", clicked_at: isoTs })
          .eq("id", recipientId);
        await db.rpc("increment_campaign_stat", { p_campaign_id: campaignId, p_field: "click_count" });
        break;

      case "bounce":
      case "blocked":
      case "dropped":
        await db.from("email_campaign_recipients")
          .update({ status: "bounced" }).eq("id", recipientId);
        if (orgId && email) {
          await db.from("email_suppressions").upsert(
            { org_id: orgId, email: email.toLowerCase(), reason: "bounced", campaign_id: campaignId },
            { onConflict: "org_id,email" }
          );
        }
        await db.rpc("increment_campaign_stat", { p_campaign_id: campaignId, p_field: "bounce_count" });
        break;

      case "unsubscribe":
      case "group_unsubscribe":
        await db.from("email_campaign_recipients")
          .update({ status: "unsubscribed", unsubscribed_at: isoTs }).eq("id", recipientId);
        if (orgId && email) {
          await db.from("email_suppressions").upsert(
            { org_id: orgId, email: email.toLowerCase(), reason: "unsubscribed", campaign_id: campaignId },
            { onConflict: "org_id,email" }
          );
        }
        await db.rpc("increment_campaign_stat", { p_campaign_id: campaignId, p_field: "unsubscribe_count" });
        break;

      case "spamreport":
        if (orgId && email) {
          await db.from("email_suppressions").upsert(
            { org_id: orgId, email: email.toLowerCase(), reason: "spam", campaign_id: campaignId },
            { onConflict: "org_id,email" }
          );
        }
        break;
    }
  }

  return new Response("ok", { status: 200 });
});
