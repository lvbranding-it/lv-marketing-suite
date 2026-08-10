import QRCode from "qrcode";

// ── QR rendering, export encoding, and batch CSV helpers ────────────────────────
// Everything here runs in the browser — no upload, no server round-trip.

export const QR_CHARCOAL = "#231F20";
export const QR_WHITE    = "#FFFFFF";

export interface QrOptions {
  size?:        number;
  foreground?:  string;
  background?:  string;
  transparent?: boolean;
  logoDataUrl?: string;
}

export interface ContactFields {
  firstName:    string;
  lastName:     string;
  phone:        string;
  email:        string;
  organization: string;
  url:          string;
}

export const EMPTY_CONTACT: ContactFields = {
  firstName: "", lastName: "", phone: "", email: "", organization: "", url: "",
};

// ── Data encoding ───────────────────────────────────────────────────────────────

export function normalizeUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "";
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

export function buildVCard(c: ContactFields): string {
  return [
    "BEGIN:VCARD",
    "VERSION:3.0",
    `FN:${`${c.firstName} ${c.lastName}`.trim()}`,
    `N:${c.lastName};${c.firstName};;;`,
    `ORG:${c.organization}`,
    `TEL:${c.phone}`,
    `EMAIL:${c.email}`,
    `URL:${c.url}`,
    "END:VCARD",
  ].join("\n");
}

// ── Canvas rendering ────────────────────────────────────────────────────────────

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload  = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function roundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, width: number, height: number, radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + width, y, x + width, y + height, radius);
  ctx.arcTo(x + width, y + height, x, y + height, radius);
  ctx.arcTo(x, y + height, x, y, radius);
  ctx.arcTo(x, y, x + width, y, radius);
  ctx.closePath();
}

// The logo sits on a white plate so the surrounding modules stay readable.
// Plate = 30% of the code, logo = 22% — safe for level-H error correction.
async function drawLogoOnCanvas(canvas: HTMLCanvasElement, logoDataUrl?: string) {
  if (!logoDataUrl) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const logo     = await loadImage(logoDataUrl);
  const logoSize = Math.round(canvas.width * 0.22);
  const padding  = Math.round(logoSize * 0.18);
  const boxSize  = logoSize + padding * 2;
  const x = Math.round((canvas.width  - boxSize) / 2);
  const y = Math.round((canvas.height - boxSize) / 2);

  ctx.save();
  ctx.fillStyle = QR_WHITE;
  roundedRect(ctx, x, y, boxSize, boxSize, Math.round(boxSize * 0.12));
  ctx.fill();
  ctx.drawImage(logo, x + padding, y + padding, logoSize, logoSize);
  ctx.restore();
}

export async function renderQrCanvas(
  canvas: HTMLCanvasElement,
  text: string,
  options: QrOptions = {},
): Promise<HTMLCanvasElement> {
  const size       = options.size ?? 240;
  const foreground = options.foreground || QR_CHARCOAL;
  const background = options.transparent ? "#00000000" : (options.background || QR_WHITE);

  await QRCode.toCanvas(canvas, text, {
    width:  size,
    margin: 2,
    errorCorrectionLevel: options.logoDataUrl ? "H" : "M",
    color: { dark: foreground, light: background },
  });
  await drawLogoOnCanvas(canvas, options.logoDataUrl);
  return canvas;
}

export function canvasToBlob(
  canvas: HTMLCanvasElement,
  type = "image/png",
  quality?: number,
): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** Render off-screen at any resolution — used by every export path. */
export async function renderQrBlob(
  text: string,
  options: QrOptions & { type?: string; quality?: number } = {},
): Promise<Blob | null> {
  const canvas = document.createElement("canvas");
  await renderQrCanvas(canvas, text, options);
  return canvasToBlob(canvas, options.type ?? "image/png", options.quality);
}

// ── SVG ─────────────────────────────────────────────────────────────────────────

/**
 * qrcode emits a module-unit viewBox (e.g. `0 0 33 33`), so logo coordinates have
 * to be derived from it rather than from the pixel width.
 */
