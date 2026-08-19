/**
 * submit-av-lead: public endpoint (no JWT required)
 * Shared lead-capture backend for the LV Branding service landing forms (EN + ES):
 *   av-landing · web-solutions · ux-ui-design · creative-content ·
 *   photo-video · brand-strategy · digital-marketing ·
 *   campaign-calculator · website-audit
 *
 *   1. Inserts the lead into public.av_leads (service role, bypasses RLS)
 *   2. Syncs the lead into the CRM (contacts pipeline) with a per-form tag
 *      (+ "Español" tag when the form language is Spanish)
 *   3. Emails the LV Branding team a notification (English) + the prospect a
 *      branded auto-reply in their own language
 * CRM sync and email are best-effort: failures never fail the submission.
 */
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL     = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY") ?? "";

const LV_LOGO_URL = "https://lv-marketing-suite.vercel.app/lv-logo.png";
const FROM_EMAIL  = "admin@lvbranding.com";
const FROM_NAME   = "LV Branding";
const BRAND       = "#CB2039";
const MAX_REQUEST_BYTES = 3_000_000;
const MAX_ATTACHMENT_BYTES = 2_000_000;

const NOTIFY_RECIPIENTS = [
  { email: "luis@lvbranding.com", name: "Luis" },
  { email: "yex@lvbranding.com",  name: "Yex"  },
];

const CRM_ORG_ID = Deno.env.get("AV_LEAD_ORG_ID") ?? "0122121e-5dec-446e-92b3-4e85b145910a";

interface FormConfig {
  label:          string;
  labelEs:        string;
  emoji:          string;
  tag:            string;
  replyContext:   string;
  replyContextEs: string;
  fields: { type: string; timeframe: string; date: string; venue: string; attendees: string };
  /** Overrides the "Services" row label; the campaign calculator sends channels. */
  servicesLabel?: string;
}

const FORM_CONFIGS: Record<string, FormConfig> = {
  "av-landing": {
    label: "AV Production", labelEs: "Producción AV", emoji: "🎥", tag: "AV Production Lead",
    replyContext: "AV & live production request", replyContextEs: "solicitud de producción AV y eventos en vivo",
    fields: { type: "Event type", timeframe: "Timeframe", date: "Event date", venue: "Venue / City", attendees: "Attendees" },
  },
  "web-solutions": {
    label: "Web Solutions", labelEs: "Soluciones Web", emoji: "💻", tag: "Web Solutions Lead",
    replyContext: "web development request", replyContextEs: "solicitud de desarrollo web",
    fields: { type: "Project type", timeframe: "Timeline", date: "Target launch", venue: "Current website", attendees: "Company size" },
  },
  "ux-ui-design": {
    label: "UX/UI Design", labelEs: "Diseño UX/UI", emoji: "🎨", tag: "UX/UI Design Lead",
    replyContext: "UX/UI design request", replyContextEs: "solicitud de diseño UX/UI",
    fields: { type: "Project type", timeframe: "Timeline", date: "Target launch", venue: "Current website", attendees: "Company size" },
  },
  "creative-content": {
    label: "Creative & Content", labelEs: "Creatividad y Contenido", emoji: "🖌️", tag: "Creative Content Lead",
    replyContext: "creative & content request", replyContextEs: "solicitud de estrategia creativa y contenido",
    fields: { type: "Request type", timeframe: "Timeline", date: "Deadline", venue: "Channels", attendees: "Company size" },
  },
  "photo-video": {
    label: "Photo & Video", labelEs: "Foto y Video", emoji: "📸", tag: "Photo & Video Lead",
    replyContext: "photography & video request", replyContextEs: "solicitud de fotografía y video",
    fields: { type: "Shoot type", timeframe: "Timeframe", date: "Shoot date", venue: "Location", attendees: "Company size" },
  },
  "brand-strategy": {
    label: "Brand Strategy", labelEs: "Estrategia de Marca", emoji: "🧭", tag: "Brand Strategy Lead",
    replyContext: "brand strategy request", replyContextEs: "solicitud de estrategia de marca",
    fields: { type: "Project type", timeframe: "Timeline", date: "Target date", venue: "Current website", attendees: "Company size" },
  },
  "digital-marketing": {
    label: "Digital Marketing", labelEs: "Marketing Digital", emoji: "📈", tag: "Digital Marketing Lead",
    replyContext: "digital marketing request", replyContextEs: "solicitud de marketing digital",
    fields: { type: "Goal", timeframe: "Timeline", date: "Start date", venue: "Website", attendees: "Company size" },
  },
  // Sent from the public Campaign Investment Calculator. These leads arrive with a
  // full plan attached, so they are pre-qualified: the brief in `plan_summary`
  // carries the status, the money, the gap, and what is missing.
  "campaign-calculator": {
    label: "Campaign Calculator", labelEs: "Calculadora de Campaña", emoji: "🧮", tag: "Campaign Calculator Lead",
    replyContext: "campaign investment plan", replyContextEs: "plan de inversión de campaña",
    fields: { type: "Looking for", timeframe: "Campaign length", date: "Start date", venue: "Campaign destination", attendees: "Audience size" },
    servicesLabel: "Channels",
  },
  // Sent only after someone has received the complete public Website Opportunity
  // Audit and explicitly asks for help. `plan_summary` carries the score,
  // dimensions, and priority plan in the visitor's selected language.
  "website-audit": {
    label: "Website Opportunity Audit", labelEs: "Auditoría de Oportunidades Web", emoji: "🧭", tag: "Website Audit Lead",
    replyContext: "website audit follow-up request", replyContextEs: "solicitud de seguimiento de auditoría web",
    fields: { type: "Preferred pathway", timeframe: "Timeline", date: "Audit ID", venue: "Website", attendees: "Opportunity score" },
    servicesLabel: "Top opportunities",
  },
};

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

