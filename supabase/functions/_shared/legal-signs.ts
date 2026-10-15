// LegalSigns, shared by legal-signs (the team's actions) and legal-sign (the
// client's signing page): link tokens, content fingerprints, emails and the
// signed PDF with its certificate of completion.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "https://esm.sh/pdf-lib@1.17.1";
import { canonicalJson, drawnWidth, pdfSafe, wrapText, type Signature } from "./legal-text.ts";

export { canonicalJson, pdfSafe, validSignature, wrapText, type Signature } from "./legal-text.ts";

export type Language = "en" | "es";
export type Block =
  | { kind: "title"; text: string }
  | { kind: "meta"; label: string; text: string }
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string };
/** What a document says, fixed when it is sent; content_hash is its SHA-256. */
export interface Content {
  blocks: Block[];
  signerRole: string;
  countersignerRole: string;
}

export const APP_URL = Deno.env.get("APP_URL") || "https://marketing.lvbranding.com";
const RED = rgb(0.796, 0.125, 0.224);
const INK = rgb(0.11, 0.1, 0.1);
const MUTED = rgb(0.42, 0.4, 0.41);

export const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

// ── Tokens and fingerprints ─────────────────────────────────────────────────

export async function sha256Hex(text: string | Uint8Array) {
  const bytes = typeof text === "string" ? new TextEncoder().encode(text) : text;
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** A link token (in the email only) and its hash (in the database only). */
export async function newToken() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  const token = btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  return { token, hash: await sha256Hex(token) };
}

export const contentHash = (content: Content) => sha256Hex(canonicalJson(content));

/** Where a request came from, for the audit trail. */
export function requestOrigin(req: Request) {
  const forwarded = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ip: forwarded || req.headers.get("cf-connecting-ip") || null,
    userAgent: req.headers.get("user-agent")?.slice(0, 400) || null,
  };
}

// ── Email ───────────────────────────────────────────────────────────────────

const escapeHtml = (value: unknown) =>
  String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

export async function sendEmail(message: {
  to: { email: string; name?: string };
  subject: string;
  html: string;
  attachments?: { content: string; filename: string; type: string }[];
}) {
  const key = Deno.env.get("SENDGRID_API_KEY");
  if (!key) throw new Error("Email is not configured (SENDGRID_API_KEY)");
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [message.to] }],
      from: { email: Deno.env.get("LEGAL_SIGNS_FROM_EMAIL") || Deno.env.get("SENDGRID_FROM_EMAIL") || "admin@lvbranding.com", name: "LV Branding" },
      subject: message.subject,
      content: [{ type: "text/html", value: message.html }],
      ...(message.attachments?.length ? { attachments: message.attachments.map((file) => ({ ...file, disposition: "attachment" })) } : {}),
      // Signing links must reach the signer as written; a rewritten tracking
      // link works only while the tracking domain's certificate is valid.
      tracking_settings: { click_tracking: { enable: false, enable_text: false } },
    }),
  });
  if (!response.ok) throw new Error(`SendGrid refused the email (${response.status}): ${(await response.text()).slice(0, 200)}`);
}

function emailLayout(body: string) {
  return `<div style="font-family:Arial,Helvetica,sans-serif;max-width:560px;margin:0 auto;padding:32px 24px;color:#1c1a1b;line-height:1.55">
  <p style="margin:0 0 24px;font-size:13px;font-weight:700;letter-spacing:.08em;color:#cb2039">LV BRANDING</p>
  ${body}
  <p style="margin:32px 0 0;font-size:12px;color:#6b6668">LV Branding LLC · Houston, Texas · <a href="https://www.lvbranding.com" style="color:#6b6668">lvbranding.com</a></p>
</div>`;
}
const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:#cb2039;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:8px">${escapeHtml(label)}</a></p>`;

export const longDate = (iso: string, language: Language) =>
  new Intl.DateTimeFormat(language === "es" ? "es-US" : "en-US", { dateStyle: "long", timeZone: "America/Chicago" }).format(new Date(iso));

