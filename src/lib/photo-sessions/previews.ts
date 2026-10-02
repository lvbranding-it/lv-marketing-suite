// The small copies kept beside each session photo, made in the browser.
//
// Galleries used to ask Supabase to resize each photo they showed, and
// Supabase bills every distinct photo resized in a cycle beyond the plan's
// 100. A thumbnail for grids and a preview for a photo opened on its own are
// now made once, when the photo is uploaded, and stored next to the original.

export type PhotoCopy = "thumb" | "preview";

/** Longest side in pixels, and JPEG quality, of each copy. */
export const PHOTO_COPIES: Record<PhotoCopy, { edge: number; quality: number }> = {
  thumb: { edge: 600, quality: 0.78 },
  preview: { edge: 1600, quality: 0.85 },
};

/** Where a copy is stored: next to the original, so removing a photo can find it. */
export const copyPath = (storagePath: string, copy: PhotoCopy) => `${storagePath}.${copy}.jpg`;

/** Every file a photo has in storage: the original and its copies. */
export const photoFiles = (storagePath: string) => [storagePath, copyPath(storagePath, "thumb"), copyPath(storagePath, "preview")];

/** The size an image is drawn at so its longest side is at most `edge`. */
export function fitLongEdge({ width, height }: { width: number; height: number }, edge: number) {
  const scale = Math.min(1, edge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function drawCopy(bitmap: ImageBitmap, copy: PhotoCopy): Promise<Blob> {
  const { edge, quality } = PHOTO_COPIES[copy];
  const size = fitLongEdge({ width: bitmap.width, height: bitmap.height }, edge);
  const canvas = document.createElement("canvas");
  canvas.width = size.width;
  canvas.height = size.height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("This browser cannot prepare photo previews.");
  context.imageSmoothingQuality = "high";
  // JPEG has no transparency; a PNG's transparent areas become white, not black.
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, size.width, size.height);
  context.drawImage(bitmap, 0, 0, size.width, size.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", quality));
  if (!blob) throw new Error("The photo preview could not be made.");
  return blob;
}

/** A photo's thumbnail and preview, from the original file, turned the way the camera recorded it. */
export async function makePhotoCopies(original: Blob): Promise<Record<PhotoCopy, Blob>> {
  const bitmap = await createImageBitmap(original, { imageOrientation: "from-image" });
  try {
    return { preview: await drawCopy(bitmap, "preview"), thumb: await drawCopy(bitmap, "thumb") };
  } finally {
    bitmap.close();
  }
}
