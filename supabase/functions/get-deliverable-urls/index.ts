// supabase/functions/get-deliverable-urls/index.ts
// Returns signed URLs for all deliverables belonging to a session.
// Validates via share_token — no JWT required (deployed with --no-verify-jwt).
// Only returns files when allow_zip_download = true AND deliverables_ready_at IS NOT NULL.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const { share_token } = (await req.json()) as { share_token: string };
    if (!share_token) return json({ error: "share_token required" }, 400);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Validate share token + check publish status
    const { data: session, error: sessErr } = await supabaseAdmin
      .from("photo_sessions")
      .select("id, allow_zip_download, deliverables_ready_at")
      .eq("share_token", share_token)
      .single();

    if (sessErr || !session) return json({ error: "Session not found" }, 404);
    if (!session.allow_zip_download || !session.deliverables_ready_at) {
      return json({ files: [] });
    }

    // Fetch deliverable records
    const { data: deliverables } = await supabaseAdmin
      .from("session_deliverables")
      .select("id, file_name, quality, storage_path")
      .eq("session_id", session.id)
      .order("quality")
      .order("file_name");

    if (!deliverables?.length) return json({ files: [] });

    // Generate signed URLs (1-hour expiry)
    const files = await Promise.all(
      deliverables.map(async (d) => {
        const { data } = await supabaseAdmin.storage
          .from("session-deliverables")
          .createSignedUrl(d.storage_path, 3600);
        return {
          id: d.id,
          file_name: d.file_name,
          quality: d.quality,
          signed_url: data?.signedUrl ?? null,
        };
      })
    );

    return json({ files: files.filter((f) => f.signed_url) });
  } catch (err) {
    console.error(err);
    return json({ error: "Internal server error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" },
  });
}
