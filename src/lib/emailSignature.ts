// ── Email signature builder ─────────────────────────────────────────────────────
// Output is deliberately conservative: a single <table> with inline styles only.
// Email clients strip <style> blocks, flexbox, and grid, so none are used here.

export type SignatureSize = "compact" | "standard" | "spacious";
export type SignatureFont = "fira" | "inter" | "lato" | "montserrat" | "source" | "serif";

export interface SignatureModel {
  fullName:   string;
  role:       string;
  company:    string;
  phone:      string;
  email:      string;
  website:    string;
  address:    string;
  tagline:    string;
  logoUrl:    string;
  photoUrl:   string;
  accent:     string;
  size:       SignatureSize;
  font:       SignatureFont;
  disclaimer: string;
  linkedin:   string;
  instagram:  string;
  youtube:    string;
  x:          string;
}

export const DEFAULT_DISCLAIMER =
  "This message may contain confidential information. If you received it in error, please delete it.";

/** Blank by default — this is a public tool, so it must not seed another company's details. */
export const EMPTY_SIGNATURE: SignatureModel = {
  fullName: "", role: "", company: "", phone: "", email: "", website: "",
  address: "", tagline: "", logoUrl: "", photoUrl: "",
  accent: "#CB2039", size: "standard", font: "fira",
  disclaimer: DEFAULT_DISCLAIMER,
  linkedin: "", instagram: "", youtube: "", x: "",
};

export const FONT_OPTIONS: { value: SignatureFont; label: string }[] = [
  { value: "fira",       label: "Fira Sans" },
  { value: "inter",      label: "Inter" },
  { value: "lato",       label: "Lato" },
  { value: "montserrat", label: "Montserrat" },
  { value: "source",     label: "Source Sans 3" },
  { value: "serif",      label: "Times / Serif" },
];

export const SIZE_OPTIONS: { value: SignatureSize; label: string }[] = [
  { value: "compact",  label: "Compact" },
  { value: "standard", label: "Standard" },
  { value: "spacious", label: "Spacious" },
];

const FONT_STACKS: Record<SignatureFont, string> = {
  fira:       "'Fira Sans', Arial, Helvetica, sans-serif",
  inter:      "'Inter', Arial, Helvetica, sans-serif",
  lato:       "'Lato', Arial, Helvetica, sans-serif",
  montserrat: "'Montserrat', Arial, Helvetica, sans-serif",
  source:     "'Source Sans 3', Arial, Helvetica, sans-serif",
  serif:      "'Times New Roman', Times, Georgia, serif",
};

interface Dims {
  pad: number; name: number; meta: number; line: number;
  logo: number; photo: number; gap: number;
}

function dimsFor(size: SignatureSize): Dims {
  if (size === "compact")  return { pad:  8, name: 16, meta: 12, line: 12, logo: 46, photo: 46, gap: 10 };
  if (size === "spacious") return { pad: 14, name: 20, meta: 13, line: 13, logo: 58, photo: 58, gap: 14 };
  return { pad: 12, name: 18, meta: 12, line: 12, logo: 52, photo: 52, gap: 12 };
}

export function esc(value: string): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * The accent lands unquoted inside `style="…"` attributes, and it's a free-text
 * field — so anything that isn't a literal hex colour is discarded rather than
 * escaped. Otherwise a value like `red" onmouseover="…` would break out of the
 * attribute and ride along in the HTML the user copies into their email client.
 */
export function safeColor(value: string, fallback = "#CB2039"): string {
  const v = String(value ?? "").trim();
  return /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : fallback;
}

