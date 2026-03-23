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

  // If user_id is provided, the user has signed up/signed in — complete acceptance
  if (user_id) {
    // Mark invitation as accepted
    const { error: updateInvErr } = await db
      .from("invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invitation.id);

    if (updateInvErr) {
      console.error("Failed to mark invitation accepted:", updateInvErr);
      return json({ error: "Failed to accept invitation" }, 500);
    }

    // Upsert team_members row
    const { error: upsertErr } = await db
      .from("team_members")
      .upsert(
        {
          org_id: invitation.org_id,
          user_id,
          role: invitation.role,
          invited_email: invitation.invited_email,
          invited_by: invitation.invited_by ?? null,
        },
        { onConflict: "org_id,user_id" }
      );

    if (upsertErr) {
      console.error("Failed to upsert team_members:", upsertErr);
      return json({ error: "Failed to add team member" }, 500);
    }

    return json({ ok: true });
  }

  // Token validation only — return invitation details for the Accept Invite page
  const orgName =
    invitation.organizations && !Array.isArray(invitation.organizations)
      ? (invitation.organizations as { name: string }).name
      : Array.isArray(invitation.organizations) && invitation.organizations.length > 0
      ? (invitation.organizations[0] as { name: string }).name
      : "Unknown Organization";

  return json({
    ok: true,
    invitation: {
      id: invitation.id,
      org_id: invitation.org_id,
      invited_email: invitation.invited_email,
      role: invitation.role,
      org_name: orgName,
    },
  });
});
