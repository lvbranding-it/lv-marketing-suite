import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
    const { share_token, photo_ids } = await req.json() as {
      share_token: string;
      photo_ids: string[];
    };

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
    const requested = new Set(photo_ids);
    const { data: sessionPhotos, error: photosError } = await supabaseAdmin
      .from("session_photos")
      .select("id, storage_path")
      .eq("session_id", session.id);
    const photos = (sessionPhotos ?? []).filter((photo) => requested.has(photo.id));

    if (photosError) {
      return new Response(
        JSON.stringify({ error: "Failed to fetch photos" }),
        { status: 500, headers: { ...CORS_HEADERS, "Content-Type": "application/json" } }
      );
    }

    // 3. Generate a 1-hour signed URL for each photo, downscaled for grid thumbnails.
    //    Eight at a time: one after another took about 210 ms each, so a
    //    172-photo session kept the client waiting over half a minute.
    const signOne = async (photo: { id: string; storage_path: string }) => {
      const { data: urlData } = await supabaseAdmin.storage
        .from("session-photos")
        .createSignedUrl(photo.storage_path, 3600, {
          transform: { width: 600, height: 600, resize: "contain", quality: 70 },
        }); // 1 hour, resized for thumbnail grid

      let signedUrl = urlData?.signedUrl ?? null;

      // Fall back to a full-size signed URL if transformations aren't available
      if (!signedUrl) {
        const { data: fallback } = await supabaseAdmin.storage
          .from("session-photos")
          .createSignedUrl(photo.storage_path, 3600);
        signedUrl = fallback?.signedUrl ?? null;
      }

      return { photo_id: photo.id, signed_url: signedUrl };
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
