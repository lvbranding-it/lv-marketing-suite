import { useEffect, useRef, useState } from "react";
import {
  ArrowRight, ArrowLeft, Loader2, CheckCircle2, Check, type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import LVLogo from "@/components/LVLogo";

// ── Config types ────────────────────────────────────────────────────────────────

export interface WizardService {
  title: string;
  desc:  string;
  icon:  LucideIcon;
}

export interface ServiceLeadWizardConfig {
  source:           string;    // form key passed to submit-av-lead (drives labels/tags server-side)
  lang?:            "en" | "es"; // form language (default "en")
  subtitle:         string;    // service line under the title
  typeQuestion:     string;    // step-1 headline
  types:            string[];
  servicesQuestion: string;    // step-2 headline
  services:         WizardService[];
  industries?:      string[];  // optional industry pills on step 2
  timeframeLabel:   string;
  timeframes:       string[];
  dateHint:         string;    // e.g. "Exact date, if you have one" / "Target launch, if you have one"
  venueLabel:       string;
  venuePlaceholder: string;
  sizeLabel?:       string;    // optional "attendees / company size" pills
  sizeOptions?:     string[];
  budgets:          string[];
}

const REDIRECT_SECONDS = 15;
const TOTAL_STEPS = 4;

const emailValid = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

// ── UI strings (fixed chrome — config supplies the per-service content) ──────────

const UI = {
  en: {
    homeUrl: "https://www.lvbranding.com",
    homeLabel: "www.lvbranding.com",
    title: "Book a Discovery Call",
    step: (n: number) => `Step ${n} of ${TOTAL_STEPS}`,
    optional: "(optional)",
    selectAll: "Select all that apply — we'll refine it on the call.",
    industryQ: "What industry are you in?",
    budget: "Budget",
    name: "Name", email: "Email", phone: "Phone", company: "Company",
    namePh: "Jane Doe", phonePh: "(555) 123-4567",
    messageLabel: "Anything else we should know?",
    messagePh: "Goals, must-haves, links…",
    disclaimer: "We'll only use your details to follow up about your project.",
    back: "Back", continue: "Continue", sending: "Sending…",
    errorMsg: "Something went wrong. Please try again, or email admin@lvbranding.com.",
    successTitle: "Request received 🎉",
    thanks: (first: string) => `Thanks${first ? `, ${first}` : ""} — we've sent a confirmation to`,
    andReach: "and our team will reach out within one business day.",
    visit: "Visit www.lvbranding.com",
    redirect: (n: number) => `Taking you to the LV Branding homepage in ${n}s…`,
  },
  es: {
    homeUrl: "https://es.lvbranding.com",
    homeLabel: "es.lvbranding.com",
    title: "Agenda una Llamada",
    step: (n: number) => `Paso ${n} de ${TOTAL_STEPS}`,
    optional: "(opcional)",
    selectAll: "Selecciona todas las que apliquen — lo afinamos en la llamada.",
    industryQ: "¿En qué industria estás?",
    budget: "Presupuesto",
    name: "Nombre", email: "Correo", phone: "Teléfono", company: "Empresa",
    namePh: "Juan Pérez", phonePh: "(555) 123-4567",
    messageLabel: "¿Algo más que debamos saber?",
    messagePh: "Objetivos, imprescindibles, enlaces…",
    disclaimer: "Solo usaremos tus datos para dar seguimiento a tu proyecto.",
    back: "Atrás", continue: "Continuar", sending: "Enviando…",
    errorMsg: "Algo salió mal. Inténtalo de nuevo o escribe a admin@lvbranding.com.",
    successTitle: "¡Solicitud recibida! 🎉",
    thanks: (first: string) => `¡Gracias${first ? `, ${first}` : ""}! Enviamos una confirmación a`,
    andReach: "y nuestro equipo te contactará en un día hábil.",
    visit: "Visita es.lvbranding.com",
    redirect: (n: number) => `Te llevaremos al inicio de LV Branding en ${n}s…`,
  },
} as const;

// ── Small building blocks ───────────────────────────────────────────────────────

function Pill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`px-3.5 py-2 rounded-full border text-sm font-medium transition-all ${
        active
          ? "border-rose-500 bg-rose-500 text-white"
          : "border-slate-200 bg-white text-slate-600 hover:border-rose-300"
      }`}
    >
      {label}
    </button>
  );
}