export function signatureRequestEmail(doc: { title: string; recipient_name: string; company_name: string; language: Language; expires_at: string }, link: string) {
  const es = doc.language === "es";
  const company = doc.company_name ? (es ? ` para ${escapeHtml(doc.company_name)}` : ` for ${escapeHtml(doc.company_name)}`) : "";
  return {
    subject: es ? `LV Branding le envió un documento para firmar: ${doc.title}` : `LV Branding sent you a document to sign: ${doc.title}`,
    html: emailLayout(es
      ? `<p>Hola ${escapeHtml(doc.recipient_name)}:</p>
<p>LV Branding le envió <strong>${escapeHtml(doc.title)}</strong>${company} para revisar y firmar en línea.</p>
${button(link, "Revisar y firmar")}
<p style="font-size:13px;color:#6b6668">El enlace es personal y vence el ${escapeHtml(longDate(doc.expires_at, "es"))}. Si no esperaba este documento, puede ignorar este correo.</p>`
      : `<p>Hi ${escapeHtml(doc.recipient_name)},</p>
<p>LV Branding has sent you the <strong>${escapeHtml(doc.title)}</strong>${company} to review and sign online.</p>
${button(link, "Review and sign")}
<p style="font-size:13px;color:#6b6668">This link is personal and expires on ${escapeHtml(longDate(doc.expires_at, "en"))}. If you weren't expecting this document, you can ignore this email.</p>`),
  };
}

export function signedByClientEmail(doc: { id: string; title: string; recipient_name: string; company_name: string }) {
  return {
    subject: `${doc.recipient_name} signed ${doc.title}. Countersign to complete it`,
    html: emailLayout(`<p><strong>${escapeHtml(doc.recipient_name)}</strong>${doc.company_name ? ` (${escapeHtml(doc.company_name)})` : ""} signed the <strong>${escapeHtml(doc.title)}</strong>.</p>
<p>It is complete once LV Branding countersigns it; both sides then get the signed PDF.</p>
${button(`${APP_URL}/legal-signs?document=${doc.id}`, "Countersign in LegalSigns")}`),
  };
}

export function clientReceiptEmail(doc: { title: string; recipient_name: string; language: Language }) {
  const es = doc.language === "es";
  return {
    subject: es ? `Recibimos su firma: ${doc.title}` : `We received your signature: ${doc.title}`,
    html: emailLayout(es
      ? `<p>Hola ${escapeHtml(doc.recipient_name)}:</p><p>Gracias por firmar <strong>${escapeHtml(doc.title)}</strong>. LV Branding lo firmará a continuación y le enviaremos por correo la copia final firmada por ambas partes.</p>`
      : `<p>Hi ${escapeHtml(doc.recipient_name)},</p><p>Thank you for signing the <strong>${escapeHtml(doc.title)}</strong>. LV Branding will countersign it next, and we'll email you the final copy signed by both sides.</p>`),
  };
}

export function completedEmail(doc: { title: string; recipient_name: string }, language: Language, forTeam: boolean) {
  const es = language === "es";
  return {
    subject: es ? `Documento firmado: ${doc.title}` : `Signed: ${doc.title}`,
    html: emailLayout(forTeam
      ? `<p>The <strong>${escapeHtml(doc.title)}</strong> with ${escapeHtml(doc.recipient_name)} is signed by both sides. The signed PDF is attached and saved in LegalSigns.</p>`
      : es
        ? `<p>Hola ${escapeHtml(doc.recipient_name)}:</p><p><strong>${escapeHtml(doc.title)}</strong> ya está firmado por ambas partes. Adjuntamos la copia final en PDF para sus archivos.</p>`
        : `<p>Hi ${escapeHtml(doc.recipient_name)},</p><p>The <strong>${escapeHtml(doc.title)}</strong> is now signed by both sides. The final PDF is attached for your records.</p>`),
  };
}

// ── The signed PDF ──────────────────────────────────────────────────────────

const PDF_TEXT = {
  en: {
    signatures: "Signatures", name: "Name", title: "Title", email: "Email", signed: "Signed",
    certificate: "Certificate of completion", documentId: "Document ID", document: "Document",
    version: "Template version", language: "Language", fingerprint: "Content fingerprint (SHA-256)",
    recipient: "Sent to", trail: "Audit trail", ip: "IP address", device: "Device", page: "Page",
    of: "of", languageName: "English",
    note: "Both parties agreed to sign this document electronically. This certificate records each step, when it happened and where it came from. The fingerprint changes if a single character of the signed content does.",
  },
  es: {
    signatures: "Firmas", name: "Nombre", title: "Cargo", email: "Correo", signed: "Firmado",
    certificate: "Certificado de finalización", documentId: "ID del documento", document: "Documento",
    version: "Versión de la plantilla", language: "Idioma", fingerprint: "Huella del contenido (SHA-256)",
    recipient: "Enviado a", trail: "Registro de auditoría", ip: "Dirección IP", device: "Dispositivo", page: "Página",
    of: "de", languageName: "Español",
    note: "Ambas partes aceptaron firmar este documento electrónicamente. Este certificado registra cada paso, cuándo ocurrió y desde dónde. La huella cambia si cambia un solo carácter del contenido firmado.",
  },
};

