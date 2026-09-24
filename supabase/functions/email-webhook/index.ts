import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { classifyBounce } from "../_shared/email/bounce.ts";

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
      case "open": {
        // Only count the FIRST open per recipient (unique opens)
        const { data: openRecip } = await db
          .from("email_campaign_recipients")
          .select("id, opened_at")
          .eq("id", recipientId)
          .maybeSingle();
        if (openRecip && !openRecip.opened_at) {
          await db.from("email_campaign_recipients")
            .update({ status: "opened", opened_at: isoTs })
            .eq("id", recipientId);
          await db.rpc("increment_campaign_stat", { p_campaign_id: campaignId, p_field: "open_count" });
        }
        break;
      }

      case "click": {
        // Only count the FIRST click per recipient (unique clicks)
        const { data: clickRecip } = await db
          .from("email_campaign_recipients")
          .select("id, clicked_at")
          .eq("id", recipientId)
          .maybeSingle();
        if (clickRecip && !clickRecip.clicked_at) {
          await db.from("email_campaign_recipients")
            .update({ status: "clicked", clicked_at: isoTs })
            .eq("id", recipientId);
          await db.rpc("increment_campaign_stat", { p_campaign_id: campaignId, p_field: "click_count" });
        }
        break;
      }

      case "bounce":
      case "blocked":
      case "dropped": {
        // Only a permanent refusal is permanent. A block or a deferral is real
        // for this send but is not evidence the mailbox is gone, so the address
        // stays in the list and gets another chance next campaign — until it
        // has failed often enough to stop being a blip.
        // Scoped to the org: one tenant's delivery history must never decide
        // whether another tenant keeps mailing the same address.
        const priorFailures = email && orgId
          ? (await db.from("email_campaign_recipients")
              .select("id", { count: "exact", head: true })
              .eq("org_id", orgId)
              .eq("email", email)
              .in("status", ["bounced", "failed"])).count ?? 0
          : 0;
        const decision = classifyBounce(ev, priorFailures);

        await db.from("email_campaign_recipients")
          .update({ status: decision.recipientStatus, error_message: decision.detail || null })
          .eq("id", recipientId);

        if (decision.suppress && orgId && email) {
          await db.from("email_suppressions").upsert(
            { org_id: orgId, email: email.toLowerCase(), reason: decision.suppress, campaign_id: campaignId },
            { onConflict: "org_id,email" }
          );
        }
        // The campaign's bounce count follows what was recorded, so a retryable
        // failure does not inflate a number people read as "addresses lost".
        if (decision.recipientStatus === "bounced") {
          await db.rpc("increment_campaign_stat", { p_campaign_id: campaignId, p_field: "bounce_count" });
        }
        break;
      }

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