function FieldLabel({ children, required, optional }: { children: React.ReactNode; required?: boolean; optional?: string }) {
  return (
    <label className="text-sm font-medium text-slate-700 block mb-2">
      {children}
      {required && <span className="text-rose-500"> *</span>}
      {optional && <span className="text-slate-400 font-normal"> {optional}</span>}
    </label>
  );
}

// ── Wizard ──────────────────────────────────────────────────────────────────────

export default function ServiceLeadWizard({ config }: { config: ServiceLeadWizardConfig }) {
  const [step, setStep]           = useState(0);
  const [projType, setProjType]   = useState("");
  const [services, setServices]   = useState<string[]>([]);
  const [industry, setIndustry]   = useState("");
  const [timeframe, setTimeframe] = useState("");
  const [date, setDate]           = useState("");
  const [venue, setVenue]         = useState("");
  const [size, setSize]           = useState("");
  const [budget, setBudget]       = useState("");
  const [name, setName]           = useState("");
  const [email, setEmail]         = useState("");
  const [phone, setPhone]         = useState("");
  const [company, setCompany]     = useState("");
  const [message, setMessage]     = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]           = useState(false);
  const [error, setError]         = useState("");
  const [countdown, setCountdown] = useState(REDIRECT_SECONDS);
  const hp = useRef("");   // honeypot
  const cardRef = useRef<HTMLDivElement>(null);

  const lang = config.lang ?? "en";
  const ui = UI[lang];
  const HOME_URL = ui.homeUrl;

  const toggleService = (s: string) =>
    setServices((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  // Record a page view once per browser session (best-effort, non-blocking)
  useEffect(() => {
    const key = `lead-form-viewed:${config.source}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch { /* private mode — count anyway */ }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("lead_form_views").insert({ source: config.source }).then(() => {});
  }, [config.source]);

  const canProceed =
    step === 0 ? !!projType :
    step === 3 ? name.trim() !== "" && emailValid(email) :
    true;

  const scrollToTop = () => cardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const next = () => { if (canProceed && step < TOTAL_STEPS - 1) { setStep((s) => s + 1); scrollToTop(); } };
  const back = () => { if (step > 0) { setStep((s) => s - 1); scrollToTop(); } };

  // Redirect to the LV Branding homepage after a successful submission
  useEffect(() => {
    if (!done) return;
    setCountdown(REDIRECT_SECONDS);
    const tick = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    const go   = setTimeout(() => { window.location.href = HOME_URL; }, REDIRECT_SECONDS * 1000);
    return () => { clearInterval(tick); clearTimeout(go); };
  }, [done]);

  const submit = async () => {
    if (!canProceed || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const { data: res, error: fnErr } = await supabase.functions.invoke("submit-av-lead", {
        body: {
          source:          config.source,
          lang,
          event_type:      projType,
          services,
          industry:        industry || null,
          event_timeframe: timeframe || null,
          event_date:      date || null,
          venue:           venue || null,
          attendees:       size || null,
          budget:          budget || null,
          contact_name:    name,
          contact_email:   email,
          contact_phone:   phone || null,
          company:         company || null,
          message:         message || null,
          hp:              hp.current,
        },
      });
      if (fnErr || (res && (res as { error?: string }).error)) {
        throw new Error((res as { error?: string })?.error || fnErr?.message || "Submission failed");
      }
      setDone(true);
      scrollToTop();
    } catch {
      setError(ui.errorMsg);
    } finally {
      setSubmitting(false);
    }
  };

  const progressPct = done ? 100 : ((step + 1) / TOTAL_STEPS) * 100;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 py-8">
      <div className="w-full max-w-xl" ref={cardRef}>
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          {/* Progress bar */}
          <div className="h-1.5 bg-slate-100">
            <div className="h-full bg-rose-500 transition-all duration-500" style={{ width: `${progressPct}%` }} />
          </div>

          <div className="p-6 sm:p-8">
            {done ? (
              <div className="text-center py-6">
                <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
                  <CheckCircle2 size={34} className="text-emerald-500" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">{ui.successTitle}</h2>
                <p className="text-slate-500 mt-3 leading-relaxed">
                  {ui.thanks(name ? name.split(" ")[0] : "")}{" "}
                  <span className="font-medium text-slate-700">{email}</span> {ui.andReach}
                </p>
                <Button asChild className="mt-6 bg-rose-500 hover:bg-rose-600 text-white gap-2">
                  <a href={HOME_URL}>
                    {ui.visit} <ArrowRight size={16} />
                  </a>
                </Button>
                <p className="text-xs text-slate-400 mt-4">
                  {ui.redirect(countdown)}
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {/* Header */}
                <div className="text-center">
                  <LVLogo size={44} className="mx-auto mb-3" />
                  <h1 className="text-xl font-extrabold tracking-tight text-slate-900">{ui.title}</h1>
                  <p className="text-sm text-slate-500 mt-0.5">{config.subtitle}</p>
                  <p className="text-[11px] font-semibold text-rose-500 uppercase tracking-wide mt-3">
                    {ui.step(step + 1)}
                  </p>
                </div>

                {/* Honeypot */}
                <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" onChange={(e) => { hp.current = e.target.value; }} />

                {/* ── Step 1: Project / event type ── */}
                {step === 0 && (
                  <div>
                    <FieldLabel required>{config.typeQuestion}</FieldLabel>
                    <div className="flex flex-wrap gap-2">
                      {config.types.map((t) => (
                        <Pill key={t} label={t} active={projType === t} onClick={() => setProjType(t)} />
                      ))}
                    </div>
                  </div>
                )}

                {/* ── Step 2: Services (+ industry) ── */}
                {step === 1 && (
                  <div className="space-y-5">
                    <div>
                      <FieldLabel optional={ui.optional}>{config.servicesQuestion}</FieldLabel>
                      <p className="text-xs text-slate-500 -mt-1 mb-3">{ui.selectAll}</p>
                      <div className="space-y-2">
                        {config.services.map((s) => {
                          const active = services.includes(s.title);
                          const Icon = s.icon;
                          return (
                            <button
                              key={s.title}
                              type="button"
                              onClick={() => toggleService(s.title)}
                              className={`w-full flex items-center gap-3 text-left px-3.5 py-2.5 rounded-xl border transition-all ${
                                active ? "border-rose-500 bg-rose-50 ring-1 ring-rose-500" : "border-slate-200 hover:border-rose-300 hover:bg-rose-50/40"
                              }`}
                            >
                              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${active ? "bg-rose-500 text-white" : "bg-slate-100 text-slate-500"}`}>
                                <Icon size={15} />
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className={`text-sm font-semibold ${active ? "text-rose-700" : "text-slate-800"}`}>{s.title}</p>
                                <p className="text-xs text-slate-500">{s.desc}</p>
                              </div>
                              <div className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 ${active ? "bg-rose-500 border-rose-500" : "border-slate-300"}`}>
                                {active && <Check size={13} className="text-white" />}
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {config.industries && (
                      <div>
                        <FieldLabel optional={ui.optional}>{ui.industryQ}</FieldLabel>
                        <div className="flex flex-wrap gap-2">
                          {config.industries.map((i) => (
                            <Pill key={i} label={i} active={industry === i} onClick={() => setIndustry(industry === i ? "" : i)} />
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* ── Step 3: Details ── */}
                {step === 2 && (
                  <div className="space-y-5">
                    <div>
                      <FieldLabel optional={ui.optional}>{config.timeframeLabel}</FieldLabel>
                      <div className="flex flex-wrap gap-2 mb-3">
                        {config.timeframes.map((t) => (
                          <Pill key={t} label={t} active={timeframe === t} onClick={() => setTimeframe(timeframe === t ? "" : t)} />
                        ))}
                      </div>
                      <div className="flex items-center gap-3">
                        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="max-w-[200px]" />
                        <span className="text-xs text-slate-400">{config.dateHint}</span>
                      </div>
                    </div>

                    <div>
                      <FieldLabel optional={ui.optional}>{config.venueLabel}</FieldLabel>
                      <Input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder={config.venuePlaceholder} />
                    </div>

                    {config.sizeLabel && config.sizeOptions && (
                      <div>
                        <FieldLabel optional={ui.optional}>{config.sizeLabel}</FieldLabel>
                        <div className="flex flex-wrap gap-2">
                          {config.sizeOptions.map((a) => (
                            <Pill key={a} label={a} active={size === a} onClick={() => setSize(size === a ? "" : a)} />
                          ))}
                        </div>
                      </div>
                    )}

                    <div>
                      <FieldLabel optional={ui.optional}>{ui.budget}</FieldLabel>
                      <div className="flex flex-wrap gap-2">
                        {config.budgets.map((b) => (
                          <Pill key={b} label={b} active={budget === b} onClick={() => setBudget(budget === b ? "" : b)} />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* ── Step 4: Contact ── */}
                {step === 3 && (
                  <div className="space-y-4">
                    <div className="grid sm:grid-cols-2 gap-4">
                      <div>
                        <FieldLabel required>{ui.name}</FieldLabel>
                        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder={ui.namePh} autoComplete="name" />
                      </div>
                      <div>
                        <FieldLabel required>{ui.email}</FieldLabel>
                        <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" autoComplete="email" />
                      </div>
                      <div>
                        <FieldLabel optional={ui.optional}>{ui.phone}</FieldLabel>
                        <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder={ui.phonePh} autoComplete="tel" />
                      </div>
                      <div>
                        <FieldLabel optional={ui.optional}>{ui.company}</FieldLabel>
                        <Input value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" />
                      </div>
                    </div>
                    <div>
                      <FieldLabel optional={ui.optional}>{ui.messageLabel}</FieldLabel>
                      <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder={ui.messagePh} />
                    </div>
                    {error && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}
                    <p className="text-[11px] text-slate-400 text-center">
                      {ui.disclaimer}
                    </p>
                  </div>
                )}

                {/* ── Nav buttons ── */}
                <div className="flex items-center justify-between gap-3 pt-2">
                  <Button variant="ghost" onClick={back} disabled={step === 0} className="text-slate-500 gap-1 disabled:opacity-0">
                    <ArrowLeft size={16} /> {ui.back}
                  </Button>
                  {step < TOTAL_STEPS - 1 ? (
                    <Button onClick={next} disabled={!canProceed} className="bg-rose-500 hover:bg-rose-600 text-white gap-1.5 px-6">
                      {ui.continue} <ArrowRight size={16} />
                    </Button>
                  ) : (
                    <Button onClick={submit} disabled={!canProceed || submitting} className="bg-rose-500 hover:bg-rose-600 text-white gap-1.5 px-6">
                      {submitting ? <><Loader2 size={16} className="animate-spin" /> {ui.sending}</> : <>{ui.title} <ArrowRight size={16} /></>}
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        <p className="text-xs text-slate-400 text-center mt-4">
          Made with <span className="text-rose-500">&hearts;</span> by{" "}
          <a href={HOME_URL} target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-600 hover:text-rose-500 transition-colors">
            LV Branding
          </a>
        </p>
      </div>
    </div>
  );
}
