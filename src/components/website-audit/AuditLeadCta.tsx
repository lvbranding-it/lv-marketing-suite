import { useEffect, useRef, useState } from "react";
import { ArrowRight, Check, Loader2, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { auditCopyFor } from "@/lib/website-audit/copy";
import { recordAuditEvent, submitAuditLead } from "@/lib/website-audit/api";
import type { AuditLanguage, AuditReport, OpportunityRoute } from "@/lib/website-audit/types";

interface AuditLeadCtaProps {
  language: AuditLanguage;
  report: AuditReport;
}

type Timeline = "now" | "one-three" | "three-six" | "exploring";
type Status = "idle" | "sending" | "sent" | "error";
type LeadErrorCode = "required" | "invalidEmail";
type LeadErrorField = "name" | "email" | "company" | "consent";
type LeadErrors = Partial<Record<LeadErrorField, LeadErrorCode>>;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LEAD_DRAFT_TTL_MS = 30 * 24 * 60 * 60_000;

interface LeadDraft {
  open: boolean;
  name: string;
  email: string;
  company: string;
  pathway: OpportunityRoute;
  timeline: Timeline;
  context: string;
  consent: boolean;
}
interface StoredLeadDraft extends LeadDraft { savedAt: string }

const leadDraftKey = (auditId: string) => `lv-website-opportunity-audit:lead-draft:${auditId}`;

function loadLeadDraft(auditId: string, route: OpportunityRoute): LeadDraft {
  const fallback: LeadDraft = { open: false, name: "", email: "", company: "", pathway: route, timeline: "exploring", context: "", consent: false };
  try {
    const parsed = JSON.parse(sessionStorage.getItem(leadDraftKey(auditId)) || "null") as Partial<StoredLeadDraft> | null;
    if (!parsed) return fallback;
    const savedAt = new Date(parsed.savedAt ?? "").getTime();
    if (!Number.isFinite(savedAt) || Date.now() - savedAt >= LEAD_DRAFT_TTL_MS) {
      sessionStorage.removeItem(leadDraftKey(auditId));
      return fallback;
    }
    return {
      open: Boolean(parsed.open),
      name: typeof parsed.name === "string" ? parsed.name.slice(0, 160) : "",
      email: typeof parsed.email === "string" ? parsed.email.slice(0, 254) : "",
      company: typeof parsed.company === "string" ? parsed.company.slice(0, 200) : "",
      pathway: parsed.pathway && ["improve", "ux", "redesign", "platform"].includes(parsed.pathway) ? parsed.pathway : route,
      timeline: parsed.timeline && ["now", "one-three", "three-six", "exploring"].includes(parsed.timeline) ? parsed.timeline : "exploring",
      context: typeof parsed.context === "string" ? parsed.context.slice(0, 1600) : "",
      consent: Boolean(parsed.consent),
    };
  } catch { return fallback; }
}

export default function AuditLeadCta({ language, report }: AuditLeadCtaProps) {
  const copy = auditCopyFor(language);
  const recommended = copy.routes[report.opportunityRoute];
  const initial = useRef(loadLeadDraft(report.auditId, report.opportunityRoute));
  const [open, setOpen] = useState(initial.current.open);
  const [name, setName] = useState(initial.current.name);
  const [email, setEmail] = useState(initial.current.email);
  const [company, setCompany] = useState(initial.current.company);
  const [pathway, setPathway] = useState<OpportunityRoute>(initial.current.pathway);
  const [timeline, setTimeline] = useState<Timeline>(initial.current.timeline);
  const [context, setContext] = useState(initial.current.context);
  const [consent, setConsent] = useState(initial.current.consent);
  const [status, setStatus] = useState<Status>("idle");
  const [errors, setErrors] = useState<LeadErrors>({});
  const honeypot = useRef("");
  const formHeadingRef = useRef<HTMLHeadingElement>(null);
  const successRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (status === "sent") return;
    try {
      sessionStorage.setItem(leadDraftKey(report.auditId), JSON.stringify({
        open, name, email, company, pathway, timeline, context, consent, savedAt: new Date().toISOString(),
      } satisfies StoredLeadDraft));
    } catch { /* the form remains usable without storage */ }
  }, [company, consent, context, email, name, open, pathway, report.auditId, status, timeline]);

  useEffect(() => {
    if (!open || (status !== "idle" && status !== "sent")) return;
    const frame = window.requestAnimationFrame(() => {
      (status === "sent" ? successRef.current : formHeadingRef.current)?.focus({ preventScroll: false });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, status]);

  const errorText = (code?: LeadErrorCode) => code === "invalidEmail" ? copy.lead.invalidEmail : code ? copy.lead.required : undefined;
  const clearError = (field: LeadErrorField) => setErrors((prior) => ({ ...prior, [field]: undefined }));

  const openForm = () => {
    setOpen(true);
    recordAuditEvent(report.auditId, report.accessToken, "service_cta_clicked", { route: report.opportunityRoute });
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (status === "sending") return;
    const next: LeadErrors = {};
    if (!name.trim()) next.name = "required";
    if (!email.trim()) next.email = "required";
    else if (!EMAIL.test(email.trim())) next.email = "invalidEmail";
    if (!company.trim()) next.company = "required";
    if (!consent) next.consent = "required";
    setErrors(next);
    if (Object.keys(next).length) {
      const first = (["name", "email", "company", "consent"] as LeadErrorField[]).find((field) => next[field]);
      window.requestAnimationFrame(() => document.getElementById(`audit-lead-${first}`)?.focus());
      return;
    }
    setStatus("sending");

    try {
      if (!report.accessToken) throw new Error("Missing audit access token");
      let utm: Record<string, string> = {};
      try { utm = JSON.parse(sessionStorage.getItem("lv-website-opportunity-audit:utm") || "{}"); } catch { /* optional attribution */ }
      await submitAuditLead({
        auditId: report.auditId,
        accessToken: report.accessToken,
        language,
        name: name.trim(),
        workEmail: email.trim(),
        company: company.trim(),
        pathway,
        timeline,
        projectContext: context.trim(),
        consent: true,
        hp: honeypot.current,
        utm,
      });
      setStatus("sent");
      try { sessionStorage.removeItem(leadDraftKey(report.auditId)); } catch { /* no-op */ }
    } catch {
      setStatus("error");
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl bg-lv-charcoal text-white shadow-[0_18px_50px_rgba(35,31,32,.16)]">
      <div className="relative p-6 sm:p-8 lg:p-10">
        <div className="audit-grid absolute inset-0 opacity-[0.08]" aria-hidden="true" />
        <div className="relative grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div className="max-w-3xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.06] px-3 py-1.5 text-[11px] font-semibold text-white/75">
              <MessageSquareText size={13} className="text-[#FF2D46]" /> {recommended.label}
            </span>
            <h2 className="mt-5 text-2xl font-bold tracking-[-0.025em] sm:text-3xl">{recommended.heading}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">{recommended.body}</p>
            <p className="mt-4 max-w-2xl text-sm leading-6 text-white/85">{copy.lead.supporting}</p>
          </div>
          {!open && (
            <Button size="lg" onClick={openForm} className="relative gap-2 bg-primary text-white hover:bg-primary/90 lg:min-w-56">
              {recommended.action} <ArrowRight size={16} />
            </Button>
          )}
        </div>
      </div>

      {open && (
        <div className="border-t border-white/10 bg-white p-5 text-foreground sm:p-7 lg:p-9">
          {status === "sent" ? (
            <div ref={successRef} role="status" aria-live="polite" tabIndex={-1} className="flex items-start gap-3 outline-none">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-white"><Check size={17} strokeWidth={3} /></span>
              <div>
                <h3 className="text-lg font-bold">{copy.lead.successHeading}</h3>
                <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">{copy.lead.successBody}</p>
              </div>
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
              <div className="max-w-2xl">
                <h3 ref={formHeadingRef} tabIndex={-1} className="text-xl font-bold tracking-[-0.015em] outline-none">{copy.lead.heading}</h3>
                <p className="mt-2 text-sm leading-6 text-muted-foreground">{copy.lead.body}</p>
              </div>
              <div aria-hidden="true" className="pointer-events-none absolute left-[-9999px] h-0 w-0 overflow-hidden">
                <label htmlFor="audit-company-site">Website</label>
                <input id="audit-company-site" tabIndex={-1} autoComplete="off" onChange={(event) => { honeypot.current = event.target.value; }} />
              </div>

              <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <Field id="audit-lead-name" label={copy.lead.name} error={errorText(errors.name)}>
                  <Input id="audit-lead-name" value={name} onChange={(event) => { setName(event.target.value); clearError("name"); }} autoComplete="name" aria-invalid={Boolean(errors.name)} aria-describedby={errors.name ? "audit-lead-name-error" : undefined} />
                </Field>
                <Field id="audit-lead-email" label={copy.lead.email} error={errorText(errors.email)}>
                  <Input id="audit-lead-email" type="email" inputMode="email" value={email} onChange={(event) => { setEmail(event.target.value); clearError("email"); }} autoComplete="email" aria-invalid={Boolean(errors.email)} aria-describedby={errors.email ? "audit-lead-email-error" : undefined} />
                </Field>
                <Field id="audit-lead-company" label={copy.lead.company} error={errorText(errors.company)}>
                  <Input id="audit-lead-company" value={company} onChange={(event) => { setCompany(event.target.value); clearError("company"); }} autoComplete="organization" aria-invalid={Boolean(errors.company)} aria-describedby={errors.company ? "audit-lead-company-error" : undefined} />
                </Field>
                <Field id="audit-lead-pathway" label={copy.lead.pathway}>
                  <select id="audit-lead-pathway" value={pathway} onChange={(event) => setPathway(event.target.value as OpportunityRoute)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {(Object.keys(copy.routes) as OpportunityRoute[]).map((route) => <option key={route} value={route}>{copy.routes[route].label}</option>)}
                  </select>
                </Field>
                <Field id="audit-lead-timeline" label={copy.lead.timeline}>
                  <select id="audit-lead-timeline" value={timeline} onChange={(event) => setTimeline(event.target.value as Timeline)} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {copy.lead.timelines.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
                  </select>
                </Field>
              </div>
              <div className="mt-4 max-w-3xl">
                <Label htmlFor="audit-lead-context" className="text-xs">{copy.lead.context} <span className="font-normal text-muted-foreground">({copy.common.optional})</span></Label>
                <Textarea id="audit-lead-context" value={context} onChange={(event) => setContext(event.target.value.slice(0, 1600))} placeholder={copy.lead.contextPlaceholder} className="mt-1.5 min-h-24" />
              </div>

              <label className="mt-5 flex max-w-3xl cursor-pointer items-start gap-2.5 text-xs leading-5 text-muted-foreground">
                <input id="audit-lead-consent" type="checkbox" checked={consent} onChange={(event) => { setConsent(event.target.checked); clearError("consent"); }} aria-invalid={Boolean(errors.consent)} aria-describedby={errors.consent ? "audit-lead-consent-error" : undefined} className="mt-0.5 h-4 w-4 rounded border-input accent-primary" />
                <span>{copy.lead.consent}</span>
              </label>
              {errors.consent && <p id="audit-lead-consent-error" className="mt-1 text-xs text-destructive">{errorText(errors.consent)}</p>}

              <p className="mt-4 max-w-3xl rounded-lg border border-border bg-muted/35 px-3 py-2.5 text-[11px] leading-5 text-muted-foreground">
                {copy.lead.disclosure}
              </p>

              {status === "error" && <p role="alert" className="mt-4 text-xs text-destructive">{copy.lead.error}</p>}
              <div className="mt-5 flex flex-wrap items-center gap-3">
                <Button type="submit" disabled={status === "sending"} className="gap-2">
                  {status === "sending" ? <><Loader2 size={15} className="animate-spin" /> {copy.lead.submitting}</> : <>{copy.lead.submit} <ArrowRight size={15} /></>}
                </Button>
              </div>
            </form>
          )}
        </div>
      )}
    </section>
  );
}

function Field({ id, label, error, children }: { id: string; label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">{label}</Label>
      {children}
      {error && <p id={`${id}-error`} className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
