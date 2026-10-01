/**
 * Rules for getting a batch of files into a photo session.
 *
 * A session can be 170-odd photos uploaded in one go. The upload used to start
 * every file at once, drop files it would not take without a word, and clear
 * its failure list two seconds after the batch ended. These are the pieces that
 * replace that: what a file is refused for, in words; the order a shoot keeps;
 * and a runner that keeps a few uploads in flight instead of all of them.
 */

/** Matches the session-photos bucket's own limit. */
export const PHOTO_MAX_BYTES = 15 * 1024 * 1024;
/** Matches the session-deliverables bucket's own limit. */
export const DELIVERABLE_MAX_BYTES = 50 * 1024 * 1024;

const MB = 1024 * 1024;
const megabytes = (bytes: number) => `${(bytes / MB).toFixed(1)} MB`;

const extensionOf = (name: string) => name.split(".").pop()?.toLowerCase() ?? "";
const isHeic = (file: Pick<File, "name" | "type">) => /hei[cf]/i.test(file.type) || ["heic", "heif"].includes(extensionOf(file.name));

const PHOTO_TYPES_BY_EXTENSION: Record<string, string> = {
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp",
};

/**
 * The type a session photo is stored under, or null when it is not one the
 * client's browser can show. Some systems hand over a JPEG with no type at all;
 * the extension decides then.
 */
export function photoContentType(file: Pick<File, "name" | "type">): string | null {
  if (isHeic(file)) return null;
  if (file.type === "image/jpg") return "image/jpeg";
  if (["image/jpeg", "image/png", "image/webp"].includes(file.type)) return file.type;
  if (!file.type) return PHOTO_TYPES_BY_EXTENSION[extensionOf(file.name)] ?? null;
  return null;
}

/** Why a photo will not be uploaded, or null when it will. */
export function photoProblem(file: Pick<File, "name" | "type" | "size">): string | null {
  // Accepted before, and then shown as a broken picture to every client not on Safari.
  if (isHeic(file)) return "HEIC photos do not show in Chrome or Firefox. Export them as JPEG.";
  if (!photoContentType(file)) return "Not a JPEG, PNG or WebP image.";
  if (file.size === 0) return "This file is empty.";
  if (file.size > PHOTO_MAX_BYTES) return `${megabytes(file.size)} is over the 15 MB limit. Export it smaller.`;
  return null;
}

const DELIVERABLE_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/tiff", "image/heic", "image/heif"];
const DELIVERABLE_EXTENSIONS = ["jpg", "jpeg", "png", "webp", "tif", "tiff", "heic", "heif"];

/** Why a deliverable will not be uploaded, or null when it will. */
export function deliverableProblem(file: Pick<File, "name" | "type" | "size">): string | null {
  const typeOk = DELIVERABLE_TYPES.includes(file.type) || (!file.type && DELIVERABLE_EXTENSIONS.includes(extensionOf(file.name)));
  if (!typeOk) return "Not a JPEG, PNG, WebP, TIFF or HEIC image.";
  if (file.size === 0) return "This file is empty.";
  if (file.size > DELIVERABLE_MAX_BYTES) return `${megabytes(file.size)} is over the 50 MB limit.`;
  return null;
}

/**
 * The order a shoot was taken in: by file name, with numbers read as numbers,
 * so IMG_2 comes before IMG_10. Photos are numbered in this order before they
 * upload; they used to be shown in whatever order their uploads finished.
 */
export const byFileName = (a: Pick<File, "name">, b: Pick<File, "name">) =>
  a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: "base" });

/**
 * Runs `worker` on every item with at most `concurrency` in flight. Never
 * rejects: a failure is collected and the rest carry on, because in a batch of
 * 172 one bad file should not stop the other 171.
 */
export async function runLimited<T>(
  items: T[],
  concurrency: number,
  worker: (item: T, index: number) => Promise<void>,
): Promise<Array<{ item: T; error: unknown }>> {
  const failures: Array<{ item: T; error: unknown }> = [];
  let next = 0;
  const lane = async () => {
    while (next < items.length) {
      const index = next++;
      try {
        await worker(items[index], index);
      } catch (error) {
        failures.push({ item: items[index], error });
      }
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(concurrency, items.length)) }, lane));
  return failures;
}

/** An error as one short line for a person, whatever shape it arrived in. */
export function uploadErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : typeof error === "object" && error && "message" in error ? String((error as { message: unknown }).message) : "";
  if (/maximum allowed size|too large|413/i.test(message)) return "Over the size limit.";
  if (/mime type|not supported/i.test(message)) return "This file type is not accepted.";
  if (/failed to fetch|network|timeout/i.test(message)) return "The connection dropped. Retry it.";
  return message || "Upload failed.";
}
