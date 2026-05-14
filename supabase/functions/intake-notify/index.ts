/**
 * intake-notify — public endpoint (no JWT required)
 * Fired by IntakeForm immediately after a successful submission.
 * Sends a rich internal notification email to the LV Branding team.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY")!;
const APP_URL          = Deno.env.get("APP_URL") ?? "https://marketing.lvbranding.com";
const LV_LOGO_URL      = "https://lv-marketing-suite.vercel.app/lv-logo.png";
const FROM_EMAIL       = "admin@lvbranding.com";
const FROM_NAME        = "LV Marketing Suite";

const NOTIFY_RECIPIENTS = [
  { email: "luis@lvbranding.com",  name: "Luis" },
  { email: "yex@lvbranding.com",   name: "Yex"  },
];

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function row(label: string, value: string | undefined | null): string {
  if (!value) return "";
  return `
    <tr>
      <td style="padding:5px 12px 5px 0;font-size:12px;color:#6B7280;white-space:nowrap;vertical-align:top;">${label}</td>
      <td style="padding:5px 0;font-size:13px;color:#111827;line-height:1.5;">${value}</td>
    </tr>`;
}

function section(title: string, rows: string): string {
  if (!rows.trim()) return "";
  return `
    <div style="margin-bottom:20px;">
      <p style="margin:0 0 8px;font-size:11px;font-weight:600;color:#CB2039;text-transform:uppercase;letter-spacing:.08em;">${title}</p>
      <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
        ${rows}
      </table>
    </div>`;
}

function buildEmail(opts: {
  contact_name:   string;
  contact_email:  string;
  contact_role?:  string | null;
  company_name:   string;
  form_data:      Record<string, string>;
  submission_id:  string;
  language:       string;
}): string {
  const fd  = opts.form_data;
  const intakeUrl = `${APP_URL}/intake`;

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>New Intake Submission</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
    <tr><td align="center" style="padding:32px 16px 0;">
      <table role="presentation" style="max-width:580px;width:100%;" cellpadding="0" cellspacing="0">

        <!-- Logo -->
        <tr><td align="center" style="padding:0 0 20px;">
          <img src="${LV_LOGO_URL}" alt="LV Branding" width="52" height="52"
            style="display:block;border:0;width:52px;height:52px;" />
        </td></tr>

        <!-- Card -->
        <tr><td style="background:#fff;border-radius:14px;padding:28px 32px;border:1px solid #e4e4e7;">

          <!-- Alert bar -->
          <div style="background:#FFF1F2;border-left:4px solid #CB2039;border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:24px;">
            <p style="margin:0;font-size:15px;font-weight:700;color:#CB2039;">📋 New Intake Submission</p>
            <p style="margin:4px 0 0;font-size:13px;color:#9B1C2A;">
              <strong>${opts.company_name}</strong> just completed the brief${opts.language === "es" ? " (Spanish)" : ""}.
            </p>
          </div>

          ${section("Contact", [
            row("Name",    opts.contact_name),
            row("Email",   `<a href="mailto:${opts.contact_email}" style="color:#CB2039;">${opts.contact_email}</a>`),
            row("Role",    opts.contact_role),
            row("Company", opts.company_name),
            row("Website", fd.website ? `<a href="${fd.website}" style="color:#CB2039;">${fd.website}</a>` : null),
          ].join(""))}

          ${section("Business", [
            row("Industry",       fd.industry),
            row("Company Size",   fd.company_size),
            row("Business Model", fd.business_model),
            row("One-Liner",      fd.one_liner),
          ].join(""))}

          ${section("Goals & Audience", [
            row("Goals",          fd.goals),
            row("Ideal Customer", fd.ideal_customer),
            row("Pain Point",     fd.top_problem),
            row("Timeline",       fd.timeline),
          ].join(""))}

          ${section("Brand", [
            row("Competitors",     fd.competitors),
            row("Differentiators", fd.differentiators),
            row("Brand Tone",      fd.tone),
            row("Extra Notes",     fd.extra_notes),
          ].join(""))}

          <!-- CTA -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 0;">
            <tr>
              <td style="border-radius:10px;background:#CB2039;">
                <a href="${intakeUrl}" target="_blank"
                  style="display:inline-block;padding:12px 28px;font-size:14px;font-weight:700;color:#fff;text-decoration:none;border-radius:10px;">
                  Review in Marketing Suite &rarr;
                </a>
              </td>
            </tr>
          </table>

        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="padding:20px 0 32px;font-size:11px;color:#9CA3AF;line-height:1.8;">
          LV Marketing Suite &middot; Internal notification &middot;
          <a href="${intakeUrl}" style="color:#CB2039;text-decoration:none;">View all submissions</a>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let body: {
    contact_name:   string;
    contact_email:  string;
    contact_role?:  string | null;
    company_name:   string;
    form_data:      Record<string, string>;
    submission_id:  string;
    language?:      string;
  };

  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { contact_name, contact_email, company_name, form_data, submission_id } = body;
  if (!contact_name || !company_name || !submission_id) {
    return json({ error: "Missing required fields" }, 400);
  }

  if (!SENDGRID_API_KEY) {
    console.error("SENDGRID_API_KEY not set — skipping notification email");
    return json({ ok: true, skipped: true });
  }

  const html = buildEmail({
    contact_name,
    contact_email,
    contact_role:  body.contact_role,
    company_name,
    form_data:     form_data ?? {},
    submission_id,
    language:      body.language ?? "en",
  });

  try {
    const sgRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method:  "POST",
      headers: {
        Authorization:  `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: NOTIFY_RECIPIENTS }],
        from:    { email: FROM_EMAIL, name: FROM_NAME },
        subject: `📋 New intake: ${company_name}`,
        content: [{ type: "text/html", value: html }],
      }),
    });

    if (sgRes.status !== 202) {
      const err = await sgRes.text();
      console.error("SendGrid error:", sgRes.status, err);
      return json({ error: "Failed to send email" }, 500);
    }
  } catch (e) {
    console.error("SendGrid fetch error:", e);
    return json({ error: "Network error" }, 500);
  }

  return json({ ok: true });
});