const EVENT_LABELS: Record<string, Record<Language, string>> = {
  sent: { en: "Sent for signature", es: "Enviado para firma" },
  resent: { en: "Sent again", es: "Enviado de nuevo" },
  viewed: { en: "Opened by the recipient", es: "Abierto por el destinatario" },
  client_signed: { en: "Signed by the recipient", es: "Firmado por el destinatario" },
  countersigned: { en: "Countersigned by LV Branding", es: "Firmado por LV Branding" },
  completed: { en: "Completed and sent to both parties", es: "Completado y enviado a ambas partes" },
};

// dateStyle and timeStyle can't be combined with timeZoneName; Intl throws.
export const dateTime = (iso: string, language: Language) =>
  pdfSafe(new Intl.DateTimeFormat(language === "es" ? "es-US" : "en-US", {
    year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
    timeZone: "America/Chicago", timeZoneName: "short",
  }).format(new Date(iso)));

export interface PdfDocumentData {
  id: string;
  title: string;
  language: Language;
  template_key: string;
  template_version: string;
  recipient_name: string;
  recipient_email: string;
  content: Content;
  content_hash: string;
  client_signer_name: string;
  client_signer_title: string | null;
  client_signature: Signature;
  client_signed_at: string;
  lv_signer_name: string;
  lv_signer_title: string | null;
  lv_signature: Signature;
  lv_signed_at: string;
}

