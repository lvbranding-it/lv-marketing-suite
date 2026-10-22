import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { classifyBounce } from "../_shared/email/bounce.ts";
import { isCampaignEvent, verifySendGridSignature } from "../_shared/email/webhook.ts";

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  const raw = await req.text();
  // SendGrid does not send a Supabase JWT. When signed delivery is configured,
  // verify SendGrid's signature against the exact (unparsed) request body.
  const verificationKey = Deno.env.get("SENDGRID_WEBHOOK_VERIFICATION_KEY");
  if (verificationKey && !verifySendGridSignature(raw,
    req.headers.get("x-twilio-email-event-webhook-timestamp"),
    req.headers.get("x-twilio-email-event-webhook-signature"), verificationKey)) {
    return new Response("Invalid signature", { status: 401 });
  }
  let events: unknown;
  try { events = JSON.parse(raw); } catch { return new Response("Bad Request", { status: 400 }); }
  if (!Array.isArray(events)) return new Response("Expected an event array", { status: 400 });
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  try {
    for (const ev of events) {
      if (!isCampaignEvent(ev)) continue;
      if (!["open", "click", "bounce", "blocked", "dropped", "unsubscribe", "group_unsubscribe", "spamreport"].includes(String(ev.event))) continue;
      const { data: recipient, error } = await db.from("email_campaign_recipients")
        .select("id, campaign_id, org_id, email, sendgrid_message_id")
        .eq("id", ev.recipient_id).eq("campaign_id", ev.campaign_id).maybeSingle();
      if (error) throw error;
      if (!recipient) continue;
      // Reject mismatched delivery metadata; never trust an event's org/email
      // for suppression writes. SendGrid appends delivery data to this ID.
      if (ev.org_id && ev.org_id !== recipient.org_id) continue;
      if (recipient.sendgrid_message_id && typeof ev.sg_message_id === 'string'
        && ev.sg_message_id !== recipient.sendgrid_message_id
        && !ev.sg_message_id.startsWith(`${recipient.sendgrid_message_id}.`)) continue;
      let decision = null;
      if (["bounce", "blocked", "dropped"].includes(String(ev.event))) {
        const prior = await db.from("email_campaign_recipients")
          .select("id", { count: "exact", head: true })
          .eq("org_id", recipient.org_id).eq("email", recipient.email)
          .neq("id", recipient.id).in("status", ["bounced", "failed"]);
        if (prior.error) throw prior.error;
        decision = classifyBounce(ev, prior.count ?? 0);
      }
      const result = await db.rpc("record_campaign_event", {
        p_recipient_id: recipient.id, p_campaign_id: recipient.campaign_id,
        p_event: ev.event, p_at: new Date(Number(ev.timestamp) * 1000).toISOString(),
        p_failure_status: decision?.recipientStatus ?? null,
        p_reason: decision?.detail ?? null, p_suppress: decision?.suppress ?? null,
      });
      if (result.error) throw result.error;
    }
  } catch {
    // Acknowledge only durable writes. SendGrid retries non-2xx deliveries.
    console.error("Campaign event persistence failed");
    return new Response("Event persistence failed", { status: 500 });
  }
  return new Response("ok", { status: 200 });
});
