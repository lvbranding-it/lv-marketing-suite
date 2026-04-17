import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "lv_brand_kit";

interface BrandKit {
  logoDataUrl: string | null;
  logoFileName: string | null;
}

const DEFAULT: BrandKit = { logoDataUrl: null, logoFileName: null };

function load(): BrandKit {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT;
    return { ...DEFAULT, ...JSON.parse(raw) };
  } catch {
    return DEFAULT;
  }
}

function save(kit: BrandKit) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(kit));
  } catch {
    // localStorage full — silently fail
  }
}

/** Compress an image File to a base64 data URL, max 400px on longest side at 85% WebP quality. */
export async function compressImage(file: File): Promise<string> {
  // SVG and small files: use as-is
  if (file.type === "image/svg+xml" || file.size < 50_000) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Raster images: resize via canvas
  return new Promise((resolve, reject) => {
    const img = new Image();
    const objectUrl = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      const MAX = 500;
      const scale = Math.min(1, MAX / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      const ctx = canvas.getContext("2d");
      if (!ctx) { reject(new Error("canvas unavailable")); return; }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/webp", 0.85));
    };
    img.onerror = reject;
    img.src = objectUrl;
  });
}

export function useBrandKit() {
  const [kit, setKit] = useState<BrandKit>(load);

  const setLogo = useCallback((dataUrl: string, fileName: string) => {
    const next = { logoDataUrl: dataUrl, logoFileName: fileName };
    setKit(next);
    save(next);
  }, []);

  const clearLogo = useCallback(() => {
    const next = { logoDataUrl: null, logoFileName: null };
    setKit(next);
    save(next);
  }, []);

  return { ...kit, setLogo, clearLogo };
}
