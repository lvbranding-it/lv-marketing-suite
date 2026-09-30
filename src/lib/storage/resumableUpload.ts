import * as tus from "tus-js-client";

/**
 * Uploads through Supabase's resumable endpoint.
 *
 * A single request carrying a few hundred megabytes shows no progress until it
 * is done and loses everything if the connection blinks. The resumable endpoint
 * sends 6 MB pieces, retries a failed piece rather than the whole file, and
 * reports progress as it goes. Supabase requires exactly 6 MB pieces.
 */
export const RESUMABLE_CHUNK = 6 * 1024 * 1024;

/**
 * Who is allowed to write the file: a signed-in person's session, or — for
 * someone who is not signed in, like a client on an upload link — the one-time
 * signature from createSignedUploadUrl, which is good for that one path only.
 */
export type ResumableUploadAuth = { accessToken: string } | { signature: string };

export function uploadResumable({
  bucket,
  objectName,
  file,
  contentType,
  auth,
  onProgress,
}: {
  bucket: string;
  objectName: string;
  file: File;
  contentType: string;
  auth: ResumableUploadAuth;
  onProgress?: (sent: number) => void;
}) {
  const signed = "signature" in auth;

  return new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: `${import.meta.env.VITE_SUPABASE_URL}/storage/v1/upload/resumable${signed ? "/sign" : ""}`,
      retryDelays: [0, 2000, 5000, 10000, 20000],
      headers: {
        apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
        ...(signed ? { "x-signature": auth.signature } : { authorization: `Bearer ${auth.accessToken}` }),
        "x-upsert": "false",
      },
      uploadDataDuringCreation: true,
      removeFingerprintOnSuccess: true,
      chunkSize: RESUMABLE_CHUNK,
      metadata: {
        bucketName: bucket,
        objectName,
        contentType,
        cacheControl: "3600",
      },
      onProgress: (sent) => onProgress?.(sent),
      onSuccess: () => resolve(),
      onError: (error) => {
        // The storage server explains a refusal in the response body; tus
        // wraps it in a long technical message the person cannot act on.
        const body = (error as tus.DetailedError).originalResponse?.getBody?.();
        const status = (error as tus.DetailedError).originalResponse?.getStatus?.();
        if (status === 413 || /maximum allowed size|too large/i.test(body ?? "")) {
          reject(new Error(`${file.name} is larger than the upload limit allows.`));
        } else {
          reject(new Error(body ? `Upload failed: ${body}` : error.message));
        }
      },
    });
    upload.start();
  });
}
