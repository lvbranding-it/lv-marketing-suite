import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const BUCKET = "client-uploads";

/**
 * The limits the upload page shows. Everything that is not a video keeps the
 * limit it always had; the bucket itself is capped at the video figure.
 */
const FILE_MAX_BYTES = 50 * 1024 * 1024;
const VIDEO_MAX_BYTES = 500 * 1024 * 1024;
const VIDEO_EXTENSION = /\.(mp4|m4v|mov|webm|mpeg|mpg|ogv)$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

interface FileRequest {
  id: string;
  org_id: string;
}

/** The request behind a link, or the response that explains why it cannot take files. */
async function openRequest(
  supabase: SupabaseClient,
  token: string,
): Promise<{ request: FileRequest } | { refusal: Response }> {
  const { data: request, error } = await supabase
    .from("file_requests")
    .select("id, org_id, status, expires_at")
    .eq("token", token)
    .single();

  if (error || !request) return { refusal: json({ error: "Invalid link" }, 404) };
  if (request.status !== "active") return { refusal: json({ error: "This link is no longer active" }, 410) };
  if (request.expires_at && new Date(request.expires_at) < new Date()) {
    return { refusal: json({ error: "This link has expired" }, 410) };
  }
  return { request };
}

const storagePathFor = (request: FileRequest, fileName: string) =>
  `${request.org_id}/${request.id}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

/**
 * Step one of a direct upload: check the link and the size, and hand back a
 * one-time signature that lets the browser write this one path. The file then
 * goes straight to storage in resumable pieces instead of through this
 * function, which had to hold all of it in memory.
 */
async function startUpload(supabase: SupabaseClient, body: Record<string, unknown>) {
  const token = String(body.token ?? "");
  const fileName = String(body.file_name ?? "");
  const fileSize = Number(body.file_size);
  const contentType = String(body.content_type ?? "");
  if (!token || !fileName || !(fileSize > 0)) return json({ error: "Missing required fields" }, 400);

  const opened = await openRequest(supabase, token);
  if ("refusal" in opened) return opened.refusal;

  const isVideo = contentType.startsWith("video/") || VIDEO_EXTENSION.test(fileName);
  const limit = isVideo ? VIDEO_MAX_BYTES : FILE_MAX_BYTES;
  if (fileSize > limit) {
    return json({ error: `${fileName} is over the ${limit / 1024 / 1024} MB limit for ${isVideo ? "videos" : "files"}.` }, 413);
  }

  const path = storagePathFor(opened.request, fileName);
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(path);
  if (error) throw error;
  return json({ ok: true, path, signature: data.token });
}

/**
 * Step two: record a file the browser has finished sending. The size and type
 * come from storage, not from the browser, and only a path inside this
 * request's own folder is accepted.
 *
 * Links go to existing clients, so the page no longer asks who is sending: the
 * request itself says whose files these are. The name and email columns are
 * kept for the submissions that have them and left empty otherwise.
 */
async function finishUpload(supabase: SupabaseClient, body: Record<string, unknown>) {
  const token = String(body.token ?? "");
  const path = String(body.path ?? "");
  const fileName = String(body.file_name ?? "");
  const uploaderName = String(body.uploader_name ?? "").trim();
  const uploaderEmail = String(body.uploader_email ?? "").trim();
  const message = typeof body.message === "string" && body.message.trim() ? body.message.trim() : null;
  if (!token || !path || !fileName) {
    return json({ error: "Missing required fields" }, 400);
  }

  const opened = await openRequest(supabase, token);
  if ("refusal" in opened) return opened.refusal;

  const folder = `${opened.request.org_id}/${opened.request.id}`;
  const objectName = path.slice(folder.length + 1);
  if (!path.startsWith(`${folder}/`) || !objectName || objectName.includes("/")) {
    return json({ error: "Invalid upload" }, 400);
  }

  const { data: objects, error: listErr } = await supabase.storage
    .from(BUCKET)
    .list(folder, { search: objectName, limit: 10 });
  if (listErr) throw listErr;
  const stored = objects?.find((object) => object.name === objectName);
  if (!stored) return json({ error: "The file did not finish uploading. Try again." }, 409);

  // A retry after a lost response sends this twice; the file is recorded once.
  const { data: existing } = await supabase
    .from("file_submissions")
    .select("id")
    .eq("file_path", path)
    .maybeSingle();

  if (!existing) {
    const { error: insertErr } = await supabase.from("file_submissions").insert({
      request_id: opened.request.id,
      file_name: fileName,
      file_size: Number(stored.metadata?.size ?? 0),
      mime_type: stored.metadata?.mimetype ?? null,
      file_path: path,
      uploader_name: uploaderName,
      uploader_email: uploaderEmail,
      message,
    });
    if (insertErr) throw insertErr;
  }

  return json({ ok: true });
}

/**
 * The original one-request upload: the whole file in a form post. The page no
 * longer sends this, but a tab opened before the change still does.
 */
async function formUpload(supabase: SupabaseClient, req: Request) {
  const formData = await req.formData();
  const token = formData.get("token") as string;
  const uploaderName = formData.get("uploader_name") as string;
  const uploaderEmail = formData.get("uploader_email") as string;
  const message = formData.get("message") as string | null;
  const file = formData.get("file") as File;

  if (!token || !uploaderName || !uploaderEmail || !file) {
    return json({ error: "Missing required fields" }, 400);
  }

  const opened = await openRequest(supabase, token);
  if ("refusal" in opened) return opened.refusal;

  const filePath = storagePathFor(opened.request, file.name);
  const fileBuffer = await file.arrayBuffer();
  const { error: uploadErr } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, fileBuffer, { contentType: file.type || "application/octet-stream" });
  if (uploadErr) throw uploadErr;

  const { error: insertErr } = await supabase.from("file_submissions").insert({
    request_id: opened.request.id,
    file_name: file.name,
    file_size: file.size,
    mime_type: file.type || null,
    file_path: filePath,
    uploader_name: uploaderName,
    uploader_email: uploaderEmail,
    message: message || null,
  });
  if (insertErr) throw insertErr;

  return json({ ok: true });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (!req.headers.get("content-type")?.includes("application/json")) {
      return await formUpload(supabase, req);
    }

    const body = await req.json();
    if (body?.action === "start") return await startUpload(supabase, body);
    if (body?.action === "finish") return await finishUpload(supabase, body);
    return json({ error: "Unknown action" }, 400);
  } catch (err) {
    return json({ error: String(err) }, 500);
  }
});