const esc = (s: unknown) =>
  String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));

interface LeadPayload {
  source?:          string;
  lang?:            string;
  event_type:       string;
  services:         string[];
  industry?:        string | null;
  event_timeframe?: string | null;
  event_date?:      string | null;
  venue?:           string | null;
  attendees?:       string | null;
  budget?:          string | null;
  contact_name:     string;
  contact_email:    string;
  contact_phone?:   string | null;
  company?:         string | null;
  message?:         string | null;
  /** Optional pre-computed brief (campaign calculator). Rendered verbatim. */
  plan_summary?:    { label: string; value: string }[];
  /** Optional PDF built in the browser, attached to both emails. */
  attachment?:      { filename: string; content_base64: string };
  /** Service-only downstream deduplication key supplied by the audit outbox. */
  idempotency_key?: string;
  /** Service-only stable audit context retained after the short-lived audit expires. */
  audit_summary?: Record<string, unknown>;
  consent_record?: Record<string, unknown>;
  hp?:              string;
}

class LeadRequestError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}

async function readLimitedJson(req: Request): Promise<Record<string, unknown>> {
  const declared = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
    throw new LeadRequestError("Request too large", 413);
  }
  if (!req.body) throw new LeadRequestError("Invalid JSON");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_REQUEST_BYTES) {
      await reader.cancel();
      throw new LeadRequestError("Request too large", 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new LeadRequestError("Invalid JSON"); }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new LeadRequestError("Invalid JSON");
  return parsed as Record<string, unknown>;
}

function field(value: unknown, maximum: number): string {
  return typeof value === "string" ? value.trim().slice(0, maximum) : "";
}

function nullableField(value: unknown, maximum: number): string | null {
  const result = field(value, maximum);
  return result || null;
}