export async function buildSignedPdf(doc: PdfDocumentData, events: { event: string; created_at: string; actor_label: string | null; ip: string | null; user_agent: string | null }[], logo?: Uint8Array) {
  const words = PDF_TEXT[doc.language];
  const pdf = await PDFDocument.create();
  pdf.setTitle(pdfSafe(doc.title));
  pdf.setAuthor("LV Branding LLC");
  pdf.setProducer("LV Branding LegalSigns");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const script = await pdf.embedFont(StandardFonts.TimesRomanItalic);
  const logoImage = logo ? await pdf.embedPng(logo).catch(() => undefined) : undefined;

  const width = 612, height = 792, margin = 60, contentWidth = width - margin * 2, bottom = 72;
  let page: PDFPage = pdf.addPage([width, height]);
  let y = height - margin;

  const header = (target: PDFPage) => {
    if (logoImage) target.drawImage(logoImage, { x: margin, y: height - 46, width: 22, height: 22 });
    target.drawText("LV BRANDING", { x: margin + (logoImage ? 30 : 0), y: height - 39, size: 9, font: bold, color: RED });
  };
  header(page);
  y -= 24;
  const ensure = (needed: number) => {
    if (y - needed >= bottom) return;
    page = pdf.addPage([width, height]);
    header(page);
    y = height - margin - 24;
  };
  const charWidths = new Map<string, number>();
  const measure = (font: PDFFont, size: number) => (text: string) => drawnWidth(text, (char) => {
    const key = `${font.name}|${size}|${char}`;
    let width = charWidths.get(key);
    if (width === undefined) {
      width = font.widthOfTextAtSize(char, size);
      charWidths.set(key, width);
    }
    return width;
  });
  const write = (text: string, font: PDFFont, size: number, options: { color?: typeof INK; gap?: number; indent?: number } = {}) => {
    const lines = wrapText(pdfSafe(text), measure(font, size), contentWidth - (options.indent ?? 0));
    for (const line of lines) {
      ensure(size * 1.4);
      page.drawText(line, { x: margin + (options.indent ?? 0), y: y - size, size, font, color: options.color ?? INK });
      y -= size * 1.4;
    }
    y -= options.gap ?? 0;
  };

  for (const block of doc.content.blocks) {
    if (block.kind === "title") { write(block.text.toUpperCase(), bold, 17, { gap: 12 }); continue; }
    if (block.kind === "heading") { y -= 4; write(block.text, bold, 11, { gap: 4 }); continue; }
    if (block.kind === "meta") {
      ensure(15);
      const label = pdfSafe(`${block.label}: `);
      page.drawText(label, { x: margin, y: y - 10, size: 10, font: bold, color: INK });
      const labelWidth = measure(bold, 10)(label);
      const lines = wrapText(pdfSafe(block.text), measure(regular, 10), contentWidth - labelWidth);
      lines.forEach((line, index) => {
        if (index) ensure(14);
        page.drawText(line, { x: margin + labelWidth, y: y - 10, size: 10, font: regular, color: INK });
        y -= 14;
      });
      continue;
    }
    y -= 6;
    write(block.text, regular, 10.5, { gap: 4 });
  }

  // Signatures side by side, the client's first, and never split across pages.
  const images = new Map<string, PDFImage>();
  const signatureArt = async (signature: Signature) => {
    if (signature.type !== "draw") return undefined;
    if (!images.has(signature.value)) {
      const base64 = signature.value.split(",")[1];
      images.set(signature.value, await pdf.embedPng(Uint8Array.from(atob(base64), (char) => char.charCodeAt(0))));
    }
    return images.get(signature.value);
  };
  const gutter = 28;
  const columnWidth = (contentWidth - gutter) / 2;
  const columnText = (text: string, font: PDFFont, size: number, x: number, top: number, color = INK) => {
    let lineY = top;
    for (const line of wrapText(pdfSafe(text), measure(font, size), columnWidth)) {
      page.drawText(line, { x, y: lineY - size, size, font, color });
      lineY -= size * 1.4;
    }
    return lineY;
  };
  const signatureBlock = async (x: number, role: string, signature: Signature, name: string, title: string | null, signedAt: string, email?: string) => {
    let top = columnText(role, bold, 9, x, y, MUTED) - 4;
    const art = await signatureArt(signature);
    if (art) {
      const scale = Math.min(columnWidth / art.width, 52 / art.height);
      page.drawImage(art, { x, y: top - 56, width: art.width * scale, height: art.height * scale });
    } else {
      const typed = pdfSafe(signature.value);
      const size = Math.min(24, (24 * columnWidth) / Math.max(1, measure(script, 24)(typed)));
      page.drawText(typed, { x, y: top - 44, size, font: script, color: INK });
    }
    top -= 60;
    page.drawLine({ start: { x, y: top }, end: { x: x + columnWidth, y: top }, thickness: 0.7, color: MUTED });
    top -= 6;
    for (const line of [`${words.name}: ${name}`, title ? `${words.title}: ${title}` : "", email ? `${words.email}: ${email}` : "", `${words.signed}: ${dateTime(signedAt, doc.language)}`]) {
      if (line) top = columnText(line, regular, 9, x, top);
    }
    return top;
  };
  y -= 14;
  // The heading and the taller of the two blocks.
  ensure(200);
  write(words.signatures, bold, 12, { gap: 10 });
  const clientBottom = await signatureBlock(margin, doc.content.signerRole, doc.client_signature, doc.client_signer_name, doc.client_signer_title, doc.client_signed_at, doc.recipient_email);
  const lvBottom = await signatureBlock(margin + columnWidth + gutter, `${doc.content.countersignerRole} · LV Branding LLC`, doc.lv_signature, doc.lv_signer_name, doc.lv_signer_title, doc.lv_signed_at);
  y = Math.min(clientBottom, lvBottom) - 10;

  // Certificate of completion, on its own page.
  page = pdf.addPage([width, height]);
  header(page);
  y = height - margin - 24;
  write(words.certificate, bold, 15, { gap: 10 });
  for (const [label, text] of [
    [words.documentId, doc.id],
    [words.document, doc.title],
    [words.version, `${doc.template_key} ${doc.template_version}`],
    [words.language, words.languageName],
    [words.recipient, `${doc.recipient_name} <${doc.recipient_email}>`],
    [words.fingerprint, doc.content_hash],
  ]) {
    write(label, bold, 9, { color: MUTED });
    write(text, regular, 10, { gap: 6 });
  }
  y -= 6;
  write(words.trail, bold, 12, { gap: 6 });
  for (const event of events) {
    ensure(52);
    write(`${EVENT_LABELS[event.event]?.[doc.language] ?? event.event} · ${dateTime(event.created_at, doc.language)}`, bold, 9.5);
    const details = [
      event.actor_label,
      event.ip ? `${words.ip}: ${event.ip}` : "",
      event.user_agent ? `${words.device}: ${event.user_agent.slice(0, 140)}` : "",
    ].filter(Boolean).join("\n");
    if (details) write(details, regular, 8.5, { color: MUTED, indent: 10 });
    y -= 6;
  }
  y -= 8;
  write(words.note, regular, 8.5, { color: MUTED });

  // Page numbers, once every page exists.
  const pages = pdf.getPages();
  pages.forEach((target, index) => {
    const label = pdfSafe(`${doc.id} · ${words.page} ${index + 1} ${words.of} ${pages.length}`);
    target.drawText(label, { x: margin, y: 36, size: 7.5, font: regular, color: MUTED });
  });
  return await pdf.save();
}

export function base64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
