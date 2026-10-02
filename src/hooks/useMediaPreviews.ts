import { useEffect, useState } from "react";
import { readMediaSize } from "@/lib/socialMedia";
import type { PreviewMedia } from "@/components/social/SocialPostPreview";

/** The same file picked twice is one file. */
export const mediaFileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`;

/**
 * A local address and the width and height of each picked file, for the
 * composer's thumbnails and previews. The addresses are released when the
 * files change or the composer closes.
 */
export function useMediaPreviews(files: File[]): PreviewMedia[] {
  const [items, setItems] = useState<PreviewMedia[]>([]);

  useEffect(() => {
    let cancelled = false;
    const urls = files.map((file) => URL.createObjectURL(file));
    setItems(files.map((file, index) => ({
      key: mediaFileKey(file),
      url: urls[index],
      kind: file.type.startsWith("video/") ? "video" : "image",
      name: file.name,
    })));
    Promise.all(files.map(readMediaSize)).then((sizes) => {
      if (cancelled) return;
      setItems((current) => current.map((item, index) => ({ ...item, size: sizes[index] })));
    });
    return () => {
      cancelled = true;
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [files]);

  return items;
}
