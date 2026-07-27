/**
 * submit-av-lead — public endpoint (no JWT required)
 * Shared lead-capture backend for the LV Branding service landing forms (EN + ES):
 *   av-landing · web-solutions · ux-ui-design · creative-content ·
 *   photo-video · brand-strategy · digital-marketing
 *
 *   1. Inserts the lead into public.av_leads (service role — bypasses RLS)
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
};

const cors = {
  "Access-Control-Allow-Origin":  "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
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
  hp?:              string;
}

function row(label: string, value?: string | null): string {
  if (!value) return "";
  return `<tr>
    <td style="padding:5px 12px 5px 0;font-size:12px;color:#6B7280;white-space:nowrap;vertical-align:top;">${label}</td>
    <td style="padding:5px 0;font-size:13px;color:#111827;line-height:1.5;">${value}</td>
  </tr>`;
}

// Team notification — always English
function teamEmail(l: LeadPayload, cfg: FormConfig, id: string, isEs: boolean): string {
  const services = (l.services ?? []).map(esc).join(" · ") || "—";
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;"><tr><td align="center" style="padding:32px 16px 0;">
    <table role="presentation" style="max-width:580px;width:100%;" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding:0 0 20px;"><img src="${LV_LOGO_URL}" alt="LV Branding" width="52" height="52" style="display:block;border:0;width:52px;height:52px;"/></td></tr>
      <tr><td style="background:#fff;border-radius:14px;padding:28px 32px;border:1px solid #e4e4e7;">
        <div style="background:#FFF1F2;border-left:4px solid ${BRAND};border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:24px;">
          <p style="margin:0;font-size:15px;font-weight:700;color:${BRAND};">${cfg.emoji} New ${cfg.label} Lead${isEs ? " 🇪🇸" : ""}</p>
          <p style="margin:4px 0 0;font-size:13px;color:#9B1C2A;"><strong>${esc(l.contact_name)}</strong>${l.company ? ` · ${esc(l.company)}` : ""} wants to talk about a project.${isEs ? " (Spanish form — prefers Spanish)" : ""}</p>
        </div>
        <table cellpadding="0" cellspacing="0" style="width:100%;border-collapse:collapse;">
          ${row(cfg.fields.type, esc(l.event_type))}
          ${row("Services", services)}
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
      </td></tr>
      <tr><td align="center" style="padding:20px 0 32px;font-size:11px;color:#9CA3AF;line-height:1.8;">LV Branding · ${esc(cfg.label)} lead · ${esc(id)}</td></tr>
    </table>
  </td></tr></table>
</body></html>`;
}

// Prospect auto-reply — in the visitor's language
function replyEmail(l: LeadPayload, cfg: FormConfig, isEs: boolean): string {
  const first = esc(l.contact_name.split(" ")[0] || l.contact_name);
  const homeUrl = isEs ? "https://es.lvbranding.com" : "https://www.lvbranding.com";
  const t = isEs
    ? {
        h1:   `¡Gracias, ${first} — lo recibimos!`,
        p1:   `Tu ${esc(cfg.replyContextEs)} llegó a nuestro equipo. Revisaremos los detalles y te contactaremos en un día hábil para agendar una llamada.`,
        p2:   `Mientras tanto, si algo es urgente, responde a este correo y nos llega directo.`,
        cta:  "Explora LV Branding →",
        foot: `LV Branding · ${esc(cfg.labelEs)} · Houston, TX`,
      }
    : {
        h1:   `Thanks, ${first} — we've got it.`,
        p1:   `Your ${esc(cfg.replyContext)} just landed with our team. We'll review the details and reach out within one business day to book a discovery call.`,
        p2:   `In the meantime, if anything's time-sensitive, just reply to this email and it comes straight to us.`,
        cta:  "Explore LV Branding →",
        foot: `LV Branding · ${esc(cfg.label)} · Houston, TX`,
      };
  return `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;"><tr><td align="center" style="padding:32px 16px 0;">
    <table role="presentation" style="max-width:560px;width:100%;" cellpadding="0" cellspacing="0">
      <tr><td align="center" style="padding:0 0 20px;"><img src="${LV_LOGO_URL}" alt="LV Branding" width="52" height="52" style="display:block;border:0;width:52px;height:52px;"/></td></tr>
      <tr><td style="background:#fff;border-radius:14px;padding:32px;border:1px solid #e4e4e7;">
        <h1 style="margin:0 0 12px;font-size:20px;color:#111827;">${t.h1}</h1>
        <p style="margin:0 0 16px;font-size:14px;color:#374151;line-height:1.65;">${t.p1}</p>
        <p style="margin:0 0 20px;font-size:14px;color:#374151;line-height:1.65;">${t.p2}</p>
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
async function syncToCrm(admin: any, l: LeadPayload, cfg: FormConfig, leadId: string, isEs: boolean) {
  try {
    const email = l.contact_email.trim();
    const parts = l.contact_name.trim().split(/\s+/);
    const first = parts[0] || l.contact_name.trim();
    const last  = parts.slice(1).join(" ") || null;

    const note = [
      `${cfg.label} lead (website form${isEs ? " · Spanish" : ""})`,
      l.event_type       ? `${cfg.fields.type}: ${l.event_type}` : null,
      l.services?.length ? `Services: ${l.services.join(", ")}` : null,
      l.industry         ? `Industry: ${l.industry}` : null,
      l.event_timeframe  ? `${cfg.fields.timeframe}: ${l.event_timeframe}` : null,
      l.event_date       ? `${cfg.fields.date}: ${l.event_date}` : null,
      l.venue            ? `${cfg.fields.venue}: ${l.venue}` : null,
      l.attendees        ? `${cfg.fields.attendees}: ${l.attendees}` : null,
      l.budget           ? `Budget: ${l.budget}` : null,
      l.message          ? `Notes: ${l.message}` : null,
    ].filter(Boolean).join("\n");

    const baseTags = isEs ? [cfg.tag, "Website", "Español"] : [cfg.tag, "Website"];

    const { data: existing } = await admin
      .from("contacts")
      .select("id, crm_notes, tags, phone, company")
      .eq("org_id", CRM_ORG_ID)
      .ilike("email", email)
      .maybeSingle();

    if (existing) {
      const tags = Array.from(new Set([...(existing.tags ?? []), ...baseTags]));
      await admin.from("contacts").update({
        crm_notes: `${note}\n\n${existing.crm_notes ?? ""}`.trim(),
        tags,
        phone:     existing.phone   || l.contact_phone || null,
        company:   existing.company || l.company       || null,
        updated_at: new Date().toISOString(),
      }).eq("id", existing.id);
    } else {
      await admin.from("contacts").insert({
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
        raw_data:       l as unknown as Record<string, unknown>,
      });
    }
  } catch (e) {
    console.error("CRM sync error:", e);
  }
}

async function sendMail(to: { email: string; name?: string }[], subject: string, html: string, replyTo?: string) {
  if (!SENDGRID_API_KEY) { console.error("SENDGRID_API_KEY not set — skipping email"); return; }
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method:  "POST",
    headers: { Authorization: `Bearer ${SENDGRID_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to }],
      from:    { email: FROM_EMAIL, name: FROM_NAME },
      ...(replyTo ? { reply_to: { email: replyTo } } : {}),
      subject,
      content: [{ type: "text/html", value: html }],
    }),
  });
  if (res.status !== 202) console.error("SendGrid error:", res.status, await res.text());
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  let l: LeadPayload;
  try { l = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  if (l.hp) return json({ ok: true });

  if (!l.contact_name?.trim() || !l.contact_email?.trim() || !l.event_type?.trim()) {
    return json({ error: "Missing required fields" }, 400);
  }
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(l.contact_email)) {
    return json({ error: "Invalid email" }, 400);
  }

  const isEs = l.lang === "es";
  const cfg = FORM_CONFIGS[l.source ?? "av-landing"] ?? FORM_CONFIGS["av-landing"];
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: inserted, error } = await admin
    .from("av_leads")
    .insert({
      source:          l.source ?? "av-landing",
      lang:            isEs ? "es" : "en",
      event_type:      l.event_type.trim(),
      services:        Array.isArray(l.services) ? l.services : [],
      industry:        l.industry ?? null,
      event_timeframe: l.event_timeframe ?? null,
      event_date:      l.event_date || null,
      venue:           l.venue ?? null,
      attendees:       l.attendees ?? null,
      budget:          l.budget ?? null,
      contact_name:    l.contact_name.trim(),
      contact_email:   l.contact_email.trim(),
      contact_phone:   l.contact_phone ?? null,
      company:         l.company ?? null,
      message:         l.message ?? null,
    })
    .select("id")
    .single();

  if (error || !inserted) {
    console.error("Insert error:", error);
    return json({ error: "Could not save your request. Please try again." }, 500);
  }

  await syncToCrm(admin, l, cfg, inserted.id, isEs);

  const replySubject = isEs
    ? `Recibimos tu ${cfg.replyContextEs} — LV Branding`
    : `We received your ${cfg.replyContext} — LV Branding`;

  try {
    await Promise.allSettled([
      sendMail(NOTIFY_RECIPIENTS, `${cfg.emoji} New ${cfg.label} lead${isEs ? " 🇪🇸" : ""}: ${l.contact_name}${l.company ? ` (${l.company})` : ""}`, teamEmail(l, cfg, inserted.id, isEs), l.contact_email),
      sendMail([{ email: l.contact_email, name: l.contact_name }], replySubject, replyEmail(l, cfg, isEs), FROM_EMAIL),
    ]);
  } catch (e) {
    console.error("Email dispatch error:", e);
  }

  return json({ ok: true, id: inserted.id });
});
