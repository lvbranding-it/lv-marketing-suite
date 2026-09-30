/**
 * Sending files through a client upload link (/upload/:token).
 *
 * The page used to post each file to the client-upload function, which read
 * the whole file into memory and saved it from there. That was fine for a logo
 * and not for a few hundred megabytes of video. The function now only checks
 * the link and hands back a one-time signature for one storage path; the
 * browser sends the file straight to storage in resumable pieces, then asks the
 * function to record it.
 */
import { contentTypeFor, isVideoFile } from "@/lib/media/fileTypes";
import { uploadResumable } from "@/lib/storage/resumableUpload";

export const CLIENT_UPLOAD_BUCKET = "client-uploads";

/** Everything that is not a video keeps the limit it always had. */
export const CLIENT_FILE_MAX_BYTES = 50 * 1024 * 1024;
/** Video gets more room. The client-upload function and the bucket hold the same figures. */
export const CLIENT_VIDEO_MAX_BYTES = 500 * 1024 * 1024;

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export function uploadLimitFor(file: Pick<File, "name" | "type">) {
  return isVideoFile(file) ? CLIENT_VIDEO_MAX_BYTES : CLIENT_FILE_MAX_BYTES;
}

/**
 * Why a file cannot be sent, in words the client can act on — or null when it
 * can. Checked as files are picked, so nobody waits through an upload that the
 * server was always going to refuse.
 */
export function uploadProblem(file: Pick<File, "name" | "type" | "size">): string | null {
  if (file.size === 0) return "This file is empty.";
  if (file.size <= uploadLimitFor(file)) return null;
  return isVideoFile(file)
    ? `Videos can be up to ${formatBytes(CLIENT_VIDEO_MAX_BYTES)}. Export a smaller version, or paste a download link in the message.`
    : `Files can be up to ${formatBytes(CLIENT_FILE_MAX_BYTES)} (videos up to ${formatBytes(CLIENT_VIDEO_MAX_BYTES)}).`;
}

async function callClientUpload<T>(body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/client-upload`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.ok) throw new Error(json.error ?? "Upload failed");
  return json as T;
}

/**
 * Send one file and record it against the request.
 *
 * Once the file is in storage its path is reported through onStored. A retry
 * that passes that path back as storedPath only records the file, instead of
 * sending a few hundred megabytes a second time because the last step failed.
 */
export async function sendClientFile({
  token,
  file,
  message,
  storedPath,
  onStored,
  onProgress,
}: {
  token: string;
  file: File;
  /** The client's optional note for the team. */
  message?: string;
  storedPath?: string;
  onStored?: (path: string) => void;
  onProgress?: (sent: number) => void;
}) {
  let path = storedPath;
  if (!path) {
    const contentType = contentTypeFor(file);
    const start = await callClientUpload<{ path: string; signature: string }>({
      action: "start",
      token,
      file_name: file.name,
      file_size: file.size,
      content_type: contentType,
    });
    await uploadResumable({
      bucket: CLIENT_UPLOAD_BUCKET,
      objectName: start.path,
      file,
      contentType,
      auth: { signature: start.signature },
      onProgress,
    });
    path = start.path;
    onStored?.(path);
  }

  await callClientUpload({
    action: "finish",
    token,
    path,
    file_name: file.name,
    message: message?.trim() || null,
  });
}