export function normalizeUrl(value: string): string {
  const v = String(value ?? "").trim();
  if (!v) return "";
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

export function buildSignatureHtml(model: SignatureModel): string {
  const a    = safeColor(model.accent);
  const font = FONT_STACKS[model.font] ?? FONT_STACKS.fira;
  const d    = dimsFor(model.size);

  const website = normalizeUrl(model.website);
  const sep     = ' <span style="color:#9ca3af">•</span> ';

  const contacts: string[] = [];
  if (model.phone)  contacts.push(`<a href="tel:${esc(model.phone)}" style="color:${a};text-decoration:none">${esc(model.phone)}</a>`);
  if (model.email)  contacts.push(`<a href="mailto:${esc(model.email)}" style="color:${a};text-decoration:none">${esc(model.email)}</a>`);
  if (website)      contacts.push(`<a href="${esc(website)}" style="color:${a};text-decoration:none">${esc(website.replace(/^https?:\/\//i, ""))}</a>`);

  const social: string[] = [];
  const addSocial = (url: string, label: string) => {
    const href = normalizeUrl(url);
    if (href) social.push(`<a href="${esc(href)}" style="color:${a};text-decoration:none">${label}</a>`);
  };
  addSocial(model.linkedin,  "LinkedIn");
  addSocial(model.instagram, "Instagram");
  addSocial(model.youtube,   "YouTube");
  addSocial(model.x,         "X");

  const nameLine     = model.fullName ? `<div style="font-size:${d.name}px;line-height:1.15;font-weight:700;color:#111827;margin:0 0 2px">${esc(model.fullName)}</div>` : "";
  const roleLine     = model.role     ? `<div style="font-size:${d.meta}px;line-height:1.25;font-weight:600;color:#374151;margin:0 0 6px">${esc(model.role)}</div>` : "";
  const companyLine  = model.company  ? `<div style="font-size:${d.meta}px;line-height:1.25;color:#111827;margin:0 0 6px"><span style="font-weight:700">${esc(model.company)}</span></div>` : "";
  const taglineLine  = model.tagline  ? `<div style="font-size:${d.meta}px;line-height:1.25;color:#4b5563;margin:0 0 8px">${esc(model.tagline)}</div>` : "";
  const contactLine  = contacts.length ? `<div style="font-size:${d.line}px;line-height:1.35;color:#111827;margin:0">${contacts.join(sep)}</div>` : "";
  const addressLine  = model.address  ? `<div style="font-size:${d.line}px;line-height:1.35;color:#4b5563;margin:4px 0 0">${esc(model.address)}</div>` : "";
  const socialLine   = social.length   ? `<div style="font-size:${d.line}px;line-height:1.35;color:#111827;margin:6px 0 0">${social.join(sep)}</div>` : "";

  const rule = `
      <div style="margin:${Math.max(8, d.pad)}px 0 0;">
        <div style="height:1px;background:${a};opacity:.35"></div>
      </div>`;

  const disclaimerLine = model.disclaimer
    ? `
      <div style="font-size:${Math.max(10, d.line - 1)}px;line-height:1.35;color:#6b7280;margin:8px 0 0">
        ${esc(model.disclaimer)}
      </div>`
    : "";

  const media = (model.photoUrl || model.logoUrl)
    ? `
    <td valign="top" style="padding:0 ${d.gap}px 0 0;white-space:nowrap">
      ${model.photoUrl ? `<img src="${esc(model.photoUrl)}" width="${d.photo}" height="${d.photo}" alt="" style="display:block;border-radius:999px;object-fit:cover" />` : ""}
      ${model.photoUrl && model.logoUrl ? `<div style="height:10px"></div>` : ""}
      ${model.logoUrl ? `<img src="${esc(model.logoUrl)}" width="${d.logo}" alt="" style="display:block" />` : ""}
    </td>`
    : "";

  return `<!-- Email signature -->
<table cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;font-family:${font};">
  <tr>${media}
    <td valign="top" style="padding:0">
      ${nameLine}
      ${roleLine}
      ${companyLine}
      ${taglineLine}
      ${contactLine}
      ${addressLine}
      ${socialLine}${rule}${disclaimerLine}
    </td>
  </tr>
</table>`;
}

/** True once there is anything worth previewing. */
export function hasContent(model: SignatureModel): boolean {
  return Boolean(
    model.fullName || model.role || model.company || model.phone || model.email ||
    model.website || model.address || model.tagline || model.logoUrl || model.photoUrl ||
    model.linkedin || model.instagram || model.youtube || model.x,
  );
}

export function downloadSignatureFile(html: string) {
  const doc = `<!doctype html><meta charset="utf-8"><title>Email Signature</title><body>${html}</body>`;
  const blob = new Blob([doc], { type: "text/html" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = "email-signature.html";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}