function embedLogoInSvg(svg: string, logoDataUrl: string): string {
  const viewBox = svg.match(/viewBox="0 0 ([\d.]+) /);
  if (!viewBox) return svg;

  const size    = parseFloat(viewBox[1]);
  const boxSize = size * 0.30;
  const logo    = size * 0.22;
  const boxXY   = (size - boxSize) / 2;
  const logoXY  = (size - logo) / 2;

  return svg.replace(
    "</svg>",
    `<rect x="${boxXY}" y="${boxXY}" width="${boxSize}" height="${boxSize}" rx="${boxSize * 0.12}" fill="${QR_WHITE}"/>` +
      `<image href="${logoDataUrl}" x="${logoXY}" y="${logoXY}" width="${logo}" height="${logo}"/></svg>`,
  );
}

export async function buildQrSvg(text: string, options: QrOptions = {}): Promise<string> {
  const svg = await QRCode.toString(text, {
    type:   "svg",
    width:  options.size ?? 1024,
    margin: 2,
    errorCorrectionLevel: options.logoDataUrl ? "H" : "M",
    color: {
      dark:  options.foreground || QR_CHARCOAL,
      light: options.transparent ? "#00000000" : (options.background || QR_WHITE),
    },
  });
  return options.logoDataUrl ? embedLogoInSvg(svg, options.logoDataUrl) : svg;
}

// ── PDF (single-page, JPEG-embedded — avoids pulling in a PDF library) ──────────

function binaryStringFromBytes(bytes: Uint8Array): string {
  let out = "";
  const CHUNK = 8192;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    out += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return out;
}

export function createPdfBlobFromJpeg(
  jpegBytes: Uint8Array,
  imageWidth: number,
  imageHeight: number,
): Blob {
  const pageSize  = 612;
  const imageSize = 360;
  const imageX    = (pageSize - imageSize) / 2;
  const imageY    = (pageSize - imageSize) / 2;
  const imageData = binaryStringFromBytes(jpegBytes);
  const drawImageCommand = `q\n${imageSize} 0 0 ${imageSize} ${imageX} ${imageY} cm\n/Im0 Do\nQ`;

  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${pageSize} ${pageSize}] /Resources << /XObject << /Im0 4 0 R >> >> /Contents 5 0 R >>`,
    `<< /Type /XObject /Subtype /Image /Width ${imageWidth} /Height ${imageHeight} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpegBytes.length} >>\nstream\n${imageData}\nendstream`,
    `<< /Length ${drawImageCommand.length} >>\nstream\n${drawImageCommand}\nendstream`,
  ];

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  offsets.forEach((offset) => {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return new Blob([Uint8Array.from(pdf, (char) => char.charCodeAt(0))], { type: "application/pdf" });
}

// ── Files ───────────────────────────────────────────────────────────────────────

export function downloadBlob(blob: Blob, filename: string) {
  const link = document.createElement("a");
  link.download = filename;
  link.href = URL.createObjectURL(blob);
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

export function sanitizeFilename(value: string, fallback = "qr-code"): string {
  return (
    (value || fallback)
      .trim()
      .replace(/^https?:\/\//i, "")
      .replace(/[^a-z0-9-_]+/gi, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || fallback
  );
}

// ── Batch CSV ───────────────────────────────────────────────────────────────────

export interface BatchRow {
  name:  string;
  value: string;
}

/** Accepts `filename,value` rows or one bare value per line; skips the header row. */
export function parseCsvBatch(input: string): BatchRow[] {
  return input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line, index) => !(index === 0 && /^filename\s*,\s*value$/i.test(line)))
    .map((line, index) => {
      const [nameOrValue, ...rest] = line.split(",").map((part) => part.trim());
      const value = rest.length ? rest.join(",").trim() : nameOrValue;
      const name  = rest.length ? nameOrValue : `qr-${index + 1}`;
      return { name, value };
    })
    .filter((row) => row.value);
}

export function createCsvTemplate(): string {
  return [
    "filename,value",
    "homepage,https://lvbranding.com",
    "contact-email,mailto:hello@lvbranding.com",
    "client-phone,tel:+15551234567",
    "welcome-message,Welcome to LV Branding",
  ].join("\n");
}
