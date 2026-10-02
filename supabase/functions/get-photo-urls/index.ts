import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// "grid" is the gallery's thumbnail; "large" is the photo opened on its own.
// Both are copies made when the photo was uploaded (thumb_path, 600 pixels;
// preview_path, 1600 pixels). Links used to ask Supabase to resize the
// original, which Supabase bills for every distinct photo beyond the plan's
// 100 a cycle. A photo without its copies yet gets its original.
type Size = "grid" | "large";
const LARGE_PER_REQUEST = 12;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const { share_token, photo_ids, size: requestedSize } = await req.json() as {
      share_token: string;
      photo_ids: string[];
      size?: Size;
    };
    const size: Size = requestedSize === "large" ? "large" : "grid";

    if (!share_token || !Array.isArray(photo_ids) || photo_ids.length === 0) {
      return new Response(
        JSON.stringify({ error: "share_token and photo_ids[] are required" }),
        { status: 400, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // Use service role key to bypass RLS for signed URL generation
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 1. Verify share_token exists and resolve session_id
    const { data: session, error: sessionError } = await supabaseAdmin
      .from("photo_sessions")
      .select("id")
      .eq("share_token", share_token)
      .single();

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired share token" }),
        { status: 404, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // 2. Fetch storage_path for each requested photo_id, scoped to this session.
    //    The session's photos are read and filtered here: every id in an
    //    `in (...)` filter goes into the request URL, which a large session
    //    would push past what the gateway accepts.
    const requested = new Set(size === "large" ? photo_ids.slice(0, LARGE_PER_REQUEST) : photo_ids);
    const { data: sessionPhotos, error: photosError } = await supabaseAdmin
      .from("session_photos")
      .select("id, storage_path, thumb_path, preview_path")
      .eq("session_id", session.id);
    const photos = (sessionPhotos ?? []).filter((photo) => requested.has(photo.id));

    if (photosError) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch photos" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // 3. Generate a 1-hour signed URL for each photo, to the copy of the size asked for.
    //    Eight at a time: one after another took about 210 ms each, so a
    //    172-photo session kept the client waiting over half a minute.
    type PhotoFiles = { id: string; storage_path: string; thumb_path: string | null; preview_path: string | null };
    const signOne = async (photo: PhotoFiles) => {
      const path = (size === "large" ? photo.preview_path : photo.thumb_path) ?? photo.storage_path;
      const { data: urlData } = await supabaseAdmin.storage
        .from("session-photos")
        .createSignedUrl(path, 3600);
      return { photo_id: photo.id, signed_url: urlData?.signedUrl ?? null };
    };

    const queue = [...(photos ?? [])];
    const results: { photo_id: string; signed_url: string | null }[] = [];
    await Promise.all(
      Array.from({ length: Math.min(8, queue.length) }, async () => {
        for (let photo = queue.shift(); photo; photo = queue.shift()) {
          results.push(await signOne(photo));
        }
      }),
    );

    return new Response(JSON.stringify({ urls: results }), {
      status: 200,
      headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
    );
  }
});
