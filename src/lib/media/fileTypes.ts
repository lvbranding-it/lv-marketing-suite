/**
 * Telling what kind of file someone picked, for the pages that accept video.
 *
 * A browser's own answer (File.type) is not enough on its own: some report no
 * type at all for a .mov, so the extension is checked as well.
 */

export const VIDEO_TYPES_BY_EXTENSION: Record<string, string> = {
  mp4: "video/mp4",
  m4v: "video/x-m4v",
  mov: "video/quicktime",
  webm: "video/webm",
  mpeg: "video/mpeg",
  mpg: "video/mpeg",
  ogv: "video/ogg",
};

export function extensionOf(name: string) {
  return name.split(".").pop()?.toLowerCase() ?? "";
}

export function isVideoFile(file: Pick<File, "name" | "type">) {
  return file.type.startsWith("video/") || extensionOf(file.name) in VIDEO_TYPES_BY_EXTENSION;
}

/**
 * The type a file is stored under.
 *
 * Stored as a generic binary, a .mov with no reported type would still upload,
 * but a preview would be handed a file it cannot tell is a video, and Safari
 * will not play it.
 */
export function contentTypeFor(file: Pick<File, "name" | "type">) {
  if (file.type) return file.type;
  return VIDEO_TYPES_BY_EXTENSION[extensionOf(file.name)] ?? "application/octet-stream";
}
