// Media for Social Publisher: Instagram's image rules, the JPEG copy made for
// Instagram, and the size of each file for the composer's previews.
//
// Instagram's publishing API takes JPEG images only, between 4:5 portrait and
// 1.91:1 landscape, at most 1440 pixels wide and 8 MB (Meta's IG User Media
// reference). The composer used to refuse PNGs outright; now Instagram gets a
// JPEG copy and Facebook keeps the original.

export const INSTAGRAM_IMAGE = {
  minRatio: 4 / 5,
  maxRatio: 1.91,
  maxWidth: 1440,
  maxBytes: 8 * 1024 * 1024,
} as const;

export interface MediaSize {
  width: number;
  height: number;
}

/** Why Instagram would refuse an image of this size for the feed, or null. */
export function instagramRatioProblem({ width, height }: MediaSize, fileName: string): string | null {
  if (!width || !height) return null;
  const ratio = width / height;
  // A little slack, so an image Meta rounds to 4:5 or 1.91:1 is not refused here.
  if (ratio < INSTAGRAM_IMAGE.minRatio - 0.005) {
    return `${fileName} is too tall for an Instagram feed post (${width}×${height}). Crop it to 4:5 or wider.`;
  }
  if (ratio > INSTAGRAM_IMAGE.maxRatio + 0.005) {
    return `${fileName} is too wide for an Instagram feed post (${width}×${height}). Crop it to 1.91:1 or narrower.`;
  }
  return null;
}

/** Whether Instagram needs a JPEG copy of this image: another format, too wide, or too large. */
export function needsInstagramCopy(file: Pick<File, "type" | "size">, size?: MediaSize): boolean {
  if (!file.type.startsWith("image/")) return false;
  return file.type !== "image/jpeg" || file.size > INSTAGRAM_IMAGE.maxBytes || (size?.width ?? 0) > INSTAGRAM_IMAGE.maxWidth;
}

/** The size an image is drawn at so it is no wider than `maxWidth`. */
export function fitWidth({ width, height }: MediaSize, maxWidth: number): MediaSize {
  if (width <= maxWidth) return { width, height };
  return { width: maxWidth, height: Math.round((height * maxWidth) / width) };
}

export const jpegFileName = (name: string) => `${name.replace(/\.[^./]+$/, "") || "image"}.jpg`;

/** The width and height of an image or video, read in the browser. */
export function readMediaSize(file: File): Promise<MediaSize | undefined> {
  const url = URL.createObjectURL(file);
  const done = <T,>(value: T) => {
    URL.revokeObjectURL(url);
    return value;
  };
  if (file.type.startsWith("image/")) {
    return new Promise((resolve) => {
      const image = new Image();
      image.onload = () => resolve(done({ width: image.naturalWidth, height: image.naturalHeight }));
      image.onerror = () => resolve(done(undefined));
      image.src = url;
    });
  }
  if (file.type.startsWith("video/")) {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.preload = "metadata";
      video.onloadedmetadata = () => resolve(done({ width: video.videoWidth, height: video.videoHeight }));
      video.onerror = () => resolve(done(undefined));
      video.src = url;
    });
  }
  return Promise.resolve(done(undefined));
}

/**
 * The image as Instagram takes it: the original when it already fits, or a
 * JPEG copy no wider than 1440 pixels and under 8 MB. Transparent areas of a
 * PNG become white, as JPEG has no transparency.
 */
export async function instagramImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  const bitmap = await createImageBitmap(file);
  const original = { width: bitmap.width, height: bitmap.height };
  if (!needsInstagramCopy(file, original)) {
    bitmap.close();
    return file;
  }
  const size = fitWidth(original, INSTAGRAM_IMAGE.maxWidth);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error(`${file.name} could not be prepared for Instagram.`);
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  bitmap.close();

  for (const quality of [0.92, 0.85, 0.75, 0.65]) {
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
    if (blob && blob.size <= INSTAGRAM_IMAGE.maxBytes) {
      return new File([blob], jpegFileName(file.name), { type: "image/jpeg", lastModified: file.lastModified });
    }
  }
  throw new Error(`${file.name} is still over 8 MB as a JPEG. Use a smaller image for Instagram.`);
}
