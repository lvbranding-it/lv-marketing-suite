// A LegalSigns signature: a typed name or a drawn PNG. The server accepts the
// same two shapes (supabase/functions/_shared/legal-text.ts, validSignature).

export interface LegalSignature {
  type: "type" | "draw";
  value: string;
}

export type Point = { x: number; y: number };
export type Stroke = Point[];

/** The server refuses drawn signatures longer than this. */
export const MAX_DRAWN_SIGNATURE_LENGTH = 400_000;

export function signatureReady(signature: LegalSignature | null): signature is LegalSignature {
  if (!signature) return false;
  if (signature.type === "type") return signature.value.trim().length >= 2;
  return signature.value.startsWith("data:image/png;base64,") && signature.value.length <= MAX_DRAWN_SIGNATURE_LENGTH;
}

/** The box around every point drawn, padded; null when nothing was drawn. */
export function strokeBounds(strokes: Stroke[], padding: number) {
  const points = strokes.flat();
  if (!points.length) return null;
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const left = Math.min(...xs) - padding;
  const top = Math.min(...ys) - padding;
  return { left, top, width: Math.max(...xs) + padding - left, height: Math.max(...ys) + padding - top };
}

/** A dot or a scribble too small to be a signature. */
export function tooSmall(strokes: Stroke[]) {
  const box = strokeBounds(strokes, 0);
  return !box || (box.width < 24 && box.height < 24);
}
