// LegalSigns, shared by legal-signs (the team's actions) and legal-sign (the
// client's signing page): link tokens, content fingerprints and emails. The
// signed PDF is in legal-pdf.ts, which only legal-signs loads.

import { canonicalJson } from "./legal-text.ts";

export { validSignature, type Signature } from "./legal-text.ts";

export type Language = "en" | "es";
export type Block =
  | { kind: "title"; text: string }
  | { kind: "meta"; label: string; text: string }
  | { kind: "heading"; text: string }
  | { kind: "paragraph"; text: string };
/** What a document says, fixed when it is sent; content_hash is its SHA-256. */
export interface Content {
  blocks: Block[];
  /** The first signer's role; signerRoles has everyone's when there are more. */
  signerRole: string;
  /** Each signer's role, in signing order (documents with more than one signer). */
  signerRoles?: string[];
  countersignerRole: string;
}

/** Everyone who signs besides LV Branding, by role, in signing order. */
export const signerRolesOf = (content: Content) => (content.signerRoles?.length ? content.signerRoles : [content.signerRole]);

/** A party who signs besides LV Branding, with their own link. */
export interface Signer {
  id: string;
  document_id: string;
  org_id: string;
  position: number;
  name: string;
  email: string;
  company_name: string;
  token_hash: string | null;
  viewed_at: string | null;
  signed_at: string | null;
  signer_name: string | null;
  signer_title: string | null;
  signature: { type: "draw" | "type"; value: string } | null;
  ip: string | null;
  user_agent: string | null;
}

/** "Ana Ruiz", "Ana Ruiz and Leo Díaz", "Ana Ruiz, Leo Díaz and Mia Chen". */
export function listNames(names: string[], language: Language = "en") {
  if (names.length < 2) return names[0] ?? "";
  return `${names.slice(0, -1).join(", ")} ${language === "es" ? "y" : "and"} ${names[names.length - 1]}`;
}

export const APP_URL = Deno.env.get("APP_URL") || "https://marketing.lvbranding.com";

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
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes as BufferSource));
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

// Fira Sans where the mail app loads web fonts (Apple Mail, iOS); Gmail and
// Outlook show Arial instead.
const FONT = "'Fira Sans',Arial,Helvetica,sans-serif";

function emailLayout(body: string) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<link href="https://fonts.googleapis.com/css2?family=Fira+Sans:wght@400;600&display=swap" rel="stylesheet">
</head>
<body style="margin:0;padding:0;background:#ffffff">
<div style="font-family:${FONT};max-width:560px;margin:0 auto;padding:32px 24px;color:#1c1a1b;font-size:15px;line-height:1.55">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 28px"><tr>
    <td style="padding:0 12px 0 0;vertical-align:middle"><img src="${APP_URL}/lv-logo.png" width="44" height="44" alt="LV Branding" style="display:block;border:0;width:44px;height:44px"></td>
    <td style="vertical-align:middle;font-family:${FONT};font-size:13px;font-weight:600;letter-spacing:.1em;color:#cb2039">LV BRANDING</td>
  </tr></table>
  ${body}
  <p style="margin:32px 0 0;padding-top:16px;border-top:1px solid #ececed;font-size:12px;color:#6b6668">LV Branding LLC · Houston, Texas · <a href="https://www.lvbranding.com" style="color:#6b6668">lvbranding.com</a></p>
</div>
</body></html>`;
}
const button = (href: string, label: string) =>
  `<p style="margin:24px 0"><a href="${escapeHtml(href)}" style="display:inline-block;background:#cb2039;color:#fff;text-decoration:none;font-family:${FONT};font-weight:600;padding:12px 22px;border-radius:8px">${escapeHtml(label)}</a></p>`;

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

/** To the team when the last signer has signed. */
export function signedByClientEmail(doc: { id: string; title: string }, signers: { name: string; company_name: string }[]) {
  const who = signers.length === 1
    ? `<strong>${escapeHtml(signers[0].name)}</strong>${signers[0].company_name ? ` (${escapeHtml(signers[0].company_name)})` : ""} signed`
    : `Every party signed: <strong>${escapeHtml(listNames(signers.map((signer) => signer.name)))}</strong> signed`;
  return {
    subject: signers.length === 1
      ? `${signers[0].name} signed ${doc.title}. Countersign to complete it`
      : `Every party signed ${doc.title}. Countersign to complete it`,
    html: emailLayout(`<p>${who} the <strong>${escapeHtml(doc.title)}</strong>.</p>
<p>It is complete once LV Branding countersigns it; ${signers.length === 1 ? "both sides" : "every party"} then gets the signed PDF.</p>
${button(`${APP_URL}/legal-signs?document=${doc.id}`, "Countersign in LegalSigns")}`),
  };
}

/** To a signer once they have signed; othersPending when other parties still have to. */
export function clientReceiptEmail(doc: { title: string; recipient_name: string; language: Language }, othersPending = false) {
  const es = doc.language === "es";
  const next = othersPending
    ? (es
      ? "Cuando las demás partes firmen, LV Branding lo firmará y le enviaremos por correo la copia final firmada por todas las partes."
      : "Once the other parties sign, LV Branding will countersign it, and we'll email you the final copy signed by every party.")
    : (es
      ? "LV Branding lo firmará a continuación y le enviaremos por correo la copia final firmada por todas las partes."
      : "LV Branding will countersign it next, and we'll email you the final copy signed by every party.");
  return {
    subject: es ? `Recibimos su firma: ${doc.title}` : `We received your signature: ${doc.title}`,
    html: emailLayout(es
      ? `<p>Hola ${escapeHtml(doc.recipient_name)}:</p><p>Gracias por firmar <strong>${escapeHtml(doc.title)}</strong>. ${next}</p>`
      : `<p>Hi ${escapeHtml(doc.recipient_name)},</p><p>Thank you for signing the <strong>${escapeHtml(doc.title)}</strong>. ${next}</p>`),
  };
}

/** With the signed PDF, to a signer or (forTeam) to LV Branding. */
export function completedEmail(doc: { title: string; recipient_name: string }, language: Language, forTeam: boolean, parties = 2) {
  const es = language === "es";
  const all = parties > 2 ? (es ? "todas las partes" : "every party") : (es ? "ambas partes" : "both sides");
  return {
    subject: es ? `Documento firmado: ${doc.title}` : `Signed: ${doc.title}`,
    html: emailLayout(forTeam
      ? `<p>The <strong>${escapeHtml(doc.title)}</strong> with ${escapeHtml(doc.recipient_name)} is signed by ${all}. The signed PDF is attached and saved in LegalSigns.</p>`
      : es
        ? `<p>Hola ${escapeHtml(doc.recipient_name)}:</p><p><strong>${escapeHtml(doc.title)}</strong> ya está firmado por ${all}. Adjuntamos la copia final en PDF para sus archivos.</p>`
        : `<p>Hi ${escapeHtml(doc.recipient_name)},</p><p>The <strong>${escapeHtml(doc.title)}</strong> is now signed by ${all}. The final PDF is attached for your records.</p>`),
  };
}
