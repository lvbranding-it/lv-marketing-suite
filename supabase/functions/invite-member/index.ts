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
  inviteeName?: string;
  inviterName: string;
  orgName: string;
  role: string;
  inviteLink: string;
}): string {
  const roleLabel = opts.role.charAt(0).toUpperCase() + opts.role.slice(1);
  const greeting = opts.inviteeName ?? opts.inviteeEmail.split("@")[0];

  // Role-specific How To Use steps
  type StepList = { label: string; desc: string }[];
  const stepsByRole: Record<string, StepList> = {
    manager: [
      { label: "1. 📊 Dashboard", desc: "See your team's activity and recent work at a glance" },
      { label: "2. 📧 Campaigns", desc: "Compose AI-powered email blasts and approve Member drafts before they send" },
      { label: "3. 👥 Contacts", desc: "Browse, research, and enrich your prospect list with AI insights" },
      { label: "4. 📁 Projects", desc: "Manage client projects from kickoff to delivery" },
      { label: "5. ⚡ Skills", desc: "Run 33 AI marketing tools for copy, SEO, ads, strategy, and more" },
      { label: "6. 👤 As a Manager", desc: "You can invite new Members and approve campaigns before they go out" },
    ],
    member: [
      { label: "1. 📊 Dashboard", desc: "Your home base; see recent activity and jump back into your work" },
      { label: "2. 📧 Campaigns", desc: "Draft email campaigns; a Manager or Admin will review before sending" },
      { label: "3. 👥 Contacts", desc: "View and research contacts; run AI enrichment on any prospect" },
      { label: "4. 📁 Projects", desc: "Collaborate on client projects assigned to you" },
      { label: "5. ⚡ Skills", desc: "Use 33 AI marketing tools for copy, strategy, SEO, and more" },
      { label: "6. 👤 As a Member", desc: "Your edits and actions are visible to your Manager; reach out with questions" },
    ],
    admin: [
      { label: "1. 📊 Dashboard", desc: "Full visibility into all team activity and workspace stats" },
      { label: "2. 📧 Campaigns", desc: "Create, send, and track email blasts across your contact lists" },
      { label: "3. 👥 Contacts", desc: "Full CRM access — import, research, tag, and manage all prospects" },
      { label: "4. 📁 Projects", desc: "Create and manage all client projects and AI-generated outputs" },
      { label: "5. ⚡ Skills", desc: "Access all 33 AI marketing tools for the full team" },
      { label: "6. ⚙️ Settings", desc: "Manage team members, roles, and feature access for your workspace" },
    ],
  };

  const stepList: StepList = stepsByRole[opts.role] ?? stepsByRole["member"];

  const steps = stepList.map((s) => `
            <tr>
              <td style="padding:6px 0;font-size:14px;color:#374151;line-height:1.6;">
                <span style="font-weight:600;color:#231F20;">${s.label}</span>
                — ${s.desc}
              </td>
            </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>You've been invited to LV Branding's Workspace</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
    <tr><td align="center" style="padding:32px 16px 0;">
      <table role="presentation" style="max-width:600px;width:100%;" cellpadding="0" cellspacing="0">

        <!-- Logo -->
        <tr><td align="center" style="padding:0 0 24px;">
          <a href="https://www.lvbranding.com" target="_blank">
            <img src="${LV_LOGO_URL}" alt="LV Branding" width="80" height="80"
              style="display:block;margin:0 auto;width:80px;height:80px;border:0;" />
          </a>
        </td></tr>

        <!-- Card -->
        <tr><td style="background:#ffffff;border-radius:12px;padding:36px 32px;border:1px solid #e4e4e7;color:#231F20;">

          <!-- Greeting -->
          <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#231F20;">
            👋 You're invited!
          </h2>
          <p style="margin:0 0 6px;font-size:15px;color:#374151;line-height:1.7;">
            Hi <strong>${greeting}</strong>,
          </p>
          <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">
            <strong>${opts.inviterName}</strong> has invited you to join
            <strong>LV Branding's Marketing Suite</strong> as a
            <strong style="color:#CB2039;">${roleLabel}</strong>.
            You're just one click away from getting started!
          </p>

          <!-- CTA Button -->
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
            <tr>
              <td style="border-radius:8px;background:#CB2039;">
                <a href="${opts.inviteLink}" target="_blank"
                  style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">
                  Get Started →
                </a>
              </td>
            </tr>
          </table>

          <!-- Divider -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;">
            <tr><td style="border-top:1px solid #e4e4e7;"></td></tr>
          </table>

          <!-- How To Use section -->
          <h3 style="margin:0 0 12px;font-size:16px;font-weight:700;color:#231F20;">
            🗺️ Your Quick Start Guide
          </h3>
          <p style="margin:0 0 16px;font-size:14px;color:#4B5563;line-height:1.7;">
            LV Branding's Marketing Suite is an AI-powered workspace for crafting campaigns,
            managing contacts, and running marketing strategies — all in one place.
            Here's what you'll have access to:
          </p>

          <!-- Numbered steps -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${steps}
          </table>

          <!-- Divider -->
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 16px;">
            <tr><td style="border-top:1px solid #e4e4e7;"></td></tr>
          </table>

          <!-- Fallback link -->
          <p style="margin:0 0 4px;font-size:12px;color:#6B7280;">
            Button not working? Copy and paste this link:
          </p>
          <p style="margin:0;word-break:break-all;font-size:12px;">
            <a href="${opts.inviteLink}" style="color:#CB2039;text-decoration:none;">${opts.inviteLink}</a>
          </p>
          <p style="margin:12px 0 0;font-size:12px;color:#9CA3AF;">
            ⏰ This invitation expires in 7 days.
          </p>

        </td></tr>

        <!-- Footer -->
        <tr><td align="center" style="padding:24px 0 32px;font-size:12px;line-height:2;">
          <p style="margin:0 0 4px;">
            <a href="https://www.lvbranding.com" target="_blank"
              style="color:#CB2039;text-decoration:none;font-weight:700;">LV Branding</a>
            &nbsp;·&nbsp; Houston, TX
          </p>
          <p style="margin:0 0 4px;color:#6B7280;">
            You received this because ${opts.inviterName} invited ${opts.inviteeEmail} to join the workspace.
          </p>
          <p style="margin:0;font-size:11px;color:#9CA3AF;">
            Made with ❤️ by <a href="https://www.lvbranding.com" target="_blank"
              style="color:#CB2039;text-decoration:none;font-weight:600;">LV Branding (www.lvbranding.com)</a>
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

  let body: { org_id: string; email: string; role: string; inviter_name?: string; invitee_name?: string };
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
    inviteeName: body.invitee_name,
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