function normalizedLead(raw: Record<string, unknown>): LeadPayload {
  const attachment = raw.attachment && typeof raw.attachment === "object" && !Array.isArray(raw.attachment)
    ? raw.attachment as Record<string, unknown>
    : null;
  return {
    source: field(raw.source, 80) || undefined,
    lang: raw.lang === "es" ? "es" : "en",
    event_type: field(raw.event_type, 200),
    services: Array.isArray(raw.services)
      ? raw.services.filter((value): value is string => typeof value === "string").slice(0, 20).map((value) => value.trim().slice(0, 160)).filter(Boolean)
      : [],
    industry: nullableField(raw.industry, 200),
    event_timeframe: nullableField(raw.event_timeframe, 160),
    event_date: nullableField(raw.event_date, 160),
    venue: nullableField(raw.venue, 500),
    attendees: nullableField(raw.attendees, 160),
    budget: nullableField(raw.budget, 160),
    contact_name: field(raw.contact_name, 160),
    contact_email: field(raw.contact_email, 254).toLowerCase(),
    contact_phone: nullableField(raw.contact_phone, 80),
    company: nullableField(raw.company, 200),
    message: nullableField(raw.message, 4_000),
    plan_summary: Array.isArray(raw.plan_summary) ? raw.plan_summary as { label: string; value: string }[] : undefined,
    attachment: attachment
      ? { filename: field(attachment.filename, 180), content_base64: field(attachment.content_base64, MAX_REQUEST_BYTES) }
      : undefined,
    idempotency_key: field(raw.idempotency_key, 100) || undefined,
    audit_summary: raw.audit_summary && typeof raw.audit_summary === "object" && !Array.isArray(raw.audit_summary)
      ? raw.audit_summary as Record<string, unknown> : undefined,
    consent_record: raw.consent_record && typeof raw.consent_record === "object" && !Array.isArray(raw.consent_record)
      ? raw.consent_record as Record<string, unknown> : undefined,
    hp: field(raw.hp, 200) || undefined,
  };
}

async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

const recentPublicRequests = new Map<string, number[]>();

function enforceWorkerLimit(key: string, limit: number): void {
  const now = Date.now();
  const since = now - 10 * 60_000;
  if (recentPublicRequests.size > 5_000) {
    for (const [candidate, times] of recentPublicRequests) {
      if (times.every((time) => time < since)) recentPublicRequests.delete(candidate);
      if (recentPublicRequests.size <= 4_000) break;
    }
    while (recentPublicRequests.size > 5_000) recentPublicRequests.delete(recentPublicRequests.keys().next().value as string);
  }
  const recent = (recentPublicRequests.get(key) ?? []).filter((time) => time >= since);
  if (recent.length >= limit) throw new LeadRequestError("Too many requests. Try again later.", 429);
  recent.push(now);
  recentPublicRequests.set(key, recent);
}

// deno-lint-ignore no-explicit-any
async function enforceDurableLimit(admin: any, scope: string, fingerprint: string, limit: number): Promise<void> {
  const keyHash = await sha256(`${scope}:${fingerprint}`);
  const { data, error } = await admin.rpc("consume_edge_rate_limit", {
    p_scope: scope,
    p_key_hash: keyHash,
    p_limit: limit,
    p_window_seconds: 600,
  });
  if (error) {
    console.error("submit-av-lead durable rate limit failed", error.message);
    throw new LeadRequestError("Lead capture is temporarily unavailable.", 503);
  }
  if (data !== true) throw new LeadRequestError("Too many requests. Try again later.", 429);
}

/**
 * Validates the client-supplied attachment. It arrives from a public endpoint,
 * so the filename is stripped to a safe basename and the payload is checked for
 * being base64 and for size before it is ever handed to SendGrid.
 */
function attachmentOf(l: LeadPayload): { content: string; filename: string; type: string; disposition: string }[] {
  const a = l.attachment;
  if (!a || typeof a.content_base64 !== "string" || typeof a.filename !== "string") return [];

  const content = a.content_base64.replace(/\s/g, "");
  if (!content || content.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(content)) {
    throw new LeadRequestError("Attachment must be a valid PDF.");
  }
  // 4 base64 chars encode 3 bytes.
  const padding = content.endsWith("==") ? 2 : content.endsWith("=") ? 1 : 0;
  const bytes = Math.floor(content.length * 3 / 4) - padding;
  if (bytes > MAX_ATTACHMENT_BYTES) {
    throw new LeadRequestError("Attachment is too large.", 413);
  }

  const filename = (a.filename.split(/[\\/]/).pop() ?? "")
    .replace(/[^\w\s.,()-]/g, "")
    .slice(0, 120) || "campaign-investment-plan.pdf";
  if (!/\.pdf$/i.test(filename)) throw new LeadRequestError("Attachment must be a PDF.");
  let signature = "";
  try { signature = atob(content.slice(0, 12)); } catch { throw new LeadRequestError("Attachment must be a valid PDF."); }
  if (!signature.startsWith("%PDF-")) throw new LeadRequestError("Attachment must be a valid PDF.");

  return [{ content, filename, type: "application/pdf", disposition: "attachment" }];
}

