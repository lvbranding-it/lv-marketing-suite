// supabase/functions/advance-round/index.ts
// ─────────────────────────────────────────────
// Called by the anonymous client to confirm a non-final round of a
// multi-round photo selection session.
//
// Steps:
//   1. Validate share_token → resolve session
//   2. Guard: session must be multi-round, not finalized, and not already
//      on its final round
//   3. Carry forward photos selected in the current round into the next
//      round's candidate pool (selection_round += 1)
//   4. Increment photo_sessions.current_round
//   5. Return the new round state to the client
//
// Deployed with --no-verify-jwt so anon browsers can call it.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { share_token } = (await req.json()) as { share_token: string };

    if (!share_token) {
      return new Response(JSON.stringify({ error: "share_token is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Service-role client (bypasses RLS) ───────────────────────────────────
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── 1. Resolve session from share_token ──────────────────────────────────
    const { data: session, error: sessionErr } = await supabaseAdmin
      .from("photo_sessions")
      .select("id, finalized_at, multi_round_enabled, max_rounds, current_round")
      .eq("share_token", share_token)
      .single();

    if (sessionErr || !session) {
      return new Response(JSON.stringify({ error: "Session not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 2. Guards ──────────────────────────────────────────────────────────
    if (session.finalized_at) {
      return new Response(JSON.stringify({ error: "Session is already finalized" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!session.multi_round_enabled) {
      return new Response(JSON.stringify({ error: "Multi-round selection is not enabled for this session" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (session.current_round >= session.max_rounds) {
      return new Response(JSON.stringify({ error: "This session is already on its final round" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const nextRound = session.current_round + 1;

    // ── 3. Carry forward selected photos into the next round's pool ──────────
    const { data: carried, error: carryErr } = await supabaseAdmin
      .from("session_photos")
      .update({ selection_round: nextRound })
      .eq("session_id", session.id)
      .eq("selection_round", session.current_round)
      .eq("status", "selected")
      .select("id");

    if (carryErr) {
      console.error("[advance-round] failed to carry forward selections:", carryErr);
      return new Response(JSON.stringify({ error: "Failed to advance round" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const selectedCount = carried?.length ?? 0;

    // ── 4. Increment current_round ────────────────────────────────────────────
    const { error: updateErr } = await supabaseAdmin
      .from("photo_sessions")
      .update({ current_round: nextRound })
      .eq("id", session.id);

    if (updateErr) {
      console.error("[advance-round] failed to increment current_round:", updateErr);
      return new Response(JSON.stringify({ error: "Failed to advance round" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── 5. Return result ─────────────────────────────────────────────────────
    return new Response(
      JSON.stringify({
        ok: true,
        current_round: nextRound,
        max_rounds: session.max_rounds,
        selected_count: selectedCount,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[advance-round] error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
