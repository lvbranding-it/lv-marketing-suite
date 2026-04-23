import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SENDGRID_API_KEY   = Deno.env.get("SENDGRID_API_KEY")!;
const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const FROM_EMAIL         = "admin@lvbranding.com";
const FROM_NAME          = "LV Branding";
const LV_LOGO_URL        = "https://lv-marketing-suite.vercel.app/lv-logo.png";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildIntakeEmail(opts: {
  message:    string;
  senderName: string;
  intakeLink: string;
  subject:    string;
}): string {
  // Convert plain-text message to HTML paragraphs
  const messageHtml = opts.message
    .split("\n")
    .map((line) => {
      const safe = line
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
      return safe.trim()
        ? `<p style="margin:0 0 14px;font-size:15px;color:#374151;line-height:1.75;">${safe}</p>`
        : `<p style="margin:0 0 14px;">&nbsp;</p>`;
    })
    .join("");

  const safeLink = opts.intakeLink
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${opts.subject.replace(/</g, "&lt;")}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
    <tr><td align="center" style="padding:32px 16px 0;">
      <table role="presentation" style="max-width:600px;width:100%;" cellpadding="0" cellspacing="0">

        <!-- Logo -->
        <tr><td align="center" style="padding:0 0 24px;">
          <a href="https://www.lvbranding.com" target="_blank">
            <img src="${LV_LOGO_URL}" alt="LV Branding" width="72" height="72"
              style="display:block;margin:0 auto;width:72px;height:72px;border:0;" />
          </a>
        </td></tr>

        <!-- Card -->
        <tr><td style="background:#ffffff;border-radius:14px;padding:40px 36px 36px;border:1px solid #e4e4e7;">

          <!-- Message body -->
          ${messageHtml}

          <!-- CTA Button -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:28px 0;">
            <tr>
              <td align="center" style="border-radius:10px;background:#CB2039;">
                <a href="${opts.intakeLink}" target="_blank"
                  style="display:inline-block;padding:15px 38px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;letter-spacing:0.2px;">
                  Complete Your Brief &rarr;
                </a>
              </td>
            </tr>
          </table>

          <!-- Divider -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="border-top:1px solid #f0f0f0;"></td></tr>
          </table>

          <!-- Signature -->
          <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.7;">
            Warm regards,<br/>
            <strong style="color:#231F20;">${opts.senderName}</strong><br/>
            <span style="color:#9CA3AF;font-size:13px;">LV Branding</span>
          </p>

          <!-- Fallback link -->
          <p style="margin:0;font-size:12px;color:#9CA3AF;">
            Button not working? Copy this link:<br/>
            <a href="${opts.intakeLink}" target="_blank"
              style="color:#CB2039;text-decoration:none;word-break:break-all;">${safeLink}</a>
          </p>

        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="padding:24px 0 36px;font-size:12px;color:#6B7280;line-height:1.9;">
          <a href="https://www.lvbranding.com" target="_blank"
            style="color:#CB2039;text-decoration:none;font-weight:700;">LV Branding</a>
          &nbsp;&middot;&nbsp; Houston, TX<br/>
          <span style="font-size:11px;color:#9CA3AF;">
            Made with &hearts; by
            <a href="https://www.lvbranding.com" target="_blank"
              style="color:#CB2039;text-decoration:none;">LV Branding</a>
          </span>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  // Require JWT
  const authHeader = req.headers.get("Authorization");
  const accessToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) {
    return new Response(JSON.stringify({ error: "Missing authorization token" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: { user }, error: authErr } = await db.auth.getUser(accessToken);
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Invalid authorization token" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  let body: {
    to_email:    string;
    to_name?:    string;
    subject:     string;
    message:     string;
    sender_name: string;
    intake_link: string;
  };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { to_email, subject, message, sender_name, intake_link } = body;
  if (!to_email || !subject || !message || !intake_link) {
    return new Response(JSON.stringify({ error: "Missing required fields: to_email, subject, message, intake_link" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  if (!SENDGRID_API_KEY) {
    console.error("SENDGRID_API_KEY is not set");
    return new Response(JSON.stringify({ error: "Email service not configured" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const emailHtml = buildIntakeEmail({
    message,
    senderName: sender_name || "The LV Branding Team",
    intakeLink: intake_link,
    subject,
  });

  const sgPayload = {
    personalizations: [{
      to: [{ email: to_email, name: body.to_name || to_email }],
    }],
    from:     { email: FROM_EMAIL, name: FROM_NAME },
    reply_to: { email: FROM_EMAIL, name: FROM_NAME },
    subject,
    content:  [{ type: "text/html", value: emailHtml }],
  };

  try {
    const sgRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(sgPayload),
    });

    if (sgRes.status !== 202) {
      const errText = await sgRes.text();
      console.error("SendGrid error:", sgRes.status, errText);
      return new Response(JSON.stringify({ error: "Failed to send email", details: errText }), {
        status: 500, headers: { ...cors, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("SendGrid fetch error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  return new Response(
    JSON.stringify({ ok: true }),
    { headers: { ...cors, "Content-Type": "application/json" } },
  );
});
