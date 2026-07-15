import { useEffect, useRef, useState } from "react";
import {
  ArrowRight, Loader2, CheckCircle2, Check,
  MonitorPlay, Video, Sparkles, Users, PartyPopper,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import LVLogo from "@/components/LVLogo";

// ── Options ─────────────────────────────────────────────────────────────────────

const EVENT_TYPES = [
  "Festival or community event",
  "Corporate event",
  "Conference or convention",
  "Real estate / developer",
  "Nonprofit or fundraiser",
  "Sports or athletics",
  "Brand activation",
  "Concert or live entertainment",
  "Something else",
];

const SERVICES = [
  { title: "LED Screen Production",                     desc: "Large-format indoor & outdoor screens",        icon: MonitorPlay },
  { title: "Multi-Camera Live Coverage & Broadcasting", desc: "Five-camera live-to-screen coverage",          icon: Video },
  { title: "Branded Graphics & Sponsor Visibility",     desc: "On-screen branding & sponsor packages",        icon: Sparkles },
  { title: "Interactive Experiences & Photo Systems",   desc: "Attendee photo system + audience interaction", icon: Users },
  { title: "Not sure yet — help me scope it",           desc: "We'll recommend the right package",            icon: PartyPopper },
];

const TIMEFRAMES = ["Within 1 month", "1–3 months", "3–6 months", "6+ months", "Just exploring"];
const ATTENDEES  = ["Under 250", "250–1,000", "1,000–5,000", "5,000–20,000", "20,000+"];
const BUDGETS    = ["Under $5k", "$5k–$15k", "$15k–$50k", "$50k+", "Not sure yet"];

const HOME_URL = "https://www.lvbranding.com";
const REDIRECT_SECONDS = 15;

const emailValid = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

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

function FieldLabel({ children, required, optional }: { children: React.ReactNode; required?: boolean; optional?: boolean }) {
  return (
    <label className="text-sm font-medium text-slate-700 block mb-2">
      {children}
      {required && <span className="text-rose-500"> *</span>}
      {optional && <span className="text-slate-400 font-normal"> (optional)</span>}
    </label>
  );
}

// ── Main ────────────────────────────────────────────────────────────────────────

export default function AvEventProduction() {
  const [eventType, setEventType] = useState("");
  const [services, setServices]   = useState<string[]>([]);
  const [timeframe, setTimeframe] = useState("");
  const [eventDate, setEventDate] = useState("");
  const [venue, setVenue]         = useState("");
  const [attendees, setAttendees] = useState("");
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

  const toggleService = (s: string) =>
    setServices((prev) => (prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]));

  const canSubmit = !!eventType && name.trim() !== "" && emailValid(email);

  // Redirect to the LV Branding homepage 15s after a successful submission
  useEffect(() => {
    if (!done) return;
    setCountdown(REDIRECT_SECONDS);
    const tick = setInterval(() => setCountdown((c) => Math.max(0, c - 1)), 1000);
    const go   = setTimeout(() => { window.location.href = HOME_URL; }, REDIRECT_SECONDS * 1000);
    return () => { clearInterval(tick); clearTimeout(go); };
  }, [done]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const { data: res, error: fnErr } = await supabase.functions.invoke("submit-av-lead", {
        body: {
          event_type:      eventType,
          services,
          event_timeframe: timeframe || null,
          event_date:      eventDate || null,
          venue:           venue || null,
          attendees:       attendees || null,
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
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch {
      setError("Something went wrong. Please try again, or email admin@lvbranding.com.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4 py-8">
      <div className="w-full max-w-xl">
        <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="h-1.5 bg-rose-500" />
          <div className="p-6 sm:p-8">
            {done ? (
              <div className="text-center py-6">
                <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto mb-5">
                  <CheckCircle2 size={34} className="text-emerald-500" />
                </div>
                <h2 className="text-2xl font-bold text-slate-900">Request received 🎥</h2>
                <p className="text-slate-500 mt-3 leading-relaxed">
                  Thanks{name ? `, ${name.split(" ")[0]}` : ""} — we've sent a confirmation to{" "}
                  <span className="font-medium text-slate-700">{email}</span> and our team will reach out
                  within one business day.
                </p>
                <Button
                  asChild
                  className="mt-6 bg-rose-500 hover:bg-rose-600 text-white gap-2"
                >
                  <a href={HOME_URL}>
                    Visit www.lvbranding.com <ArrowRight size={16} />
                  </a>
                </Button>
                <p className="text-xs text-slate-400 mt-4">
                  Taking you to the LV Branding homepage in {countdown}s…
                </p>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-6">
                {/* Header */}
                <div className="text-center">
                  <LVLogo size={44} className="mx-auto mb-3" />
                  <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Book a Discovery Call</h1>
                  <p className="text-sm text-slate-500 mt-0.5">AV &amp; Live Event Production</p>
                </div>

                {/* Event type */}
                <div>
                  <FieldLabel required>What kind of event?</FieldLabel>
                  <div className="flex flex-wrap gap-2">
                    {EVENT_TYPES.map((t) => (
                      <Pill key={t} label={t} active={eventType === t} onClick={() => setEventType(t)} />
                    ))}
                  </div>
                </div>

                {/* Services */}
                <div>
                  <FieldLabel optional>What do you need on-site?</FieldLabel>
                  <div className="space-y-2">
                    {SERVICES.map((s) => {
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

                {/* Timeframe + date */}
                <div>
                  <FieldLabel optional>When is the event?</FieldLabel>
                  <div className="flex flex-wrap gap-2 mb-3">
                    {TIMEFRAMES.map((t) => (
                      <Pill key={t} label={t} active={timeframe === t} onClick={() => setTimeframe(timeframe === t ? "" : t)} />
                    ))}
                  </div>
                  <div className="flex items-center gap-3">
                    <Input
                      type="date"
                      value={eventDate}
                      onChange={(e) => setEventDate(e.target.value)}
                      className="max-w-[200px]"
                    />
                    <span className="text-xs text-slate-400">Exact date, if you have one</span>
                  </div>
                </div>

                {/* Venue */}
                <div>
                  <FieldLabel optional>Where will the event be?</FieldLabel>
                  <Input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Hotel, convention center, venue name, or city" />
                </div>

                {/* Attendees */}
                <div>
                  <FieldLabel optional>Expected attendees</FieldLabel>
                  <div className="flex flex-wrap gap-2">
                    {ATTENDEES.map((a) => (
                      <Pill key={a} label={a} active={attendees === a} onClick={() => setAttendees(attendees === a ? "" : a)} />
                    ))}
                  </div>
                </div>

                {/* Budget */}
                <div>
                  <FieldLabel optional>Production budget</FieldLabel>
                  <div className="flex flex-wrap gap-2">
                    {BUDGETS.map((b) => (
                      <Pill key={b} label={b} active={budget === b} onClick={() => setBudget(budget === b ? "" : b)} />
                    ))}
                  </div>
                </div>

                <div className="h-px bg-slate-100" />

                {/* Contact */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <FieldLabel required>Name</FieldLabel>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" autoComplete="name" />
                  </div>
                  <div>
                    <FieldLabel required>Email</FieldLabel>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" autoComplete="email" />
                  </div>
                  <div>
                    <FieldLabel optional>Phone</FieldLabel>
                    <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" autoComplete="tel" />
                  </div>
                  <div>
                    <FieldLabel optional>Company</FieldLabel>
                    <Input value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" />
                  </div>
                </div>

                {/* Message */}
                <div>
                  <FieldLabel optional>Anything else we should know?</FieldLabel>
                  <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Goals, sponsors, must-have moments…" />
                </div>

                {/* Honeypot */}
                <input type="text" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" onChange={(e) => { hp.current = e.target.value; }} />

                {error && <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">{error}</p>}

                <Button type="submit" disabled={!canSubmit || submitting} className="w-full h-11 bg-rose-500 hover:bg-rose-600 text-white gap-2 text-base">
                  {submitting ? <><Loader2 size={17} className="animate-spin" /> Sending…</> : <>Book a Discovery Call <ArrowRight size={17} /></>}
                </Button>
                <p className="text-[11px] text-slate-400 text-center">
                  We'll only use your details to follow up about your event.
                </p>
              </form>
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
