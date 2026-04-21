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

async function cleanupPersonalOrg(db: ReturnType<typeof createClient>, userId: string, targetOrgId: string) {
  const thirtySecsAgo = new Date(Date.now() - 30_000).toISOString();
  const { data: personalOrgs } = await db
    .from("organizations")
    .select("id")
    .eq("owner_user_id", userId)
    .neq("id", targetOrgId)
    .gte("created_at", thirtySecsAgo);

  if (personalOrgs && personalOrgs.length > 0) {
    const orgId = personalOrgs[0].id;
    const { count } = await db.from("projects").select("id", { count: "exact", head: true }).eq("org_id", orgId);
    if (!count || count === 0) {
      await db.from("organizations").delete().eq("id", orgId);
    }
  }
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

  const { data: branchInvitation, error: branchFetchErr } = await db
    .from("branch_invitations")
    .select(`
      id,
      org_id,
      branch_id,
      invited_email,
      invitee_name,
      role,
      invited_by,
      token,
      accepted_at,
      cancelled_at,
      expires_at
    `)
    .eq("token", token)
    .maybeSingle();

  if (branchFetchErr) {
    console.error("Branch invitation lookup error:", branchFetchErr);
    return json({ error: "Database error" }, 500);
  }

  if (branchInvitation) {
    if (branchInvitation.cancelled_at) {
      return json({ error: "This invitation has been cancelled" }, 410);
    }

    if (branchInvitation.accepted_at) {
      return json({ error: "This invitation has already been accepted" }, 410);
    }

    const now = new Date();
    const expiresAt = new Date(branchInvitation.expires_at);
    if (now > expiresAt) {
      return json({ error: "This invitation has expired" }, 410);
    }

    const { data: branchData } = await db
      .from("org_branches")
      .select("name, country, country_flag, primary_language")
      .eq("id", branchInvitation.branch_id)
      .eq("org_id", branchInvitation.org_id)
      .maybeSingle();

    const { data: orgData } = await db
      .from("organizations")
      .select("name")
      .eq("id", branchInvitation.org_id)
      .maybeSingle();

    const branch = (branchData ?? {
      name: "Branch",
      country: "",
      country_flag: null,
      primary_language: "es",
    }) as { name: string; country: string; country_flag: string | null; primary_language: string };
    const orgName = orgData?.name ?? "LV Branding";

    const bodyRaw = body as { token?: string; user_id?: string; email?: string; password?: string; full_name?: string };
    if (bodyRaw.email && bodyRaw.password && !user_id) {
      if (bodyRaw.email.toLowerCase() !== branchInvitation.invited_email.toLowerCase()) {
        return json({ error: "This invitation was sent to a different email address" }, 403);
      }

      const { data: newUser, error: createErr } = await db.auth.admin.createUser({
        email: bodyRaw.email,
        password: bodyRaw.password,
        email_confirm: true,
        user_metadata: { full_name: bodyRaw.full_name ?? branchInvitation.invitee_name ?? bodyRaw.email.split("@")[0] },
      });

      let resolvedUserId: string;

      if (createErr || !newUser?.user) {
        if (createErr?.message?.includes("already been registered")) {
          const { data: { users }, error: listErr } = await db.auth.admin.listUsers({ perPage: 1000 });
          if (listErr) {
            return json({ error: "Failed to look up existing account" }, 500);
          }
          const existing = users.find((u) => u.email?.toLowerCase() === bodyRaw.email!.toLowerCase());
          if (!existing) {
            return json({ error: "Account not found. Please contact your admin." }, 404);
          }
          resolvedUserId = existing.id;
        } else {
          console.error("Failed to create user:", createErr);
          return json({ error: createErr?.message ?? "Failed to create account" }, 500);
        }
      } else {
        resolvedUserId = newUser.user.id;
      }

      const { error: upsertErr } = await db
        .from("branch_team_members")
        .upsert(
          {
            org_id: branchInvitation.org_id,
            branch_id: branchInvitation.branch_id,
            user_id: resolvedUserId,
            role: branchInvitation.role,
            assigned_by: branchInvitation.invited_by ?? null,
            invited_email: branchInvitation.invited_email,
            display_name: bodyRaw.full_name ?? branchInvitation.invitee_name ?? null,
          },
          { onConflict: "branch_id,user_id" }
        );

      if (upsertErr) {
        console.error("Failed to upsert branch_team_members:", upsertErr);
        return json({ error: "Failed to add branch team member" }, 500);
      }

      await db.from("branch_invitations").update({ accepted_at: new Date().toISOString() }).eq("id", branchInvitation.id);
      await cleanupPersonalOrg(db, resolvedUserId, branchInvitation.org_id);

      return json({ ok: true, user_id: resolvedUserId, invite_type: "branch" });
    }

    if (user_id) {
      const { data: acceptingUser, error: acceptingUserErr } = await db.auth.admin.getUserById(user_id);
      if (acceptingUserErr || acceptingUser.user?.email?.toLowerCase() !== branchInvitation.invited_email.toLowerCase()) {
        return json({ error: "This invitation was sent to a different email address" }, 403);
      }

      const { error: upsertErr } = await db
        .from("branch_team_members")
        .upsert(
          {
            org_id: branchInvitation.org_id,
            branch_id: branchInvitation.branch_id,
            user_id,
            role: branchInvitation.role,
            assigned_by: branchInvitation.invited_by ?? null,
            invited_email: branchInvitation.invited_email,
            display_name: branchInvitation.invitee_name ?? null,
          },
          { onConflict: "branch_id,user_id" }
        );

      if (upsertErr) {
        console.error("Failed to upsert branch_team_members:", upsertErr);
        return json({ error: "Failed to add branch team member" }, 500);
      }

      await db.from("branch_invitations").update({ accepted_at: new Date().toISOString() }).eq("id", branchInvitation.id);

      return json({ ok: true, invite_type: "branch" });
    }

    return json({
      ok: true,
      invite_type: "branch",
      invited_email: branchInvitation.invited_email,
      role: branchInvitation.role,
      org_name: orgName,
      org_id: branchInvitation.org_id,
      branch_id: branchInvitation.branch_id,
      branch_name: branch.name,
      branch_country: branch.country,
      branch_country_flag: branch.country_flag,
      branch_language: branch.primary_language,
    });
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

    let resolvedUserId: string;

    if (createErr || !newUser?.user) {
      if (createErr?.message?.includes("already been registered")) {
        // User already exists — look them up and accept the invitation for them
        const { data: { users }, error: listErr } = await db.auth.admin.listUsers({ perPage: 1000 });
        if (listErr) {
          return json({ error: "Failed to look up existing account" }, 500);
        }
        const existing = users.find((u) => u.email?.toLowerCase() === bodyRaw.email!.toLowerCase());
        if (!existing) {
          return json({ error: "Account not found. Please contact your admin." }, 404);
        }
        resolvedUserId = existing.id;
        // Fall through to accept the invitation with the existing user
      } else {
        console.error("Failed to create user:", createErr);
        return json({ error: createErr?.message ?? "Failed to create account" }, 500);
      }
    } else {
      resolvedUserId = newUser.user.id;
    }

    const newUserId = resolvedUserId;

    // Mark invitation accepted
    await db.from("invitations").update({ accepted_at: new Date().toISOString() }).eq("id", invitation.id);

    // Add to org
    await db.from("team_members").upsert(
      { org_id: invitation.org_id, user_id: newUserId, role: invitation.role,
        invited_email: invitation.invited_email, invited_by: invitation.invited_by ?? null },
      { onConflict: "org_id,user_id" }
    );

    await cleanupPersonalOrg(db, newUserId, invitation.org_id);

    return json({ ok: true, user_id: newUserId });
  }

  // ── EXISTING USER accepting invitation ────────────────────────────────────
  if (user_id) {
    const { data: acceptingUser, error: acceptingUserErr } = await db.auth.admin.getUserById(user_id);
    if (acceptingUserErr || acceptingUser.user?.email?.toLowerCase() !== invitation.invited_email.toLowerCase()) {
      return json({ error: "This invitation was sent to a different email address" }, 403);
    }

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
