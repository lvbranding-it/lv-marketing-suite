import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SENDGRID_API_KEY     = Deno.env.get("SENDGRID_API_KEY")!;
const SENDGRID_FROM_EMAIL  = Deno.env.get("SENDGRID_FROM_EMAIL") ?? "admin@lvbranding.com";
const SENDGRID_FROM_NAME   = Deno.env.get("SENDGRID_FROM_NAME") ?? "LV Branding";
const APP_URL              = Deno.env.get("APP_URL") ?? "https://lv-marketing-suite.vercel.app";
const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY    = Deno.env.get("SUPABASE_ANON_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function mergeVars(template: string, vars: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? "");
}

// Hosted PNG (upload a 160×160 PNG to this path in Supabase Storage for Gmail support)
const LV_LOGO_PNG = `${Deno.env.get("SUPABASE_URL") ?? ""}/storage/v1/object/public/email-assets/brand/lv-logo.png`;
// SVG fallback — shown in Outlook desktop, Apple Mail (Gmail blocks all SVG)
const LV_LOGO_SVG = "https://lv-marketing-suite.vercel.app/favicon.svg";

function wrapHtml(bodyHtml: string, unsubUrl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title></title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
    <tr><td align="center" style="padding:32px 16px 0;">
      <table role="presentation" style="max-width:600px;width:100%;" cellpadding="0" cellspacing="0">

        <!-- ── Logo: symbol centered above wordmark ── -->
        <tr><td align="center" style="padding:0 0 28px;">
          <a href="https://www.lvbranding.com" target="_blank" style="text-decoration:none;display:block;">
            <!-- Symbol -->
            <img
              src="${LV_LOGO_SVG}"
              alt=""
              width="56" height="56"
              style="display:block;margin:0 auto 10px;width:56px;height:56px;"
            />
            <!-- Wordmark -->
            <span style="display:block;font-size:22px;font-weight:800;letter-spacing:-0.5px;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
              <span style="color:#CB2039;">LV</span><span style="color:#231F20;">Branding</span>
            </span>
          </a>
        </td></tr>

        <!-- ── Body card ── -->
        <tr><td style="background:#ffffff;border-radius:12px;padding:36px 32px;border:1px solid #e4e4e7;line-height:1.75;color:#231F20;font-size:15px;">
          ${bodyHtml}
        </td></tr>

        <!-- ── Footer ── -->
        <tr><td align="center" style="padding:24px 0 32px;font-size:12px;line-height:2;">
          <p style="margin:0 0 4px;color:#374151;">
            <a href="https://www.lvbranding.com" target="_blank" style="color:#CB2039;text-decoration:none;font-weight:700;">LV Branding</a>
            &nbsp;&middot;&nbsp;Houston, TX
          </p>
          <p style="margin:0 0 6px;color:#4B5563;">
            <a href="${unsubUrl}" style="color:#4B5563;text-decoration:underline;">Unsubscribe</a>
            &nbsp;&middot;&nbsp;You're receiving this as a valued contact.
          </p>
          <p style="margin:0;font-size:11px;color:#6B7280;">
            Made with ❤️ by
            <a href="https://www.lvbranding.com" target="_blank" style="color:#CB2039;text-decoration:none;font-weight:600;">LV Branding</a>
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return new Response("Unauthorized", { status: 401, headers: cors });

  // Verify caller is authenticated
  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user }, error: authErr } = await userClient.auth.getUser(
    authHeader.replace("Bearer ", "")
  );
  if (authErr || !user) return new Response("Unauthorized", { status: 401, headers: cors });

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let body: { campaign_id: string };
  try { body = await req.json(); } catch {
    return new Response("Invalid JSON", { status: 400, headers: cors });
  }
  const { campaign_id } = body;
  if (!campaign_id) return new Response("Missing campaign_id", { status: 400, headers: cors });

  // Fetch campaign
  const { data: campaign, error: cErr } = await db
    .from("email_campaigns").select("*").eq("id", campaign_id).single();
  if (cErr || !campaign)
    return new Response(JSON.stringify({ error: "Campaign not found" }), { status: 404, headers: cors });
  if (campaign.status !== "draft")
    return new Response(JSON.stringify({ error: "Campaign already sent or sending" }), { status: 400, headers: cors });

  // Fetch pending recipients
  const { data: recipients } = await db
    .from("email_campaign_recipients")
    .select("*").eq("campaign_id", campaign_id).eq("status", "pending");
  if (!recipients?.length)
    return new Response(JSON.stringify({ error: "No pending recipients" }), { status: 400, headers: cors });

  // Load suppression list
  const { data: suppressions } = await db
    .from("email_suppressions").select("email").eq("org_id", campaign.org_id);
  const suppressed = new Set((suppressions ?? []).map((s: { email: string }) => s.email.toLowerCase()));

  // Mark as sending
  await db.from("email_campaigns").update({ status: "sending" }).eq("id", campaign_id);

  let sentCount = 0, failedCount = 0;

  for (const r of recipients) {
    // Skip suppressed
    if (suppressed.has(r.email.toLowerCase())) {
      await db.from("email_campaign_recipients")
        .update({ status: "unsubscribed" }).eq("id", r.id);
      continue;
    }

    const vars: Record<string, string> = {
      first_name: r.first_name ?? "there",
      last_name:  r.last_name  ?? "",
      company:    r.company    ?? "your company",
      title:      r.title      ?? "",
      email:      r.email,
    };

    const personalizedBody    = mergeVars(campaign.body_html, vars);
    const personalizedSubject = mergeVars(campaign.subject,   vars);
    const unsubUrl = `${APP_URL}/unsubscribe?rid=${r.id}`;
    const finalHtml = wrapHtml(personalizedBody, unsubUrl);

    const toName = [r.first_name, r.last_name].filter(Boolean).join(" ") || r.email;

    const sgPayload = {
      personalizations: [{
        to: [{ email: r.email, name: toName }],
        subject: personalizedSubject,
        custom_args: { campaign_id, recipient_id: r.id, org_id: campaign.org_id },
      }],
      from:     { email: campaign.from_email ?? SENDGRID_FROM_EMAIL, name: campaign.from_name ?? SENDGRID_FROM_NAME },
      reply_to: { email: campaign.from_email ?? SENDGRID_FROM_EMAIL, name: campaign.from_name ?? SENDGRID_FROM_NAME },
      subject:  personalizedSubject,
      content:  [{ type: "text/html", value: finalHtml }],
      tracking_settings: {
        click_tracking: { enable: true, enable_text: false },
        open_tracking:  { enable: true },
      },
      headers: {
        "List-Unsubscribe":      `<${unsubUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    };

    try {
      const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${SENDGRID_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(sgPayload),
      });

      if (res.status === 202) {
        const msgId = res.headers.get("x-message-id");
        await db.from("email_campaign_recipients")
          .update({ status: "sent", sent_at: new Date().toISOString(), sendgrid_message_id: msgId })
          .eq("id", r.id);
        sentCount++;
      } else {
        const errText = await res.text();
        await db.from("email_campaign_recipients")
          .update({ status: "failed", error_message: errText.slice(0, 500) })
          .eq("id", r.id);
        failedCount++;
      }
    } catch (e) {
      await db.from("email_campaign_recipients")
        .update({ status: "failed", error_message: String(e).slice(0, 500) })
        .eq("id", r.id);
      failedCount++;
    }

    // Small delay — stay within SendGrid rate limits
    await new Promise((r) => setTimeout(r, 80));
  }

  // Finalize campaign
  await db.from("email_campaigns").update({
    status:     "sent",
    sent_count: sentCount,
    sent_at:    new Date().toISOString(),
  }).eq("id", campaign_id);

  return new Response(
    JSON.stringify({ success: true, sent: sentCount, failed: failedCount }),
    { headers: { ...cors, "Content-Type": "application/json" } }
  );
});
