import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY")!;
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const APP_URL = Deno.env.get("APP_URL") ?? "https://lv-marketing-suite.vercel.app";
const FROM_EMAIL = "admin@lvbranding.com";
const FROM_NAME = "LV Branding";
const LV_LOGO_URL = "https://lv-marketing-suite.vercel.app/lv-logo.png";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function roleLabel(role: string, language: "en" | "es") {
  const labels: Record<string, Record<string, string>> = {
    en: {
      regional_ceo: "Regional CEO",
      manager: "Manager",
      crew: "Team Member",
    },
    es: {
      regional_ceo: "CEO Regional",
      manager: "Manager",
      crew: "Miembro del equipo",
    },
  };
  return labels[language][role] ?? role;
}

function buildBranchInviteEmail(opts: {
  inviteeEmail: string;
  inviteeName?: string;
  inviterName: string;
  orgName: string;
  branchName: string;
  country: string;
  countryFlag?: string | null;
  role: string;
  inviteLink: string;
  language: "en" | "es";
}) {
  const language = opts.language;
  const greeting = escapeHtml(opts.inviteeName?.trim() || opts.inviteeEmail.split("@")[0]);
  const role = escapeHtml(roleLabel(opts.role, language));
  const branchName = escapeHtml(opts.branchName);
  const country = escapeHtml(opts.country);
  const flag = escapeHtml(opts.countryFlag?.trim() || "");
  const inviterName = escapeHtml(opts.inviterName);
  const inviteLink = escapeHtml(opts.inviteLink);

  const copy = language === "es"
    ? {
      title: `Invitacion a ${branchName}`,
      invited: "Estas invitado",
      intro: `${inviterName} te invito a unirte al equipo local de ${branchName}.`,
      roleLabel: "Rol",
      branchLabel: "Sucursal",
      countryLabel: "Pais",
      cta: "Aceptar invitacion",
      guideTitle: "Que podras hacer",
      bullets: [
        "Trabajar solo con los contactos, proyectos y campanas de tu sucursal.",
        "Usar las herramientas de marketing compartidas por HQ.",
        "Leer avisos importantes y mensajes locales dentro de tu sucursal.",
      ],
      fallback: "Si el boton no funciona, copia y pega este enlace:",
      expiry: "Esta invitacion vence en 7 dias.",
      footer: `Recibiste este correo porque ${inviterName} invito a ${escapeHtml(opts.inviteeEmail)} a LV Branding.`,
    }
    : {
      title: `Invitation to ${branchName}`,
      invited: "You're invited",
      intro: `${inviterName} invited you to join the local team for ${branchName}.`,
      roleLabel: "Role",
      branchLabel: "Branch",
      countryLabel: "Country",
      cta: "Accept invitation",
      guideTitle: "What you can do",
      bullets: [
        "Work only with your branch contacts, projects, and campaigns.",
        "Use the marketing tools shared by HQ.",
        "Read important local notices inside your branch workspace.",
      ],
      fallback: "Button not working? Copy and paste this link:",
      expiry: "This invitation expires in 7 days.",
      footer: `You received this because ${inviterName} invited ${escapeHtml(opts.inviteeEmail)} to LV Branding.`,
    };

  const bullets = copy.bullets.map((bullet) => `
            <tr>
              <td style="padding:6px 0;font-size:14px;color:#374151;line-height:1.6;">
                ${escapeHtml(bullet)}
              </td>
            </tr>`).join("");

  return `<!DOCTYPE html>
<html lang="${language}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${copy.title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
    <tr><td align="center" style="padding:32px 16px 0;">
      <table role="presentation" style="max-width:600px;width:100%;" cellpadding="0" cellspacing="0">
        <tr><td align="center" style="padding:0 0 24px;">
          <a href="https://www.lvbranding.com" target="_blank">
            <img src="${LV_LOGO_URL}" alt="LV Branding" width="80" height="80"
              style="display:block;margin:0 auto;width:80px;height:80px;border:0;" />
          </a>
        </td></tr>
        <tr><td style="background:#ffffff;border-radius:12px;padding:36px 32px;border:1px solid #e4e4e7;color:#231F20;">
          <h2 style="margin:0 0 8px;font-size:22px;font-weight:700;color:#231F20;">
            ${copy.invited}
          </h2>
          <p style="margin:0 0 6px;font-size:15px;color:#374151;line-height:1.7;">
            ${language === "es" ? "Hola" : "Hi"} <strong>${greeting}</strong>,
          </p>
          <p style="margin:0 0 20px;font-size:15px;color:#374151;line-height:1.7;">
            ${copy.intro}
          </p>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:0 0 24px;border:1px solid #e4e4e7;border-radius:10px;">
            <tr>
              <td style="padding:14px 16px;font-size:13px;color:#6b7280;">${copy.branchLabel}</td>
              <td style="padding:14px 16px;font-size:14px;font-weight:700;color:#231F20;text-align:right;">${flag ? `${flag} ` : ""}${branchName}</td>
            </tr>
            <tr>
              <td style="padding:14px 16px;font-size:13px;color:#6b7280;border-top:1px solid #e4e4e7;">${copy.countryLabel}</td>
              <td style="padding:14px 16px;font-size:14px;font-weight:700;color:#231F20;text-align:right;border-top:1px solid #e4e4e7;">${country}</td>
            </tr>
            <tr>
              <td style="padding:14px 16px;font-size:13px;color:#6b7280;border-top:1px solid #e4e4e7;">${copy.roleLabel}</td>
              <td style="padding:14px 16px;font-size:14px;font-weight:700;color:#CB2039;text-align:right;border-top:1px solid #e4e4e7;">${role}</td>
            </tr>
          </table>

          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 28px;">
            <tr>
              <td style="border-radius:8px;background:#CB2039;">
                <a href="${inviteLink}" target="_blank"
                  style="display:inline-block;padding:14px 32px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:8px;">
                  ${copy.cta}
                </a>
              </td>
            </tr>
          </table>

          <h3 style="margin:0 0 12px;font-size:16px;font-weight:700;color:#231F20;">
            ${copy.guideTitle}
          </h3>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            ${bullets}
          </table>

          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0 16px;">
            <tr><td style="border-top:1px solid #e4e4e7;"></td></tr>
          </table>
          <p style="margin:0 0 4px;font-size:12px;color:#6B7280;">${copy.fallback}</p>
          <p style="margin:0;word-break:break-all;font-size:12px;">
            <a href="${inviteLink}" style="color:#CB2039;text-decoration:none;">${inviteLink}</a>
          </p>
          <p style="margin:12px 0 0;font-size:12px;color:#9CA3AF;">${copy.expiry}</p>
        </td></tr>
        <tr><td align="center" style="padding:24px 0 32px;font-size:12px;line-height:2;">
          <p style="margin:0 0 4px;">
            <a href="https://www.lvbranding.com" target="_blank"
              style="color:#CB2039;text-decoration:none;font-weight:700;">LV Branding</a>
          </p>
          <p style="margin:0;color:#6B7280;">${copy.footer}</p>
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
  const accessToken = authHeader?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return json({ error: "Missing authorization token" }, 401);

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  const { data: { user }, error: authErr } = await db.auth.getUser(accessToken);
  if (authErr || !user) return json({ error: "Invalid authorization token" }, 401);

  let body: {
    org_id?: string;
    branch_id?: string;
    email?: string;
    role?: string;
    inviter_name?: string;
    invitee_name?: string;
  };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const orgId = body.org_id;
  const branchId = body.branch_id;
  const email = body.email?.trim().toLowerCase();
  const role = body.role;

  if (!orgId || !branchId || !email || !role) {
    return json({ error: "Missing org_id, branch_id, email, or role" }, 400);
  }

  const validRoles = ["regional_ceo", "manager", "crew"];
  if (!validRoles.includes(role)) return json({ error: `Invalid role: ${role}` }, 400);

  const { data: branch, error: branchErr } = await db
    .from("org_branches")
    .select("id, org_id, name, country, country_flag, primary_language")
    .eq("id", branchId)
    .eq("org_id", orgId)
    .single();

  if (branchErr || !branch) return json({ error: "Branch not found" }, 404);

  const { data: hqMembership } = await db
    .from("team_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("user_id", user.id)
    .maybeSingle();

  const { data: branchMembership } = await db
    .from("branch_team_members")
    .select("role")
    .eq("org_id", orgId)
    .eq("branch_id", branchId)
    .eq("user_id", user.id)
    .maybeSingle();

  const hqRole = hqMembership?.role as string | undefined;
  const callerBranchRole = branchMembership?.role as string | undefined;
  let allowedRoles: string[] = [];

  if (hqRole === "owner" || hqRole === "admin") allowedRoles = validRoles;
  else if (callerBranchRole === "regional_ceo") allowedRoles = ["manager", "crew"];
  else if (callerBranchRole === "manager") allowedRoles = ["crew"];

  if (!allowedRoles.includes(role)) {
    return json({ error: "You do not have permission to invite this branch role" }, 403);
  }

  if (role === "regional_ceo") {
    const { count } = await db
      .from("branch_team_members")
      .select("user_id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("branch_id", branchId)
      .eq("role", "regional_ceo");

    if ((count ?? 0) > 0) {
      return json({ error: "This branch already has a Regional CEO" }, 409);
    }

    const { count: pendingCount } = await db
      .from("branch_invitations")
      .select("id", { count: "exact", head: true })
      .eq("org_id", orgId)
      .eq("branch_id", branchId)
      .eq("role", "regional_ceo")
      .neq("invited_email", email)
      .is("accepted_at", null)
      .is("cancelled_at", null)
      .gt("expires_at", new Date().toISOString());

    if ((pendingCount ?? 0) > 0) {
      return json({ error: "This branch already has a pending Regional CEO invitation" }, 409);
    }
  }

  await db
    .from("branch_invitations")
    .update({ cancelled_at: new Date().toISOString() })
    .eq("org_id", orgId)
    .eq("branch_id", branchId)
    .eq("invited_email", email)
    .is("accepted_at", null)
    .is("cancelled_at", null);

  const { data: invitation, error: insertErr } = await db
    .from("branch_invitations")
    .insert({
      org_id: orgId,
      branch_id: branchId,
      invited_email: email,
      invitee_name: body.invitee_name?.trim() || null,
      role,
      invited_by: user.id,
    })
    .select("id, token")
    .single();

  if (insertErr || !invitation) {
    console.error("Insert branch invitation error:", insertErr);
    return json({ error: "Failed to create branch invitation" }, 500);
  }

  const inviteLink = `${APP_URL}/accept-invite?token=${invitation.token}`;
  const displayInviterName = body.inviter_name ?? user.email ?? "LV Branding";
  const language = branch.primary_language === "en" ? "en" : "es";

  const emailHtml = buildBranchInviteEmail({
    inviteeEmail: email,
    inviteeName: body.invitee_name,
    inviterName: displayInviterName,
    orgName: "LV Branding",
    branchName: branch.name,
    country: branch.country,
    countryFlag: branch.country_flag,
    role,
    inviteLink,
    language,
  });

  const subject = language === "es"
    ? `Invitacion a ${branch.country_flag ? `${branch.country_flag} ` : ""}${branch.name}`
    : `Invitation to ${branch.country_flag ? `${branch.country_flag} ` : ""}${branch.name}`;

  try {
    const sgRes = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{
          to: [{ email }],
          subject,
        }],
        from: { email: FROM_EMAIL, name: FROM_NAME },
        reply_to: { email: FROM_EMAIL, name: FROM_NAME },
        subject,
        content: [{ type: "text/html", value: emailHtml }],
      }),
    });

    if (sgRes.status !== 202) {
      console.error("SendGrid error:", sgRes.status, await sgRes.text());
    }
  } catch (error) {
    console.error("SendGrid fetch error:", error);
  }

  return json({ ok: true, invitation_id: invitation.id });
});
