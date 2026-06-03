import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import confetti from "canvas-confetti";
import { ChevronRight, ChevronLeft, Loader2, CheckCircle2, ArrowRight, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { intakeTranslations, OPTION_VALUES, type Lang } from "@/data/intakeTranslations";

// ── Type shapes (fixed, language-independent) ─────────────────────────────────
type Step1 = { contact_name: string; contact_email: string; contact_role?: string; company_name: string; website?: string };
type Step2 = { industry: string; company_size: string; business_model: string; one_liner: string };
type Step3 = { goals: string; ideal_customer: string; top_problem?: string; timeline?: string };
type Step4 = { competitors?: string; differentiators: string; tone: string; extra_notes?: string };

// ── Field wrapper ─────────────────────────────────────────────────────────────
function Field({ label, hint, error, required, children }: {
  label: string; hint?: string; error?: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm font-medium text-gray-800">
        {label}
        {required && <span className="text-rose-500 ml-0.5">*</span>}
      </Label>
      {hint && <p className="text-xs text-gray-500 -mt-0.5">{hint}</p>}
      {children}
      {error && <p className="text-xs text-rose-500 flex items-center gap-1">{error}</p>}
    </div>
  );
}

// ── Confetti burst ─────────────────────────────────────────────────────────────
function fireConfetti() {
  const count = 200;
  const defaults = { origin: { y: 0.7 } };
  function fire(particleRatio: number, opts: confetti.Options) {
    confetti({ ...defaults, ...opts, particleCount: Math.floor(count * particleRatio) });
  }
  fire(0.25, { spread: 26, startVelocity: 55, colors: ["#E63946", "#1A1A2E"] });
  fire(0.2,  { spread: 60, colors: ["#FFD700", "#FFA500"] });
  fire(0.35, { spread: 100, decay: 0.91, scalar: 0.8, colors: ["#E63946", "#ffffff", "#1A1A2E"] });
  fire(0.1,  { spread: 120, startVelocity: 25, decay: 0.92, scalar: 1.2 });
  fire(0.1,  { spread: 120, startVelocity: 45, colors: ["#FFD700"] });
}

// ── Main Component ────────────────────────────────────────────────────────────
export default function IntakeForm() {
  const { orgId } = useParams<{ orgId: string }>();
  const [searchParams]            = useSearchParams();

  // ── Personalized (CRM-sourced) link params ────────────────────────────────
  const contactId      = searchParams.get("cid");
  const prefillName    = searchParams.get("n") ?? "";
  const prefillEmail   = searchParams.get("e") ?? "";
  const prefillRole    = searchParams.get("r") ?? "";
  const prefillCompany = searchParams.get("c") ?? "";
  const prefillWebsite = searchParams.get("w") ?? "";
  const prefillIndustry = searchParams.get("i") ?? "";
  const prefillSize    = searchParams.get("s") ?? "";
  const isPersonalized = !!contactId;
  const prefillFirstName = prefillName.split(" ")[0] || "there";

  const [step, setStep]           = useState(0);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [animating, setAnimating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]         = useState<string | null>(null);
  const [formData, setFormData]   = useState<Partial<Step1 & Step2 & Step3 & Step4>>({});
  const confettiFired              = useRef(false);

  // ── Language ──────────────────────────────────────────────────────────────
  const [lang, setLang] = useState<Lang>("en");
  const t = intakeTranslations[lang];

  // ── Translated zod schemas (recreated when lang changes) ──────────────────
  const step1Schema = z.object({
    contact_name:  z.string().min(1, t.fields.contact_name.error),
    contact_email: z.string().email(t.fields.contact_email.error),
    contact_role:  z.string().optional(),
    company_name:  z.string().min(1, t.fields.company_name.error),
    website:       z.string().optional(),
  });
  const step2Schema = z.object({
    industry:       z.string().min(1, t.fields.industry.error),
    company_size:   z.string().min(1, t.fields.company_size.error),
    business_model: z.string().min(1, t.fields.business_model.error),
    one_liner:      z.string().min(1, t.fields.one_liner.error),
  });
  const step3Schema = z.object({
    goals:          z.string().min(1, t.fields.goals.error),
    ideal_customer: z.string().min(1, t.fields.ideal_customer.error),
    top_problem:    z.string().optional(),
    timeline:       z.string().optional(),
  });
  const step4Schema = z.object({
    competitors:    z.string().optional(),
    differentiators: z.string().min(1, t.fields.differentiators.error),
    tone:           z.string().min(1, t.fields.tone.error),
    extra_notes:    z.string().optional(),
  });

  const form1 = useForm<Step1>({ resolver: zodResolver(step1Schema) });
  const form2 = useForm<Step2>({ resolver: zodResolver(step2Schema) });
  const form3 = useForm<Step3>({ resolver: zodResolver(step3Schema) });
  const form4 = useForm<Step4>({ resolver: zodResolver(step4Schema) });
  const forms = [null, form1, form2, form3, form4];

  // Fire confetti when step reaches 5
  useEffect(() => {
    if (step === 5 && !confettiFired.current) {
      confettiFired.current = true;
      setTimeout(() => fireConfetti(), 200);
      setTimeout(() => fireConfetti(), 900);
    }
  }, [step]);

  // Pre-fill form fields from CRM params (runs once on mount)
  useEffect(() => {
    if (!isPersonalized) return;
    form1.reset({
      contact_name:  prefillName    || undefined,
      contact_email: prefillEmail   || undefined,
      contact_role:  prefillRole    || undefined,
      company_name:  prefillCompany || undefined,
      website:       prefillWebsite || undefined,
    });
    if (prefillIndustry) form2.setValue("industry",     prefillIndustry);
    if (prefillSize)     form2.setValue("company_size", prefillSize);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goTo = (next: number, dir: "forward" | "backward") => {
    if (animating) return;
    setDirection(dir);
    setAnimating(true);
    setTimeout(() => { setStep(next); setAnimating(false); }, 220);
  };

  const handleNext = async () => {
    if (step === 0) { goTo(1, "forward"); return; }
    const form = forms[step];
    if (!form) return;
    const valid = await form.trigger();
    if (!valid) return;
    const values = form.getValues();
    const merged = { ...formData, ...values };
    setFormData(merged);
    if (step < 4) {
      goTo(step + 1, "forward");
    } else {
      await submit(merged as Step1 & Step2 & Step3 & Step4);
    }
  };

  const handleBack = () => { if (step <= 1) return; goTo(step - 1, "backward"); };

  const submit = async (data: Step1 & Step2 & Step3 & Step4) => {
    if (!orgId) { setError(t.errors.orgMissing); return; }
    setSubmitting(true);
    setError(null);
    try {
      // 15-second timeout — protects users on slow connections (e.g. high-latency regions)
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(
          lang === "es"
            ? "La conexión tardó demasiado. Por favor verifica tu internet e intenta de nuevo."
            : "Connection timed out. Please check your internet and try again."
        )), 15_000)
      );

      const { data: newSub, error: dbErr } = await Promise.race([
        supabase
          .from("intake_submissions")
          .insert({
            org_id:        orgId,
            contact_name:  data.contact_name,
            contact_email: data.contact_email,
            contact_role:  data.contact_role || null,
            company_name:  data.company_name,
            form_data:     { ...data, language: lang } as unknown as import("@/integrations/supabase/types").Json,
            ...(contactId ? { contact_id: contactId } : {}),
          })
          .select("id")
          .single(),
        timeoutPromise,
      ]);
      if (dbErr) throw dbErr;

      // Fire-and-forget team notification email (non-blocking)
      supabase.functions.invoke("intake-notify", {
        body: {
          submission_id:  newSub.id,
          contact_name:   data.contact_name,
          contact_email:  data.contact_email,
          contact_role:   data.contact_role || null,
          company_name:   data.company_name,
          form_data:      { ...data },
          language:       lang,
        },
      }).catch(() => { /* notification is best-effort */ });

      goTo(5, "forward");
    } catch (err) {
      // Supabase returns PostgrestError (plain object with .message), not an Error instance
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : t.errors.genericError;
      setError(msg);
    } finally {
      setSubmitting(false);
    }
  };

  const slideOut = direction === "forward" ? "-translate-x-8 opacity-0" : "translate-x-8 opacity-0";
  const base     = animating ? slideOut : "translate-x-0 opacity-100";
  const progress = step === 0 ? 0 : step >= 5 ? 100 : (step / 4) * 100;
  const firstName = (formData as Step1).contact_name?.split(" ")[0] ?? "";
  const email     = (formData as Step1).contact_email ?? "";

  // ── Language toggle button ─────────────────────────────────────────────────
  const LangToggle = (
    <button
      onClick={() => setLang(l => l === "en" ? "es" : "en")}
      className="text-xs font-medium px-2.5 py-1 rounded-full border border-gray-200 hover:bg-gray-100 transition-colors text-gray-500 whitespace-nowrap"
    >
      {t.langToggle}
    </button>
  );

  return (
    <div className="min-h-screen bg-[#F8F7F5] flex flex-col">

      {/* Top bar — logo centered, lang toggle right */}
      <header className="relative flex items-center justify-center px-6 py-5 bg-white border-b border-gray-100">
        {/* Centered logo */}
        <img
          src="/lv-branding-logo.svg"
          alt="LV Branding"
          className="h-16 w-16 object-contain"
        />
        {/* Language toggle — absolute right */}
        <div className="absolute right-6 top-1/2 -translate-y-1/2">
          {LangToggle}
        </div>
      </header>

      {/* Step dots */}
      {step > 0 && step < 5 && (
        <div className="flex justify-center gap-3 py-5">
          {t.steps.map((s, i) => (
            <div key={i} className="flex items-center gap-3">
              <div className={cn(
                "w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 border-2",
                i + 1 < step
                  ? "bg-rose-500 border-rose-500 text-white"
                  : i + 1 === step
                  ? "bg-rose-500 border-rose-500 text-white shadow-md shadow-rose-200"
                  : "bg-white border-gray-200 text-gray-400"
              )}>
                {i + 1 < step ? "✓" : i + 1}
              </div>
              {i < t.steps.length - 1 && (
                <div className={cn("w-10 h-0.5 rounded-full transition-colors duration-500", i + 1 < step ? "bg-rose-400" : "bg-gray-200")} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Card */}
      <div className="flex-1 flex items-start justify-center px-4 py-6">
        <div className={cn("w-full max-w-lg bg-white rounded-2xl shadow-lg border border-gray-100/80 overflow-hidden transition-all duration-220", base)}>

          {/* ── Welcome ── */}
          {step === 0 && !isPersonalized && (
            <div className="p-10 text-center">
              <div className="text-6xl mb-5">🎉</div>
              <h1 className="text-3xl font-bold text-gray-900 mb-3 leading-tight">{t.welcome.title}</h1>
              <p className="text-gray-500 text-base leading-relaxed mb-2">{t.welcome.body1}</p>
              <p className="text-gray-400 text-sm mb-8">
                {t.welcome.body2a} <strong className="text-gray-600">{t.welcome.body2bold}</strong> {t.welcome.body2b}
              </p>
              <Button size="lg" onClick={() => goTo(1, "forward")} className="bg-rose-500 hover:bg-rose-600 text-white px-8 py-3 text-base rounded-xl shadow-md">
                {t.welcome.button}
                <ArrowRight size={18} className="ml-2" />
              </Button>
              <p className="text-xs text-gray-300 mt-4">{t.welcome.finePrint}</p>
            </div>
          )}

          {/* ── Personalized Welcome (CRM link) ── */}
          {step === 0 && isPersonalized && (
            <div className="p-10 text-center">
              <div className="text-6xl mb-5">✨</div>
              <h1 className="text-3xl font-bold text-gray-900 mb-3 leading-tight">
                {lang === "es"
                  ? `¡Hola, ${prefillFirstName}! 👋`
                  : `Hey, ${prefillFirstName}! 👋`}
              </h1>
              <p className="text-gray-600 text-base leading-relaxed mb-2 font-medium">
                {lang === "es"
                  ? "¡Estamos muy emocionados de continuar este camino juntos!"
                  : "We're so excited to continue this journey together!"}
              </p>
              <p className="text-gray-400 text-sm mb-4 leading-relaxed">
                {lang === "es"
                  ? "Ya pre-llenamos lo que sabemos sobre ti."
                  : "We've already pre-filled what we know about you."}
              </p>
              <div className="inline-flex items-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs font-medium px-3 py-1.5 rounded-full mb-8">
                <Sparkles size={11} />
                {lang === "es"
                  ? "Solo revisa, actualiza lo que haya cambiado y completa el resto."
                  : "Just review, update anything that's changed, and fill in the rest."}
              </div>
              <div />
              <Button size="lg" onClick={() => goTo(1, "forward")} className="bg-rose-500 hover:bg-rose-600 text-white px-8 py-3 text-base rounded-xl shadow-md">
                {lang === "es" ? "Revisar y completar" : "Review & Complete"}
                <ArrowRight size={18} className="ml-2" />
              </Button>
              <p className="text-xs text-gray-300 mt-4">{t.welcome.finePrint}</p>
            </div>
          )}

          {/* ── Step Header ── */}
          {step >= 1 && step <= 4 && (
            <div className="bg-gradient-to-r from-rose-50 to-amber-50 border-b border-rose-100/60 px-8 pt-6 pb-5">
              <div className="flex items-center gap-3">
                <span className="text-3xl leading-none">{t.steps[step - 1].emoji}</span>
                <div>
                  <p className="text-[11px] font-semibold text-rose-500 uppercase tracking-widest mb-0.5">{t.steps[step - 1].hint}</p>
                  <h2 className="text-[22px] font-bold text-gray-900 leading-tight">{t.steps[step - 1].label}</h2>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 1 – About You ── */}
          {step === 1 && (
            <div className="p-8 space-y-5">
              {isPersonalized && (
                <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2 text-xs text-emerald-700 -mt-1">
                  <Sparkles size={12} className="text-emerald-500 shrink-0" />
                  {lang === "es"
                    ? "Pre-llenado desde tu perfil — actualiza cualquier campo que haya cambiado."
                    : "Pre-filled from your profile — update any field that's changed."}
                </div>
              )}
              <Field label={t.fields.contact_name.label} required error={form1.formState.errors.contact_name?.message}>
                <Input placeholder={t.fields.contact_name.placeholder} className="h-11" {...form1.register("contact_name")} />
              </Field>
              <Field label={t.fields.contact_email.label} required error={form1.formState.errors.contact_email?.message}>
                <Input type="email" placeholder={t.fields.contact_email.placeholder} className="h-11" {...form1.register("contact_email")} />
              </Field>
              <Field label={t.fields.contact_role.label} error={form1.formState.errors.contact_role?.message}>
                <Input placeholder={t.fields.contact_role.placeholder} className="h-11" {...form1.register("contact_role")} />
              </Field>
              <Field label={t.fields.company_name.label} required error={form1.formState.errors.company_name?.message}>
                <Input placeholder={t.fields.company_name.placeholder} className="h-11" {...form1.register("company_name")} />
              </Field>
              <Field label={t.fields.website.label} error={form1.formState.errors.website?.message}>
                <Input type="text" inputMode="url" placeholder={t.fields.website.placeholder} className="h-11" {...form1.register("website")} />
              </Field>
            </div>
          )}

          {/* ── Step 2 – Your Business ── */}
          {step === 2 && (
            <div className="p-8 space-y-5">
              <Field label={t.fields.industry.label} required error={form2.formState.errors.industry?.message}>
                <Select
                  key={`industry-${lang}`}
                  value={form2.watch("industry") || undefined}
                  onValueChange={(v) => form2.setValue("industry", v, { shouldValidate: true })}
                >
                  <SelectTrigger className="h-11"><SelectValue placeholder={t.fields.industry.placeholder} /></SelectTrigger>
                  <SelectContent>
                    {OPTION_VALUES.industry.map((val, i) => (
                      <SelectItem key={val} value={val}>{t.options.industry[i]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t.fields.company_size.label} required error={form2.formState.errors.company_size?.message}>
                <Select
                  key={`company_size-${lang}`}
                  value={form2.watch("company_size") || undefined}
                  onValueChange={(v) => form2.setValue("company_size", v, { shouldValidate: true })}
                >
                  <SelectTrigger className="h-11"><SelectValue placeholder={t.fields.company_size.placeholder} /></SelectTrigger>
                  <SelectContent>
                    {OPTION_VALUES.company_size.map((val, i) => (
                      <SelectItem key={val} value={val}>{t.options.company_size[i]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t.fields.business_model.label} required error={form2.formState.errors.business_model?.message}>
                <Select key={`business_model-${lang}`} onValueChange={(v) => form2.setValue("business_model", v)}>
                  <SelectTrigger className="h-11"><SelectValue placeholder={t.fields.business_model.placeholder} /></SelectTrigger>
                  <SelectContent>
                    {OPTION_VALUES.business_model.map((val, i) => (
                      <SelectItem key={val} value={val}>{t.options.business_model[i]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t.fields.one_liner.label} hint={t.fields.one_liner.hint} required error={form2.formState.errors.one_liner?.message}>
                <Textarea placeholder={t.fields.one_liner.placeholder} rows={2} className="resize-none" {...form2.register("one_liner")} />
              </Field>
            </div>
          )}

          {/* ── Step 3 – Goals & Audience ── */}
          {step === 3 && (
            <div className="p-8 space-y-5">
              <Field label={t.fields.goals.label} hint={t.fields.goals.hint} required error={form3.formState.errors.goals?.message}>
                <Textarea placeholder={t.fields.goals.placeholder} rows={3} className="resize-none" {...form3.register("goals")} />
              </Field>
              <Field label={t.fields.ideal_customer.label} hint={t.fields.ideal_customer.hint} required error={form3.formState.errors.ideal_customer?.message}>
                <Textarea placeholder={t.fields.ideal_customer.placeholder} rows={3} className="resize-none" {...form3.register("ideal_customer")} />
              </Field>
              <Field label={t.fields.top_problem.label} error={form3.formState.errors.top_problem?.message}>
                <Textarea placeholder={t.fields.top_problem.placeholder} rows={2} className="resize-none" {...form3.register("top_problem")} />
              </Field>
              <Field label={t.fields.timeline.label} error={form3.formState.errors.timeline?.message}>
                <Select key={`timeline-${lang}`} onValueChange={(v) => form3.setValue("timeline", v)}>
                  <SelectTrigger className="h-11"><SelectValue placeholder={t.fields.timeline.placeholder} /></SelectTrigger>
                  <SelectContent>
                    {OPTION_VALUES.timeline.map((val, i) => (
                      <SelectItem key={val} value={val}>{t.options.timeline[i]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          )}

          {/* ── Step 4 – Brand & Fit ── */}
          {step === 4 && (
            <div className="p-8 space-y-5">
              <Field label={t.fields.competitors.label} hint={t.fields.competitors.hint} error={form4.formState.errors.competitors?.message}>
                <Input placeholder={t.fields.competitors.placeholder} className="h-11" {...form4.register("competitors")} />
              </Field>
              <Field label={t.fields.differentiators.label} hint={t.fields.differentiators.hint} required error={form4.formState.errors.differentiators?.message}>
                <Textarea placeholder={t.fields.differentiators.placeholder} rows={3} className="resize-none" {...form4.register("differentiators")} />
              </Field>
              <Field label={t.fields.tone.label} required error={form4.formState.errors.tone?.message}>
                <Select key={`tone-${lang}`} onValueChange={(v) => form4.setValue("tone", v)}>
                  <SelectTrigger className="h-11"><SelectValue placeholder={t.fields.tone.placeholder} /></SelectTrigger>
                  <SelectContent>
                    {OPTION_VALUES.tone.map((val, i) => (
                      <SelectItem key={val} value={val}>{t.options.tone[i]}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label={t.fields.extra_notes.label} hint={t.fields.extra_notes.hint}>
                <Textarea placeholder={t.fields.extra_notes.placeholder} rows={3} className="resize-none" {...form4.register("extra_notes")} />
              </Field>
              {error && (
                <div className="bg-rose-50 border border-rose-200 text-rose-600 rounded-lg px-4 py-3 text-sm">{error}</div>
              )}
            </div>
          )}

          {/* ── Done ── */}
          {step === 5 && (
            <div className="p-10 text-center">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 size={44} className="text-green-500" />
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-3">{t.success.title}</h1>
              <p className="text-gray-500 text-base leading-relaxed mb-3">
                {t.success.thankYouBefore}<strong className="text-gray-700">{firstName}</strong>{t.success.thankYouAfter}
              </p>
              <p className="text-gray-400 text-sm mb-8">
                {t.success.followUpBefore}<strong className="text-gray-600">{email}</strong>{t.success.followUpMiddle}<strong className="text-gray-600">{t.success.followUpHours}</strong>{t.success.followUpEnd}
              </p>
              <div className="bg-gradient-to-r from-rose-50 to-orange-50 rounded-xl p-5 text-left border border-rose-100">
                <p className="text-xs font-semibold text-rose-600 uppercase tracking-wider mb-2">{t.success.nextStepsTitle}</p>
                <ul className="space-y-2 text-sm text-gray-600">
                  {t.success.steps.map((s, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">{i + 1}</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* ── Navigation ── */}
          {step >= 1 && step <= 4 && (
            <div className="px-8 py-5 border-t border-gray-100 flex items-center justify-between bg-white">
              <Button
                variant="ghost"
                onClick={handleBack}
                disabled={step === 1}
                className="text-gray-400 hover:text-gray-700 gap-1"
              >
                <ChevronLeft size={15} />
                {t.nav.back}
              </Button>
              <Button
                onClick={handleNext}
                disabled={submitting}
                className="bg-rose-500 hover:bg-rose-600 text-white px-7 py-2 rounded-xl font-semibold gap-1.5 shadow-sm shadow-rose-200"
              >
                {submitting ? (
                  <><Loader2 size={15} className="animate-spin" />{t.nav.submitting}</>
                ) : step === 4 ? (
                  <>{t.nav.submit} <CheckCircle2 size={15} /></>
                ) : (
                  <>{t.nav.next} <ChevronRight size={15} /></>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center py-5 text-xs text-gray-400 font-light">{t.footer}</footer>
    </div>
  );
}