/** Guards against a client sending an oversized or malformed brief. */
function planLines(l: LeadPayload): { label: string; value: string }[] {
  if (!Array.isArray(l.plan_summary)) return [];
  return l.plan_summary
    .filter((p) => p && typeof p.label === "string" && typeof p.value === "string")
    .slice(0, 20)
    .map((p) => ({ label: p.label.slice(0, 60), value: p.value.slice(0, 400) }));
}

function row(label: string, value?: string | null): string {
  if (!value) return "";
  return `<tr>
    <td style="padding:5px 12px 5px 0;font-size:12px;color:#6B7280;white-space:nowrap;vertical-align:top;">${label}</td>
    <td style="padding:5px 0;font-size:13px;color:#111827;line-height:1.5;">${value}</td>
  </tr>`;
}

// Team notification, always English
function teamEmail(l: LeadPayload, cfg: FormConfig, id: string, isEs: boolean): string {
  const services = (l.services ?? []).map(esc).join(" · ") || "-";
  const plan = planLines(l);
  const planBlock = plan.length === 0 ? "" : `
        <div style="height:1px;background:#eee;margin:18px 0;"></div>
        <p style="margin:0 0 8px;font-size:12px;font-weight:700;color:${BRAND};text-transform:uppercase;letter-spacing:0.04em;">The plan they built</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
          ${plan.map((p) => row(esc(p.label), esc(p.value))).join("")}
        </table>`;
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;"><tr><td align="center" style="padding:32px 16px 0;">
    <table role="presentation" style="max-width:580px;width:100%;" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding:0 0 20px;"><img src="${LV_LOGO_URL}" alt="LV Branding" width="52" height="52" style="display:block;border:0;width:52px;height:52px;"/></td></tr>
      <tr><td style="background:#fff;border-radius:14px;padding:28px 32px;border:1px solid #e4e4e7;">
        <div style="background:#FFF1F2;border-left:4px solid ${BRAND};border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:24px;">
          <p style="margin:0;font-size:15px;font-weight:700;color:${BRAND};">${cfg.emoji} New ${cfg.label} Lead${isEs ? " 🇪🇸" : ""}</p>
          <p style="margin:4px 0 0;font-size:13px;color:#9B1C2A;"><strong>${esc(l.contact_name)}</strong>${l.company ? ` · ${esc(l.company)}` : ""} wants to talk about a project.${isEs ? " (Spanish form, prefers Spanish)" : ""}</p>
        </div>
        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
          ${row(cfg.fields.type, esc(l.event_type))}
          ${row(cfg.servicesLabel ?? "Services", services)}
          ${row("Industry", esc(l.industry))}
          ${row(cfg.fields.timeframe, esc(l.event_timeframe))}
          ${row(cfg.fields.date, esc(l.event_date))}
          ${row(cfg.fields.venue, esc(l.venue))}
          ${row(cfg.fields.attendees, esc(l.attendees))}
          ${row("Budget", esc(l.budget))}
        </table>
        <div style="height:1px;background:#eee;margin:18px 0;"></div>
        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
          ${row("Name", esc(l.contact_name))}
          ${row("Email", `<a href="mailto:${esc(l.contact_email)}" style="color:${BRAND};">${esc(l.contact_email)}</a>`)}
          ${row("Phone", l.contact_phone ? `<a href="tel:${esc(l.contact_phone)}" style="color:${BRAND};">${esc(l.contact_phone)}</a>` : null)}
          ${row("Company", esc(l.company))}
          ${row("Message", l.message ? esc(l.message).replace(/\n/g, "<br>") : null)}
        </table>
        ${planBlock}
      </td></tr>
      <tr><td align="center" style="padding:20px 0 32px;font-size:11px;color:#9CA3AF;line-height:1.8;">LV Branding · ${esc(cfg.label)} lead · ${esc(id)}</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

// Prospect auto-reply, in the visitor's language
function replyEmail(l: LeadPayload, cfg: FormConfig, isEs: boolean, hasPdf = false): string {
  const first = esc(l.contact_name.split(" ")[0] || l.contact_name);
  const homeUrl = isEs ? "https://es.lvbranding.com" : "https://www.lvbranding.com";
  const t = isEs
    ? {
        h1:   `¡Gracias, ${first}, lo recibimos!`,
        p1:   `Tu ${esc(cfg.replyContextEs)} llegó a nuestro equipo. Revisaremos los detalles y te contactaremos en un día hábil para agendar una llamada.`,
        p2:   `Mientras tanto, si algo es urgente, responde a este correo y nos llega directo.`,
        planH: "Tu plan, para que lo tengas a la mano:",
        pdf:  "El plan completo va adjunto en PDF, para que lo guardes o lo compartas con tu equipo.",
        cta:  "Explora LV Branding →",
        foot: `LV Branding · ${esc(cfg.labelEs)} · Houston, TX`,
      }
    : {
        h1:   `Thanks, ${first}, we've got it.`,
        p1:   `Your ${esc(cfg.replyContext)} just landed with our team. We'll review the details and reach out within one business day to book a discovery call.`,
        p2:   `In the meantime, if anything's time-sensitive, just reply to this email and it comes straight to us.`,
        planH: "Here's the plan you built, so you have it on hand:",
        pdf:  "The full plan is attached as a PDF, so you can keep it or pass it on to your team.",
        cta:  "Explore LV Branding →",
        foot: `LV Branding · ${esc(cfg.label)} · Houston, TX`,
      };

  // The prospect keeps their plan whatever happens next; sending it back is the
  // point of the "just send me the plan" option, and it makes the copy true.
  const plan = planLines(l);
  const planBlock = plan.length === 0 ? "" : `
        <p style="margin:0 0 10px;font-size:13px;font-weight:700;color:#111827;">${t.planH}</p>
        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;background:#FAFAFA;border:1px solid #e4e4e7;border-radius:10px;padding:4px 14px;margin:0 0 20px;">
          ${plan.map((p) => row(esc(p.label), esc(p.value))).join("")}
        </table>`;

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;"><tr><td align="center" style="padding:32px 16px 0;">
    <table role="presentation" style="max-width:560px;width:100%;" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding:0 0 20px;"><img src="${LV_LOGO_URL}" alt="LV Branding" width="52" height="52" style="display:block;border:0;width:52px;height:52px;"/></td></tr>
      <tr><td style="background:#fff;border-radius:14px;padding:32px;border:1px solid #e4e4e7;">
        <h1 style="margin:0 0 12px;font-size:20px;color:#111827;">${t.h1}</h1>
        <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.65;">${t.p1}</p>
        <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.65;">${t.p2}</p>
        ${planBlock}
        ${hasPdf ? `<p style="margin:0 0 20px;font-size:13px;color:#4B5563;line-height:1.6;">📄 ${t.pdf}</p>` : ""}
        <table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px 0 4px;"><tr>
          <td style="border-radius:10px;background:${BRAND};">
            <a href="${homeUrl}" target="_blank" style="display:inline-block;padding:12px 26px;font-size:14px;font-weight:700;color:#fff;text-decoration:none;border-radius:10px;">${t.cta}</a>
          </td>
        </tr></table>
      </td></tr>
      <tr><td align="center" style="padding:20px 0 32px;font-size:11px;color:#9CA3AF;line-height:1.8;">${t.foot}</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

// deno-lint-ignore no-explicit-any
async function syncToCrm(admin: any, l: LeadPayload, cfg: FormConfig, leadId: string, isEs: boolean): Promise<boolean> {
  try {
    const email = l.contact_email.trim().toLowerCase();
    const parts = l.contact_name.trim().split(/\s+/);
    const first = parts[0] || l.contact_name.trim();
    const last  = parts.slice(1).join(" ") || null;

    const plan = planLines(l);
    const deliveryMarker = `[Lead delivery: ${leadId}]`;
    const note = [
      deliveryMarker,
      `${cfg.label} lead (website form${isEs ? " · Spanish" : ""})`,
      l.event_type       ? `${cfg.fields.type}: ${l.event_type}` : null,
      l.services?.length ? `${cfg.servicesLabel ?? "Services"}: ${l.services.join(", ")}` : null,
      l.industry         ? `Industry: ${l.industry}` : null,
      l.event_timeframe  ? `${cfg.fields.timeframe}: ${l.event_timeframe}` : null,
      l.event_date       ? `${cfg.fields.date}: ${l.event_date}` : null,
      l.venue            ? `${cfg.fields.venue}: ${l.venue}` : null,
      l.attendees        ? `${cfg.fields.attendees}: ${l.attendees}` : null,
      l.budget           ? `Budget: ${l.budget}` : null,
      l.message          ? `Notes: ${l.message}` : null,
      plan.length        ? `\nTHE PLAN THEY BUILT\n${plan.map((p) => `${p.label}: ${p.value}`).join("\n")}` : null,
    ].filter(Boolean).join("\n");

    const baseTags = isEs ? [cfg.tag, "Website", "Español"] : [cfg.tag, "Website"];

    const { data: existing, error: lookupError } = await admin
      .from("contacts")
      .select("id, crm_notes, tags, phone, company")
      .eq("org_id", CRM_ORG_ID)
      .eq("email", email)
      .maybeSingle();
    if (lookupError) throw new Error(lookupError.message);

    if (existing) {
      if (typeof existing.crm_notes === "string" && existing.crm_notes.includes(deliveryMarker)) return true;
      const tags = Array.from(new Set([...(existing.tags ?? []), ...baseTags]));
      const { error } = await admin.from("contacts").update({
        crm_notes: `${note}\n\n${existing.crm_notes ?? ""}`.trim(),
        tags,
        phone:     existing.phone   || l.contact_phone || null,
        company:   existing.company || l.company       || null,
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await admin.from("contacts").insert({
        org_id:         CRM_ORG_ID,
        first_name:     first,
        last_name:      last,
        company:        l.company || null,
        email,
        phone:          l.contact_phone || null,
        source:         "manual",
        source_id:      leadId,
        pipeline_stage: "lead",
        tags:           baseTags,
        crm_notes:      note,
        // The attachment is stripped: storing a base64 PDF here would add tens
        // of kilobytes to every contact row for no retrievable benefit.
        raw_data:       { ...l, attachment: undefined } as unknown as Record<string, unknown>,
      });
      if (error) throw new Error(error.message);
    }
    return true;
  } catch (e) {
    console.error("CRM sync error:", e);
    return false;
  }
}

type Attachment = { content: string; filename: string; type: string; disposition: string };

async function sendMail(
  to: { email: string; name?: string }[],
  subject: string,
  html: string,
  replyTo?: string,
  attachments: Attachment[] = [],
): Promise<boolean> {
  if (!SENDGRID_API_KEY) { console.error("SENDGRID_API_KEY not set, skipping email"); return false; }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8_000);
  try {
    const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method:  "POST",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${SENDGRID_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to }],
        from:    { email: FROM_EMAIL, name: FROM_NAME },
        ...(replyTo ? { reply_to: { email: replyTo } } : {}),
        subject,
        content: [{ type: "text/html", value: html }],
        ...(attachments.length > 0 ? { attachments } : {}),
      }),
    });
    if (res.status === 202) return true;
    console.error("SendGrid error:", res.status, (await res.text()).slice(0, 500));
    return false;
  } catch (error) {
    console.error("SendGrid request error:", error);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (!(req.headers.get("content-type") || "").toLowerCase().startsWith("application/json")) {
    return json({ error: "Content-Type must be application/json" }, 415);
  }

  let l: LeadPayload;
  try {
    l = normalizedLead(await readLimitedJson(req));
  } catch (error) {
    if (error instanceof LeadRequestError) return json({ error: error.message }, error.status);
    return json({ error: "Invalid JSON" }, 400);
  }

  const source = l.source || "av-landing";
  // Website-audit summaries contain trusted scores and internal routing data.
  // Only the audit gateway may use this source; a browser's public key cannot
  // impersonate a completed audit or inject a fabricated CRM brief.
  const trustedAudit = Boolean(SERVICE_ROLE_KEY) && source === "website-audit" &&
    req.headers.get("authorization") === `Bearer ${SERVICE_ROLE_KEY}`;
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  if (!trustedAudit) {
    const clientFingerprint = (
      req.headers.get("cf-connecting-ip") ||
      req.headers.get("x-forwarded-for")?.split(",")[0] ||
      req.headers.get("x-real-ip") ||
      `unknown:${(req.headers.get("user-agent") || "unknown").slice(0, 160)}`
    ).trim().slice(0, 200);
    try {
      enforceWorkerLimit(`client:${clientFingerprint}`, 10);
      await enforceDurableLimit(admin, "submit-av-lead-client", clientFingerprint, 10);
    } catch (error) {
      if (error instanceof LeadRequestError) return json({ error: error.message }, error.status);
      console.error("submit-av-lead client admission failed", error);
      return json({ error: "Lead capture is temporarily unavailable." }, 503);
    }
  }
  if (l.hp) return json({ ok: true });
  if (!Object.prototype.hasOwnProperty.call(FORM_CONFIGS, source)) {
    return json({ error: "Unsupported lead source" }, 400);
  }
  if (source === "website-audit" && !trustedAudit) {
    return json({ error: "Use the authorized website audit lead endpoint." }, 403);
  }
  if (trustedAudit && !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(l.idempotency_key || "")) {
    return json({ error: "Missing audit delivery key" }, 400);
  }

  if (!l.contact_name?.trim() || !l.contact_email?.trim() || !l.event_type?.trim()) {
    return json({ error: "Missing required fields" }, 400);
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(l.contact_email)) {
    return json({ error: "Invalid email" }, 400);
  }

  const isEs = l.lang === "es";
  const cfg = FORM_CONFIGS[source];
  let attachments: Attachment[];
  try {
    if (!trustedAudit) {
      await enforceDurableLimit(admin, "submit-av-lead-email", l.contact_email, 4);
    }
    if (l.attachment && source !== "campaign-calculator") {
      throw new LeadRequestError("Attachments are not supported for this form.");
    }
    attachments = attachmentOf(l);
  } catch (error) {
    if (error instanceof LeadRequestError) return json({ error: error.message }, error.status);
    console.error("submit-av-lead admission failed", error);
    return json({ error: "Lead capture is temporarily unavailable." }, 503);
  }

  // `event_date` is a date column, but it is fed by free-text fields across
  // eight public funnels. Anything that is not an ISO date is dropped rather
  // than sent to Postgres, which would reject the whole row and lose the lead.
  const eventDate = /^\d{4}-\d{2}-\d{2}$/.test(l.event_date ?? "") ? l.event_date : null;
  if (l.event_date && !eventDate) {
    console.warn("submit-av-lead: dropping non-date event_date", source, String(l.event_date).slice(0, 60));
  }

  const leadValues = {
    source,
    lang:            isEs ? "es" : "en",
    event_type:      l.event_type,
    services:        l.services,
    industry:        l.industry ?? null,
    event_timeframe: l.event_timeframe ?? null,
    event_date:      eventDate,
    venue:           l.venue ?? null,
    attendees:       l.attendees ?? null,
    budget:          l.budget ?? null,
    contact_name:    l.contact_name,
    contact_email:   l.contact_email,
    contact_phone:   l.contact_phone ?? null,
    company:         l.company ?? null,
    message:         l.message ?? null,
    ...(trustedAudit ? {
      idempotency_key: l.idempotency_key,
      audit_summary: l.audit_summary ?? {},
      consent_record: l.consent_record ?? {},
    } : {}),
  };
  const insertResult = trustedAudit
    ? await admin.from("av_leads")
      .upsert(leadValues, { onConflict: "idempotency_key", ignoreDuplicates: true })
      .select("id,crm_synced_at,team_email_sent_at,prospect_email_sent_at")
      .maybeSingle()
    : await admin.from("av_leads").insert(leadValues)
      .select("id,crm_synced_at,team_email_sent_at,prospect_email_sent_at")
      .single();
  type DeliveryLeadRow = {
    id: string;
    crm_synced_at: string | null;
    team_email_sent_at: string | null;
    prospect_email_sent_at: string | null;
  };
  let inserted = insertResult.data as DeliveryLeadRow | null;
  const error = insertResult.error;

  if (error) {
    console.error("Insert error:", error);
    return json({ error: "Could not save your request. Please try again." }, 500);
  }
  if (!inserted && trustedAudit) {
    const existing = await admin.from("av_leads")
      .select("id,crm_synced_at,team_email_sent_at,prospect_email_sent_at")
      .eq("idempotency_key", l.idempotency_key)
      .maybeSingle();
    if (existing.error || !existing.data) {
      console.error("Idempotent lead lookup error:", existing.error);
      return json({ error: "Could not save your request. Please try again." }, 500);
    }
    inserted = existing.data as DeliveryLeadRow;
  }
  if (!inserted) return json({ error: "Could not save your request. Please try again." }, 500);

  const replySubject = isEs
    ? `Recibimos tu ${cfg.replyContextEs} · LV Branding`
    : `We received your ${cfg.replyContext} · LV Branding`;

  const teamSubject = `${cfg.emoji} New ${cfg.label} lead${isEs ? " 🇪🇸" : ""}: ${l.contact_name}${l.company ? ` (${l.company})` : ""}`;

  if (trustedAudit) {
    const failures: string[] = [];
    const markStep = async (column: "crm_synced_at" | "team_email_sent_at" | "prospect_email_sent_at"): Promise<boolean> => {
      const { error } = await admin.from("av_leads").update({
        [column]: new Date().toISOString(),
        delivery_updated_at: new Date().toISOString(),
      }).eq("id", inserted!.id);
      if (error) console.error(`Lead delivery ${column} update failed:`, error.message);
      return !error;
    };

    if (!inserted.crm_synced_at) {
      if (!(await syncToCrm(admin, l, cfg, inserted.id, isEs)) || !(await markStep("crm_synced_at"))) {
        failures.push("crm");
      }
    }

    const [teamSent, prospectSent] = await Promise.all([
      inserted.team_email_sent_at
        ? Promise.resolve(true)
        : sendMail(NOTIFY_RECIPIENTS, teamSubject, teamEmail(l, cfg, inserted.id, isEs), l.contact_email, attachments),
      inserted.prospect_email_sent_at
        ? Promise.resolve(true)
        : sendMail([{ email: l.contact_email, name: l.contact_name }], replySubject, replyEmail(l, cfg, isEs, attachments.length > 0), FROM_EMAIL, attachments),
    ]);
    if (!inserted.team_email_sent_at && (!teamSent || !(await markStep("team_email_sent_at")))) failures.push("team_email");
    if (!inserted.prospect_email_sent_at && (!prospectSent || !(await markStep("prospect_email_sent_at")))) failures.push("prospect_email");

    if (failures.length) {
      await admin.from("av_leads").update({
        delivery_last_error: `Incomplete steps: ${failures.join(", ")}`,
        delivery_updated_at: new Date().toISOString(),
      }).eq("id", inserted.id);
      return json({ error: "Lead saved; delivery will retry.", accepted: true, id: inserted.id }, 502);
    }
    await admin.from("av_leads").update({ delivery_last_error: null, delivery_updated_at: new Date().toISOString() }).eq("id", inserted.id);
    return json({ ok: true, id: inserted.id });
  }

  // Existing public forms keep their best-effort behavior; the audit bridge is
  // stricter because its upstream outbox retries any incomplete step.
  await syncToCrm(admin, l, cfg, inserted.id, isEs);
  await Promise.allSettled([
    sendMail(NOTIFY_RECIPIENTS, teamSubject, teamEmail(l, cfg, inserted.id, isEs), l.contact_email, attachments),
    sendMail([{ email: l.contact_email, name: l.contact_name }], replySubject, replyEmail(l, cfg, isEs, attachments.length > 0), FROM_EMAIL, attachments),
  ]);

  return json({ ok: true, id: inserted.id });
});
