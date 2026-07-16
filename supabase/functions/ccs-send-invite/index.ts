// ccs-send-invite — sends the branded Creative Collaboration Standard invitation.
// Admin-authenticated (verify_jwt = true). Mirrors send-intake-invite.
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL = "admin@lvbranding.com";
const FROM_NAME = "LV Branding";
const LV_LOGO_URL = "https://lv-marketing-suite.vercel.app/lv-logo.png";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildEmail(opts: { message: string; senderName: string; link: string; projectName: string }): string {
  const paras = opts.message.split("\n").map((l) => {
    const safe = l.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    return safe.trim() ? `<p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.75;">${safe}</p>` : "";
  }).join("");
  const link = opts.link.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;"><tr><td align="center" style="padding:32px 16px 0;">
<table role="presentation" style="max-width:600px;width:100%;" cellpadding="0" cellspacing="0">
  <tr><td align="center" style="padding:0 0 24px;"><a href="https://www.lvbranding.com" target="_blank"><img src="${LV_LOGO_URL}" alt="LV Branding" width="72" height="72" style="display:block;margin:0 auto;width:72px;height:72px;border:0;"/></a></td></tr>
  <tr><td style="background:#ffffff;border-radius:14px;padding:40px 36px 36px;border:1px solid #e4e4e7;">
    <p style="margin:0 0 4px;font-size:11px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#CB2039;">Creative Collaboration Standard</p>
    <h1 style="margin:0 0 18px;font-size:20px;color:#231F20;">${opts.projectName}</h1>
    ${paras}
    <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;"><tr><td align="center" style="border-radius:10px;background:#CB2039;">
      <a href="${opts.link}" target="_blank" style="display:inline-block;padding:15px 38px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;letter-spacing:0.2px;">Review &amp; Sign &rarr;</a>
    </td></tr></table>
    <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.7;">Warm regards,<br/><strong style="color:#231F20;">${opts.senderName}</strong><br/><span style="color:#9CA3AF;font-size:13px;">LV Branding</span></p>
    <p style="margin:0;font-size:12px;color:#9CA3AF;">Button not working? Copy this link:<br/><a href="${opts.link}" target="_blank" style="color:#CB2039;text-decoration:none;word-break:break-all;">${link}</a></p>
  </td></tr>
  <tr><td align="center" style="padding:24px 0 36px;font-size:12px;color:#6B7280;">LV Branding &middot; Houston, TX</td></tr>
</table></td></tr></table></body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const accessToken = req.headers.get("Authorization")?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return new Response(JSON.stringify({ error: "Missing authorization token" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

  const db = createClient(SUPABASE_URL, SERVICE_KEY);
  const { data: { user }, error: authErr } = await db.auth.getUser(accessToken);
  if (authErr || !user) return new Response(JSON.stringify({ error: "Invalid authorization token" }), { status: 401, headers: { ...cors, "Content-Type": "application/json" } });

  let body: { request_id: string; review_link: string; subject?: string; message?: string; sender_name?: string };
  try { body = await req.json(); } catch { return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } }); }

  const { request_id, review_link } = body;
  if (!request_id || !review_link) return new Response(JSON.stringify({ error: "Missing required fields: request_id, review_link" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  if (!SENDGRID_API_KEY) return new Response(JSON.stringify({ error: "Email service not configured" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });

  // Load the request and confirm the caller belongs to its org. Recipient is taken
  // from the request itself — never trusted from the request body.
  const { data: request } = await db.from("ccs_requests").select("id, org_id, recipient_email, recipient_name, project_id").eq("id", request_id).maybeSingle();
  if (!request) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
  const { data: membership } = await db.from("team_members").select("user_id").eq("org_id", request.org_id).eq("user_id", user.id).maybeSingle();
  if (!membership) return new Response(JSON.stringify({ error: "forbidden" }), { status: 403, headers: { ...cors, "Content-Type": "application/json" } });
  if (!request.recipient_email) return new Response(JSON.stringify({ error: "no_recipient" }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });

  const { data: project } = await db.from("ccs_projects").select("project_name").eq("id", request.project_id).maybeSingle();
  const projectName = project?.project_name || "Your project";
  const message = body.message || "Before the creative process moves forward, please review the LV Branding Creative Collaboration Standard for your project. This short guided experience explains how feedback, revisions, approvals, AI-assisted input, and project materials will be managed.";
  const html = buildEmail({ message, senderName: body.sender_name || "The LV Branding Team", link: review_link, projectName });

  const sgRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${SENDGRID_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: request.recipient_email, name: request.recipient_name || request.recipient_email }] }],
      from: { email: FROM_EMAIL, name: FROM_NAME }, reply_to: { email: FROM_EMAIL, name: FROM_NAME },
      subject: body.subject || `Creative Collaboration Standard for ${projectName}`,
      content: [{ type: "text/html", value: html }],
    }),
  });
  if (sgRes.status !== 202) {
    const errText = await sgRes.text();
    return new Response(JSON.stringify({ error: "Failed to send email", details: errText }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
  return new Response(JSON.stringify({ ok: true }), { headers: { ...cors, "Content-Type": "application/json" } });
});
