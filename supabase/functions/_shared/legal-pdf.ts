// LegalSigns' signed PDF: the document as it was sent, both signatures and a
// certificate of completion, set in Fira Sans under the LV coin. Both are
// bundled (legal-brand/), so signing never waits on a download.

import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFImage, type PDFPage } from "https://esm.sh/pdf-lib@1.17.1";
import fontkit from "https://esm.sh/@pdf-lib/fontkit@1.1.1";
import { drawnWidth, keepDrawable, pdfSafe, wrapText, type Signature } from "./legal-text.ts";
import { signerRolesOf, type Content, type Language } from "./legal-signs.ts";
import firaItalic from "./legal-brand/fira-sans-italic.ts";
import firaRegular from "./legal-brand/fira-sans-regular.ts";
import firaSemiBold from "./legal-brand/fira-sans-semibold.ts";
import lvCoin from "./legal-brand/lv-coin.ts";

const RED = rgb(0.796, 0.125, 0.224);
const INK = rgb(0.11, 0.1, 0.1);
const MUTED = rgb(0.42, 0.4, 0.41);

const fromBase64 = (data: string) => Uint8Array.from(atob(data), (char) => char.charCodeAt(0));

const PDF_TEXT = {
  en: {
    signatures: "Signatures", name: "Name", title: "Title", email: "Email", signed: "Signed",
    certificate: "Certificate of completion", documentId: "Document ID", document: "Document",
    version: "Template version", language: "Language", fingerprint: "Content fingerprint (SHA-256)",
    recipient: "Sent to", trail: "Audit trail", ip: "IP address", device: "Device", page: "Page",
    of: "of", languageName: "English",
    note: "Both parties agreed to sign this document electronically. This certificate records each step, when it happened and where it came from. The fingerprint changes if a single character of the signed content does.",
    noteMany: "Every party agreed to sign this document electronically. This certificate records each step, when it happened and where it came from. The fingerprint changes if a single character of the signed content does.",
  },
  es: {
    signatures: "Firmas", name: "Nombre", title: "Cargo", email: "Correo", signed: "Firmado",
    certificate: "Certificado de finalización", documentId: "ID del documento", document: "Documento",
    version: "Versión de la plantilla", language: "Idioma", fingerprint: "Huella del contenido (SHA-256)",
    recipient: "Enviado a", trail: "Registro de auditoría", ip: "Dirección IP", device: "Dispositivo", page: "Página",
    of: "de", languageName: "Español",
    note: "Ambas partes aceptaron firmar este documento electrónicamente. Este certificado registra cada paso, cuándo ocurrió y desde dónde. La huella cambia si cambia un solo carácter del contenido firmado.",
    noteMany: "Todas las partes aceptaron firmar este documento electrónicamente. Este certificado registra cada paso, cuándo ocurrió y desde dónde. La huella cambia si cambia un solo carácter del contenido firmado.",
  },
};

const EVENT_LABELS: Record<string, Record<Language, string>> = {
  sent: { en: "Sent for signature", es: "Enviado para firma" },
  resent: { en: "Sent again", es: "Enviado de nuevo" },
  revised: { en: "Document revised; previous link invalidated", es: "Documento revisado; enlace anterior invalidado" },
  revision_sent: { en: "Revised document sent", es: "Documento revisado enviado" },
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
  content: Content;
  content_hash: string;
  /** Everyone who signed besides LV Branding, in signing order. */
  signers: PdfSigner[];
  lv_signer_name: string;
  lv_signer_title: string | null;
  lv_signature: Signature;
  lv_signed_at: string;
}

export interface PdfSigner {
  name: string;
  email: string;
  signer_name: string;
  signer_title: string | null;
  signature: Signature;
  signed_at: string;
}

export type PdfEvent = { event: string; created_at: string; actor_label: string | null; ip: string | null; user_agent: string | null };

/**
 * The signed PDF in Fira Sans. Should embedding the font ever fail, it is made
 * again in the PDF's built-in Helvetica: a countersignature never fails over a font.
 */
export async function buildSignedPdf(doc: PdfDocumentData, events: PdfEvent[]) {
  try {
    return await renderPdf(doc, events, "fira");
  } catch (error) {
    console.error("Signed PDF in Fira Sans failed; making it in Helvetica", error);
    return await renderPdf(doc, events, "builtin");
  }
}

