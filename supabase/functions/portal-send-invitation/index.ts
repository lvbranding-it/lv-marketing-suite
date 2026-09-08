import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function emailHtml(name: string, invitationUrl: string) {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(invitationUrl);
  return `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#231f20">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #e5e5e5;border-radius:16px">
  <tr><td style="padding:36px"><p style="margin:0 0 10px;color:#cb2039;font-weight:700">LV Branding Ambassador Portal</p>
  <h1 style="font-size:24px;margin:0 0 18px">Welcome${safeName ? `, ${safeName}` : ""}</h1>
  <p style="line-height:1.65;margin:0 0 24px">You have been invited to join the LV Branding portal. Use the secure link below to sign in or create your account, then accept the invitation.</p>
  <p style="margin:0 0 28px"><a href="${safeUrl}" style="display:inline-block;background:#cb2039;color:#fff;text-decoration:none;padding:14px 22px;border-radius:9px;font-weight:700">Open your invitation</a></p>
  <p style="font-size:13px;line-height:1.55;color:#666">This link expires in seven days and can be used only by the invited email address. If a new invitation is sent, this link stops working.</p>
  <p style="font-size:12px;color:#888;word-break:break-all">${safeUrl}</p>
  </td></tr></table></td></tr></table></body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const sendgridKey = Deno.env.get("SENDGRID_API_KEY") ?? "";
  const token = req.headers
    .get("Authorization")
    ?.match(/^Bearer\s+(\S+)$/i)?.[1];
  if (!supabaseUrl || !serviceKey || !token)
    return json({ error: "Unauthorized" }, 401);

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: auth, error: authError } = await admin.auth.getUser(token);
  if (authError || !auth.user) return json({ error: "Unauthorized" }, 401);

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }
  const allowed = new Set([
    "action",
    "orgId",
    "invitationId",
    "email",
    "name",
    "role",
  ]);
  if (Object.keys(body).some((key) => !allowed.has(key)))
    return json({ error: "Invalid request" }, 400);
  const action = body.action;
  const orgId = body.orgId;
  const invitationId = body.invitationId;
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const role = body.role;
  if (
    !["create", "replace"].includes(String(action)) ||
    !uuid.test(String(orgId)) ||
    (action === "replace" && !uuid.test(String(invitationId))) ||
    !emailPattern.test(email) ||
    email.length > 320 ||
    !name ||
    name.length > 120 ||
    !["ambassador", "business_developer", "staff"].includes(String(role))
  ) {
    return json({ error: "Invalid invitation" }, 400);
  }

  const scoped = createClient(supabaseUrl, serviceKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const rpc =
    action === "create"
      ? "portal_create_invitation"
      : "portal_replace_invitation";
  const args =
    action === "create"
      ? { p_org: orgId, p_email: email, p_name: name, p_role: role }
      : { p_id: invitationId, p_email: email, p_name: name, p_role: role };
  const { data, error } = await scoped.rpc(rpc, args);
  const created = data?.[0];
  if (error || !created?.invitation_id || !created?.token) {
    const status =
      error?.code === "P0429" ? 429 : error?.code === "42501" ? 403 : 400;
    return json(
      { error: status === 429 ? "Rate limited" : "Invitation unavailable" },
      status,
    );
  }

  const configuredOrigin =
    Deno.env.get("PORTAL_PUBLIC_URL") ?? "https://marketing.lvbranding.com";
  let origin: URL;
  try {
    origin = new URL(configuredOrigin);
    if (origin.protocol !== "https:" && origin.hostname !== "localhost")
      throw new Error();
  } catch {
    return json({ error: "Portal URL is not configured" }, 500);
  }
  const invitationUrl = `${origin.origin}/portal-invite#invite=${created.token}`;
  if (!sendgridKey) {
    return json({
      invitationId: created.invitation_id,
      invitationUrl,
      emailSent: false,
    });
  }

  const fromEmail =
    Deno.env.get("SENDGRID_FROM_EMAIL") ?? "admin@lvbranding.com";
  const fromName = Deno.env.get("SENDGRID_FROM_NAME") ?? "LV Branding";
  let delivered = false;
  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${sendgridKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email, name }] }],
        from: { email: fromEmail, name: fromName },
        reply_to: { email: fromEmail, name: fromName },
        subject: "Your LV Branding Ambassador Portal invitation",
        content: [{ type: "text/html", value: emailHtml(name, invitationUrl) }],
      }),
    });
    delivered = response.status === 202;
  } catch {
    delivered = false;
  }
  if (!delivered) {
    return json({
      invitationId: created.invitation_id,
      invitationUrl,
      emailSent: false,
    });
  }
  await scoped.rpc("portal_mark_invitation_sent", {
    p_id: created.invitation_id,
  });
  return json({
    invitationId: created.invitation_id,
    invitationUrl,
    emailSent: true,
  });
});
