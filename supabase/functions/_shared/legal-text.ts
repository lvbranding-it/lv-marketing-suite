// LegalSigns text rules with no network imports, so they can be tested:
// the fingerprint's JSON, signature checks, and text for the PDF fonts.

export type Signature = { type: "draw" | "type"; value: string };

/** The same JSON for the same content, whatever order its keys were written in. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    return `{${Object.keys(value as Record<string, unknown>).sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson((value as Record<string, unknown>)[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

/** A checked signature, or null: a drawn PNG under 300 KB or a typed name. */
export function validSignature(signature: unknown): Signature | null {
  const value = signature as Partial<Signature> | null;
  if (!value || typeof value.value !== "string") return null;
  if (value.type === "type") {
    const name = value.value.trim();
    return name.length >= 2 && name.length <= 120 ? { type: "type", value: name } : null;
  }
  if (value.type === "draw") {
    return /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(value.value) && value.value.length <= 400_000
      ? { type: "draw", value: value.value }
      : null;
  }
  return null;
}

const WINANSI_EXTRA = "€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ";
const latin1 = (codePoint: number) =>
  (codePoint >= 0x20 && codePoint <= 0x7e) || (codePoint >= 0xa0 && codePoint <= 0xff) || WINANSI_EXTRA.includes(String.fromCodePoint(codePoint));

/**
 * Text a PDF font can draw: odd spaces become plain ones, line breaks stay,
 * and any character the font has no glyph for becomes "?" instead of
 * breaking the PDF.
 */
export function keepDrawable(text: string, canDraw: (codePoint: number) => boolean) {
  return [...text.replace(/[\u00a0\u2007\u2009\u202f]/g, " ")]
    .map((char) => (char === "\n" || canDraw(char.codePointAt(0)!) ? char : "?"))
    .join("");
}

/** Text the PDF's built-in fonts can draw: Latin-1, which covers Spanish, plus a few marks. */
export const pdfSafe = (text: string) => keepDrawable(text, latin1);

/**
 * How wide pdf-lib draws a line. Its widthOfTextAtSize subtracts kerning that
 * drawText never applies, so a whole-line measure comes out short ("Type:"
 * then ran into the value after it). One character at a time matches the drawing.
 */
export function drawnWidth(text: string, charWidth: (char: string) => number) {
  let width = 0;
  for (const char of text) width += charWidth(char);
  return width;
}

/** Lines of at most `maxWidth`, breaking at spaces, and inside a word only when it alone is too long. */
export function wrapText(text: string, measure: (line: string) => number, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split("\n")) {
    let line = "";
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const next = line ? `${line} ${word}` : word;
      if (measure(next) <= maxWidth) { line = next; continue; }
      if (line) lines.push(line);
      let rest = word;
      while (measure(rest) > maxWidth && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && measure(rest.slice(0, cut)) > maxWidth) cut--;
        lines.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    lines.push(line);
  }
  return lines;
}
