import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL         = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

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

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  let body: { token?: string; user_id?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { token, user_id } = body;

  if (!token) {
    return json({ error: "Missing token" }, 400);
  }

  // Look up invitation by token
  const { data: invitation, error: fetchErr } = await db
    .from("invitations")
    .select(`
      id,
      org_id,
      invited_email,
      role,
      invited_by,
      token,
      accepted_at,
      cancelled_at,
      expires_at,
      organizations ( name )
    `)
    .eq("token", token)
    .maybeSingle();

  if (fetchErr) {
    console.error("Invitation lookup error:", fetchErr);
    return json({ error: "Database error" }, 500);
  }

  if (!invitation) {
    return json({ error: "Invitation not found" }, 404);
  }

  if (invitation.cancelled_at) {
    return json({ error: "This invitation has been cancelled" }, 410);
  }

  if (invitation.accepted_at) {
    return json({ error: "This invitation has already been accepted" }, 410);
  }

  const now = new Date();
  const expiresAt = new Date(invitation.expires_at);
  if (now > expiresAt) {
    return json({ error: "This invitation has expired" }, 410);
  }

  const orgName =
    invitation.organizations && !Array.isArray(invitation.organizations)
      ? (invitation.organizations as { name: string }).name
      : Array.isArray(invitation.organizations) && invitation.organizations.length > 0
      ? (invitation.organizations[0] as { name: string }).name
      : "LV Branding's Workspace";

  // ── SIGNUP via invite: create user server-side (no confirmation email) ────
  // Body: { token, email, password, full_name }
  const bodyRaw = body as { token?: string; user_id?: string; email?: string; password?: string; full_name?: string };
  if (bodyRaw.email && bodyRaw.password && !user_id) {
    // Create confirmed user via Admin API — bypasses email confirmation entirely
    const { data: newUser, error: createErr } = await db.auth.admin.createUser({
      email:            bodyRaw.email,
      password:         bodyRaw.password,
      email_confirm:    true,
      user_metadata:    { full_name: bodyRaw.full_name ?? bodyRaw.email.split("@")[0] },
    });

    if (createErr || !newUser?.user) {
      // If user already exists, try to look them up instead
      if (createErr?.message?.includes("already been registered")) {
        // Existing user accepting via signup form — just return error so frontend retries with signin
        return json({ error: "An account with this email already exists. Please use Sign In instead." }, 409);
      }
      console.error("Failed to create user:", createErr);
      return json({ error: createErr?.message ?? "Failed to create account" }, 500);
    }

    const newUserId = newUser.user.id;

    // Mark invitation accepted
    await db.from("invitations").update({ accepted_at: new Date().toISOString() }).eq("id", invitation.id);

    // Add to org
    await db.from("team_members").upsert(
      { org_id: invitation.org_id, user_id: newUserId, role: invitation.role,
        invited_email: invitation.invited_email, invited_by: invitation.invited_by ?? null },
      { onConflict: "org_id,user_id" }
    );

    // Delete the auto-created personal org the signup trigger just made (it's empty)
    const thirtySecsAgo = new Date(Date.now() - 30_000).toISOString();
    const { data: personalOrgs } = await db
      .from("organizations")
      .select("id")
      .eq("owner_user_id", newUserId)
      .neq("id", invitation.org_id)
      .gte("created_at", thirtySecsAgo);

    if (personalOrgs && personalOrgs.length > 0) {
      const orgId = personalOrgs[0].id;
      // Only delete if truly empty (no projects)
      const { count } = await db.from("projects").select("id", { count: "exact", head: true }).eq("org_id", orgId);
      if (!count || count === 0) {
        await db.from("organizations").delete().eq("id", orgId);
      }
    }

    return json({ ok: true, user_id: newUserId });
  }

  // ── EXISTING USER accepting invitation ────────────────────────────────────
  if (user_id) {
    await db.from("invitations").update({ accepted_at: new Date().toISOString() }).eq("id", invitation.id);

    const { error: upsertErr } = await db
      .from("team_members")
      .upsert(
        { org_id: invitation.org_id, user_id, role: invitation.role,
          invited_email: invitation.invited_email, invited_by: invitation.invited_by ?? null },
        { onConflict: "org_id,user_id" }
      );

    if (upsertErr) {
      console.error("Failed to upsert team_members:", upsertErr);
      return json({ error: "Failed to add team member" }, 500);
    }

    return json({ ok: true });
  }

  // ── TOKEN VALIDATION ONLY — return invite details for the page ────────────
  return json({
    ok: true,
    invited_email: invitation.invited_email,
    role:          invitation.role,
    org_name:      orgName,
    org_id:        invitation.org_id,
  });
});
