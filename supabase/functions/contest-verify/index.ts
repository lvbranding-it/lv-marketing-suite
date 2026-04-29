/**
 * contest-verify — public endpoint (no JWT required)
 * Validates a vote verification token, creates the verified vote record,
 * and marks the token as used.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL       = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let token: string | null = null;

  // Support both POST body and GET query param (email link clicks are GET)
  if (req.method === "GET") {
    const url = new URL(req.url);
    token = url.searchParams.get("token");
  } else {
    try {
      const body = await req.json();
      token = body.token ?? null;
    } catch {
      return json({ error: "Invalid JSON" }, 400);
    }
  }

  if (!token) return json({ error: "Missing token" }, 400);

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

  // ── Look up the verification token ────────────────────────────────────────
  const { data: verif, error: verifErr } = await db
    .from("vote_verifications")
    .select("id, contest_id, contestant_id, voter_email, expires_at, used_at")
    .eq("token", token)
    .single();

  if (verifErr || !verif) return json({ error: "Invalid or expired link" }, 404);
  if (verif.used_at)       return json({ error: "This link has already been used" }, 409);
  if (new Date(verif.expires_at) < new Date()) {
    return json({ error: "This verification link has expired. Please vote again." }, 410);
  }

  // ── Upsert the verified vote ──────────────────────────────────────────────
  // (upsert handles the rare case of duplicate confirmation clicks)
  const now = new Date().toISOString();
  const { error: voteErr } = await db.from("votes").upsert(
    {
      contest_id:    verif.contest_id,
      contestant_id: verif.contestant_id,
      voter_email:   verif.voter_email,
      verified_at:   now,
    },
    { onConflict: "contest_id,voter_email" }
  );

  if (voteErr) {
    console.error("vote upsert error:", voteErr);
    return json({ error: "Failed to record vote" }, 500);
  }

  // ── Mark token as used only after the vote is safely recorded ─────────────
  const { error: usedErr } = await db
    .from("vote_verifications")
    .update({ used_at: now })
    .eq("id", verif.id)
    .is("used_at", null);

  if (usedErr) {
    console.error("verification update error:", usedErr);
    return json({ error: "Vote recorded, but failed to finalize verification" }, 500);
  }

  // ── Fetch contestant name for the confirmation message ────────────────────
  const { data: contestant } = await db
    .from("contestants")
    .select("name, contest_id")
    .eq("id", verif.contestant_id)
    .single();

  const { data: contest } = await db
    .from("contests")
    .select("slug, title")
    .eq("id", verif.contest_id)
    .single();

  return json({
    ok: true,
    contestant_name: contestant?.name ?? "your choice",
    contest_slug:    contest?.slug ?? "",
    contest_title:   contest?.title ?? "",
  });
});
