import { useRef, useState } from "react";
import { ArrowRight, Loader2, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import LVLogo from "@/components/LVLogo";

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

const emailValid = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e);

export default function AvEventProduction() {
  const [eventType, setEventType] = useState("");
  const [name, setName]     = useState("");
  const [email, setEmail]   = useState("");
  const [phone, setPhone]   = useState("");
  const [company, setCompany] = useState("");
  const [venue, setVenue]   = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone]     = useState(false);
  const [error, setError]   = useState("");
  const hp = useRef("");   // honeypot

  const canSubmit = !!eventType && name.trim() !== "" && emailValid(email);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError("");
    try {
      const { data: res, error: fnErr } = await supabase.functions.invoke("submit-av-lead", {
        body: {
          event_type:    eventType,
          services:      [],
          contact_name:  name,
          contact_email: email,
          contact_phone: phone || null,
          company:       company || null,
          venue:         venue || null,
          message:       message || null,
          hp:            hp.current,
        },
      });
      if (fnErr || (res && (res as { error?: string }).error)) {
        throw new Error((res as { error?: string })?.error || fnErr?.message || "Submission failed");
      }
      setDone(true);
    } catch {
      setError("Something went wrong. Please try again, or email admin@lvbranding.com.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-lg">
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
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-5">
                {/* Header */}
                <div className="text-center">
                  <LVLogo size={44} className="mx-auto mb-3" />
                  <h1 className="text-xl font-extrabold tracking-tight text-slate-900">Book a Discovery Call</h1>
                  <p className="text-sm text-slate-500 mt-0.5">AV &amp; Live Event Production</p>
                </div>

                {/* Event type */}
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-2">
                    What kind of event? <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {EVENT_TYPES.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setEventType(t)}
                        className={`px-3.5 py-2 rounded-full border text-sm font-medium transition-all ${
                          eventType === t
                            ? "border-rose-500 bg-rose-500 text-white"
                            : "border-slate-200 bg-white text-slate-600 hover:border-rose-300"
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Name + email */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1.5">Name <span className="text-rose-500">*</span></label>
                    <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Jane Doe" autoComplete="name" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1.5">Email <span className="text-rose-500">*</span></label>
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="jane@company.com" autoComplete="email" />
                  </div>
                </div>

                {/* Phone + company (optional, one row) */}
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1.5">Phone <span className="text-slate-400 font-normal">(optional)</span></label>
                    <Input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="(555) 123-4567" autoComplete="tel" />
                  </div>
                  <div>
                    <label className="text-sm font-medium text-slate-700 block mb-1.5">Company <span className="text-slate-400 font-normal">(optional)</span></label>
                    <Input value={company} onChange={(e) => setCompany(e.target.value)} autoComplete="organization" />
                  </div>
                </div>

                {/* Venue / location (optional) */}
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">Where will the event be? <span className="text-slate-400 font-normal">(optional)</span></label>
                  <Input value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Hotel, convention center, venue name, or city" />
                </div>

                {/* Message (optional) */}
                <div>
                  <label className="text-sm font-medium text-slate-700 block mb-1.5">Tell us about your event <span className="text-slate-400 font-normal">(optional)</span></label>
                  <Textarea rows={3} value={message} onChange={(e) => setMessage(e.target.value)} placeholder="Date, venue, attendees, what you need on-site…" />
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
          <a href="https://www.lvbranding.com" target="_blank" rel="noopener noreferrer" className="font-semibold text-slate-600 hover:text-rose-500 transition-colors">
            LV Branding
          </a>
        </p>
      </div>
    </div>
  );
}