async function renderPdf(doc: PdfDocumentData, events: PdfEvent[], fonts: "fira" | "builtin") {
  const words = PDF_TEXT[doc.language];
  const pdf = await PDFDocument.create();
  pdf.setTitle(doc.title);
  pdf.setAuthor("LV Branding LLC");
  pdf.setProducer("LV Branding LegalSigns");
  // Typed signatures are set in the italic; it is only embedded when there is one.
  const typed = doc.lv_signature.type === "type" || doc.signers.some((signer) => signer.signature.type === "type");
  let regular: PDFFont, bold: PDFFont, script: PDFFont;
  if (fonts === "fira") {
    pdf.registerFontkit(fontkit);
    // Whole fonts: pdf-lib's subsetting drops letters from Fira Sans. No
    // ligatures, since lines are measured one character at a time.
    const options = { subset: false, features: { liga: false } };
    regular = await pdf.embedFont(fromBase64(firaRegular), options);
    bold = await pdf.embedFont(fromBase64(firaSemiBold), options);
    script = typed ? await pdf.embedFont(fromBase64(firaItalic), options) : regular;
  } else {
    regular = await pdf.embedFont(StandardFonts.Helvetica);
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
    script = await pdf.embedFont(StandardFonts.HelveticaOblique);
  }
  const coin = await pdf.embedPng(fromBase64(lvCoin));

  // What each font can draw; anything else prints as "?" rather than breaking the PDF.
  const charsets = new Map<PDFFont, Set<number>>();
  const fit = (text: string, font: PDFFont) => {
    let charset = charsets.get(font);
    if (!charset) charsets.set(font, charset = new Set(font.getCharacterSet()));
    return keepDrawable(text, (codePoint) => charset!.has(codePoint));
  };

  const width = 612, height = 792, margin = 60, contentWidth = width - margin * 2, bottom = 72;
  let page: PDFPage = pdf.addPage([width, height]);
  let y = height - margin;

  const header = (target: PDFPage) => {
    target.drawImage(coin, { x: margin, y: height - 52, width: 28, height: 28 });
    target.drawText("LV BRANDING", { x: margin + 36, y: height - 41.5, size: 9.5, font: bold, color: RED });
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
    const lines = wrapText(fit(text, font), measure(font, size), contentWidth - (options.indent ?? 0));
    for (const line of lines) {
      ensure(size * 1.4);
      page.drawText(line, { x: margin + (options.indent ?? 0), y: y - size, size, font, color: options.color ?? INK });
      y -= size * 1.4;
    }
    y -= options.gap ?? 0;
  };

  for (const block of doc.content.blocks) {
    if (block.kind === "title") { write(block.text.toUpperCase(), bold, 17, { gap: 12 }); continue; }
    // A heading starts a new page rather than end one alone: room for it and three lines after.
    if (block.kind === "heading") { y -= 4; ensure(62); write(block.text, bold, 11, { gap: 4 }); continue; }
    if (block.kind === "meta") {
      ensure(15);
      const label = fit(`${block.label}: `, bold);
      page.drawText(label, { x: margin, y: y - 10, size: 10, font: bold, color: INK });
      const labelWidth = measure(bold, 10)(label);
      const lines = wrapText(fit(block.text, regular), measure(regular, 10), contentWidth - labelWidth);
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

  // Signatures two to a row, the other parties' first and LV Branding's last;
  // a row is never split across pages.
  const images = new Map<string, PDFImage>();
  const signatureArt = async (signature: Signature) => {
    if (signature.type !== "draw") return undefined;
    if (!images.has(signature.value)) {
      const base64 = signature.value.split(",")[1];
      images.set(signature.value, await pdf.embedPng(fromBase64(base64)));
    }
    return images.get(signature.value);
  };
  const gutter = 28;
  const columnWidth = (contentWidth - gutter) / 2;
  const columnText = (text: string, font: PDFFont, size: number, x: number, top: number, color = INK) => {
    let lineY = top;
    for (const line of wrapText(fit(text, font), measure(font, size), columnWidth)) {
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
      const typed = fit(signature.value, script);
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
  const roles = signerRolesOf(doc.content);
  const blocks = [
    ...doc.signers.map((signer, index) => ({
      role: roles[index] ?? roles[0], signature: signer.signature, name: signer.signer_name, title: signer.signer_title,
      signedAt: signer.signed_at, email: signer.email as string | undefined,
    })),
    {
      role: `${doc.content.countersignerRole} · LV Branding LLC`, signature: doc.lv_signature, name: doc.lv_signer_name,
      title: doc.lv_signer_title, signedAt: doc.lv_signed_at, email: undefined,
    },
  ];
  y -= 14;
  // The heading and the taller of the first row's blocks.
  ensure(200);
  write(words.signatures, bold, 12, { gap: 10 });
  for (let index = 0; index < blocks.length; index += 2) {
    if (index) ensure(170);
    const row = blocks.slice(index, index + 2);
    const bottoms: number[] = [];
    for (const [column, block] of row.entries()) {
      bottoms.push(await signatureBlock(margin + column * (columnWidth + gutter), block.role, block.signature, block.name, block.title, block.signedAt, block.email));
    }
    y = Math.min(...bottoms) - 18;
  }

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
    [words.recipient, doc.signers.map((signer) => `${signer.name} <${signer.email}>`).join("\n")],
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
  write(doc.signers.length > 1 ? words.noteMany : words.note, regular, 8.5, { color: MUTED });

  // Page numbers, once every page exists.
  const pages = pdf.getPages();
  pages.forEach((target, index) => {
    const label = fit(`${doc.id} · ${words.page} ${index + 1} ${words.of} ${pages.length}`, regular);
    target.drawText(label, { x: margin, y: 36, size: 7.5, font: regular, color: MUTED });
  });
  return await pdf.save();
}

export function base64(bytes: Uint8Array) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(binary);
}
