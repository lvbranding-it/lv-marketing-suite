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

function emailHtml(name: string, invitationUrl: string, returning = false) {
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(invitationUrl);
  return `<!doctype html><html><body style="margin:0;background:#f5f5f5;font-family:Arial,sans-serif;color:#231f20">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#fff;border:1px solid #e5e5e5;border-radius:16px">
  <tr><td style="padding:36px"><p style="margin:0 0 10px;color:#cb2039;font-weight:700">LV Branding Ambassador Portal</p>
  <h1 style="font-size:24px;margin:0 0 18px">${returning ? "Welcome back" : "Welcome"}${safeName ? `, ${safeName}` : ""}</h1>
  <p style="line-height:1.65;margin:0 0 24px">${returning ? "Your LV Branding administrator sent you a secure link to return to the representative portal." : "You have been invited to join the LV Branding portal. Use the secure link below to sign in or create your account, then accept the invitation."}</p>
  <p style="margin:0 0 28px"><a href="${safeUrl}" style="display:inline-block;background:#cb2039;color:#fff;text-decoration:none;padding:14px 22px;border-radius:9px;font-weight:700">${returning ? "Open the portal" : "Open your invitation"}</a></p>
  <p style="font-size:13px;line-height:1.55;color:#666">${returning ? "This sign-in link is private, time-limited, and intended only for you." : "This link expires in seven days and can be used only by the invited email address. If a new invitation is sent, this link stops working."}</p>
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
    "userId",
    "email",
    "name",
    "role",
  ]);
  if (Object.keys(body).some((key) => !allowed.has(key)))
    return json({ error: "Invalid request" }, 400);
  const action = body.action;
  const orgId = body.orgId;
  const invitationId = body.invitationId;
  const userId = body.userId;
  const email =
    typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const role = body.role;
  if (!["create", "replace", "access"].includes(String(action)) || !uuid.test(String(orgId))) {
    return json({ error: "Invalid invitation" }, 400);
  }

  const scoped = createClient(supabaseUrl, serviceKey, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
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
  let recipientEmail = email;
  let recipientName = name;
  let invitationIdCreated: string | undefined;
  let invitationUrl: string;
  if (action === "access") {
    if (!uuid.test(String(userId))) return json({ error: "Invalid invitation" }, 400);
    const { data: recipient, error: recipientError } = await scoped.rpc(
      "portal_member_access_recipient",
      { p_org: orgId, p_user: userId },
    );
    if (recipientError || !recipient?.[0]?.email) {
      const status = recipientError?.code === "P0429" ? 429 : 403;
      return json({ error: status === 429 ? "Rate limited" : "Representative unavailable" }, status);
    }
    recipientEmail = recipient[0].email;
    recipientName = recipient[0].display_name;
    const { data: generated, error: linkError } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: recipientEmail,
      options: { redirectTo: `${origin.origin}/portal` },
    });
    if (linkError || !generated?.properties?.action_link)
      return json({ error: "Access link unavailable" }, 400);
    invitationUrl = generated.properties.action_link;
  } else {
    if (
      (action === "replace" && !uuid.test(String(invitationId))) ||
      !emailPattern.test(email) ||
      email.length > 320 ||
      !name ||
      name.length > 120 ||
      !["ambassador", "business_developer", "staff"].includes(String(role))
    ) return json({ error: "Invalid invitation" }, 400);
    const rpc = action === "create" ? "portal_create_invitation" : "portal_replace_invitation";
    const args = action === "create"
      ? { p_org: orgId, p_email: email, p_name: name, p_role: role }
      : { p_id: invitationId, p_email: email, p_name: name, p_role: role };
    const { data, error } = await scoped.rpc(rpc, args);
    const created = data?.[0];
    if (error || !created?.invitation_id || !created?.token) {
      const status = error?.code === "P0429" ? 429 : error?.code === "42501" ? 403 : 400;
      return json({ error: status === 429 ? "Rate limited" : "Invitation unavailable" }, status);
    }
    invitationIdCreated = created.invitation_id;
    invitationUrl = `${origin.origin}/portal-invite#invite=${created.token}`;
  }
  // An invitation token is claimable only by the invited address, so handing it
  // back for manual delivery is safe. An access link is a magic link that signs
  // its holder straight into the representative's own account, so it is never
  // returned to the administrator's browser and a failed send is an error rather
  // than a credential to pass along by hand.
  if (!sendgridKey) {
    if (action === "access") return json({ error: "Access link could not be sent" }, 502);
    return json({
      invitationId: invitationIdCreated,
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
        personalizations: [{ to: [{ email: recipientEmail, name: recipientName }] }],
        from: { email: fromEmail, name: fromName },
        reply_to: { email: fromEmail, name: fromName },
        subject: action === "access" ? "Your secure LV Branding Portal link" : "Your LV Branding Ambassador Portal invitation",
        content: [{ type: "text/html", value: emailHtml(recipientName, invitationUrl, action === "access") }],
        // Click tracking rewrites every link through SendGrid's branded redirect
        // domain. For a sign-in link that is wrong twice over: the credential
        // would travel through a third-party redirector, and the rewritten URL
        // is only as reachable as that domain's TLS certificate, which is what
        // made these links land on a browser security warning. Marketing email
        // still tracks clicks; a credential never should.
        tracking_settings: {
          click_tracking: { enable: false, enable_text: false },
        },
      }),
    });
    delivered = response.status === 202;
  } catch {
    delivered = false;
  }
  if (!delivered) {
    if (action === "access") return json({ error: "Access link could not be sent" }, 502);
    return json({
      invitationId: invitationIdCreated,
      invitationUrl,
      emailSent: false,
    });
  }
  if (action === "access") {
    await scoped.rpc("portal_mark_member_access_sent", { p_org: orgId, p_user: userId });
    return json({ emailSent: true });
  }
  await scoped.rpc("portal_mark_invitation_sent", { p_id: invitationIdCreated });
  return json({
    invitationId: invitationIdCreated,
    invitationUrl,
    emailSent: true,
  });
});
