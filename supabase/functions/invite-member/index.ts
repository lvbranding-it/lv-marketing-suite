import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SENDGRID_API_KEY   = Deno.env.get("SENDGRID_API_KEY")!;
const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SUPABASE_ANON_KEY  = Deno.env.get("SUPABASE_ANON_KEY")!;
const APP_URL            = Deno.env.get("APP_URL") ?? "https://lv-marketing-suite.vercel.app";
const FROM_EMAIL         = "admin@lvbranding.com";
const FROM_NAME          = "LV Branding";
const LV_LOGO_URL        = "https://lv-marketing-suite.vercel.app/lv-logo.png";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function buildInviteEmail(opts: {
  inviteeEmail: string;
  inviterName: string;
  orgName: string;
  role: string;
  inviteLink: string;
}): string {
  const roleLabel = opts.role.charAt(0).toUpperCase() + opts.role.slice(1);

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>You've been invited to join LV Branding's Workspace</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
    <tr><td align="center" style="padding:32px 16px 0;">
      <table role="presentation" style="max-width:600px;width:100%;" cellpadding="0" cellspacing="0">

        <!-- Logo -->
        <tr><td align="center" style="padding:0 0 28px;">
          <a href="https://www.lvbranding.com" target="_blank" style="text-decoration:none;display:block;">
            <img
              src="${LV_LOGO_URL}"
              alt="LV Branding"
              width="80" height="80"
              style="display:block;margin:0 auto;width:80px;height:80px;border:0;"
            />
          </a>
        </td></tr>

        <!-- Body card -->
        <tr><td style="background:#ffffff;border-radius:12px;padding:36px 32px;border:1px solid #e4e4e7;line-height:1.75;color:#231F20;font-size:15px;">
          <h2 style="margin:0 0 16px;font-size:22px;font-weight:700;color:#231F20;">
            You've been invited to join LV Branding's Workspace
          </h2>
          <p style="margin:0 0 16px;color:#374151;">
            The admin has invited you to join
            <strong>LV Branding's Workspace</strong> on LV Branding as a
            <strong>${roleLabel}</strong>.
          </p>
          <p style="margin:0 0 28px;color:#374151;">
            Click the button below to accept your invitation and get started.
            This invitation expires in 7 days.
          </p>

          <!-- CTA Button -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 auto 28px;">
            <tr>
              <td align="center" style="border-radius:8px;background:#CB2039;">
                <a
                  href="${opts.inviteLink}"
                  target="_blank"
                  style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;background:#CB2039;"
                >
                  Accept Invitation
                </a>
              </td>
            </tr>
          </table>

          <p style="margin:0 0 8px;color:#6B7280;font-size:13px;">
            Or copy and paste this link into your browser:
          </p>
          <p style="margin:0;word-break:break-all;font-size:12px;">
            <a href="${opts.inviteLink}" style="color:#CB2039;text-decoration:none;">${opts.inviteLink}</a>
          </p>
        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="padding:24px 0 32px;font-size:12px;line-height:2;">
          <p style="margin:0 0 4px;color:#374151;">
            <a href="https://www.lvbranding.com" target="_blank" style="color:#CB2039;text-decoration:none;font-weight:700;">LV Branding</a>
            &nbsp;&middot;&nbsp;Houston, TX
          </p>
          <p style="margin:0 0 6px;color:#4B5563;">
            You received this email because ${opts.inviterName} invited ${opts.inviteeEmail}.
          </p>
          <p style="margin:0;font-size:11px;color:#6B7280;">
            Made with ❤️ by
            <a href="https://www.lvbranding.com" target="_blank" style="color:#CB2039;text-decoration:none;font-weight:600;">LV Branding (www.lvbranding.com)</a>
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

  // Require JWT
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Verify caller
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
  const { data: { user }, error: authErr } = await anonClient.auth.getUser(
    authHeader.replace("Bearer ", "")
  );
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let body: { org_id: string; email: string; role: string; inviter_name?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const { org_id, email, role, inviter_name } = body;
  if (!org_id || !email || !role) {
    return new Response(JSON.stringify({ error: "Missing org_id, email, or role" }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Validate role value
  const validRoles = ["owner", "admin", "manager", "member"];
  if (!validRoles.includes(role)) {
    return new Response(JSON.stringify({ error: `Invalid role: ${role}` }), {
      status: 400, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Get caller's role in this org
  const { data: membership, error: memberErr } = await db
    .from("team_members")
    .select("role")
    .eq("org_id", org_id)
    .eq("user_id", user.id)
    .single();

  if (memberErr || !membership) {
    return new Response(JSON.stringify({ error: "You are not a member of this organization" }), {
      status: 403, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const callerRole = membership.role as string;

  // Validate permissions:
  // owner/admin can invite manager or member
  // manager can only invite member
  if (callerRole === "manager" && role !== "member") {
    return new Response(JSON.stringify({ error: "Managers can only invite members" }), {
      status: 403, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
  if (!["owner", "admin", "manager"].includes(callerRole)) {
    return new Response(JSON.stringify({ error: "You do not have permission to invite members" }), {
      status: 403, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Get org name
  const { data: org, error: orgErr } = await db
    .from("organizations")
    .select("name")
    .eq("id", org_id)
    .single();

  if (orgErr || !org) {
    return new Response(JSON.stringify({ error: "Organization not found" }), {
      status: 404, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  // Check for existing pending invitation
  const { data: existing } = await db
    .from("invitations")
    .select("id, accepted_at, cancelled_at, expires_at")
    .eq("org_id", org_id)
    .eq("invited_email", email.toLowerCase())
    .is("accepted_at", null)
    .is("cancelled_at", null)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (existing) {
    return new Response(
      JSON.stringify({ error: "A pending invitation already exists for this email" }),
      { status: 409, headers: { ...cors, "Content-Type": "application/json" } }
    );
  }

  // Insert invitation
  const { data: invitation, error: insertErr } = await db
    .from("invitations")
    .insert({
      org_id,
      invited_email: email.toLowerCase(),
      role,
      invited_by: user.id,
      invited_by_role: callerRole,
    })
    .select("id, token")
    .single();

  if (insertErr || !invitation) {
    console.error("Insert invitation error:", insertErr);
    return new Response(JSON.stringify({ error: "Failed to create invitation" }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }

  const inviteLink = `${APP_URL}/accept-invite?token=${invitation.token}`;
  const displayInviterName = inviter_name ?? user.email ?? "A team member";

  // Send email via SendGrid
  const emailHtml = buildInviteEmail({
    inviteeEmail: email.toLowerCase(),
    inviterName: displayInviterName,
    orgName: org.name,
    role,
    inviteLink,
  });

  const sgPayload = {
    personalizations: [{
      to: [{ email: email.toLowerCase() }],
      subject: `You've been invited to join LV Branding's Workspace`,
    }],
    from: { email: FROM_EMAIL, name: FROM_NAME },
    reply_to: { email: FROM_EMAIL, name: FROM_NAME },
    subject: `You've been invited to join LV Branding's Workspace`,
    content: [{ type: "text/html", value: emailHtml }],
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
      // Don't fail — invitation was created; log but continue
    }
  } catch (e) {
    console.error("SendGrid fetch error:", e);
  }

  return new Response(
    JSON.stringify({ ok: true, invitation_id: invitation.id }),
    { headers: { ...cors, "Content-Type": "application/json" } }
  );
});
