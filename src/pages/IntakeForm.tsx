import { useState, useEffect, useRef } from "react";
import { useParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import confetti from "canvas-confetti";
import { ChevronRight, ChevronLeft, Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import LVLogo from "@/components/LVLogo";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";

// ── Step Schemas ──────────────────────────────────────────────────────────────

const step1Schema = z.object({
  contact_name:  z.string().min(1, "Your name is required"),
  contact_email: z.string().email("Please enter a valid email"),
  contact_role:  z.string().optional(),
  company_name:  z.string().min(1, "Company name is required"),
  website:       z.string().optional(),
});

const step2Schema = z.object({
  industry:      z.string().min(1, "Please select an industry"),
  company_size:  z.string().min(1, "Please select a size"),
  business_model: z.string().min(1, "Please select a model"),
  one_liner:     z.string().min(1, "Please give us a one-liner"),
});

const step3Schema = z.object({
  goals:          z.string().min(1, "Please share your goals"),
  ideal_customer: z.string().min(1, "Please describe your ideal customer"),
  top_problem:    z.string().optional(),
  timeline:       z.string().optional(),
});

const step4Schema = z.object({
  competitors:    z.string().optional(),
  differentiators: z.string().min(1, "This is important — what makes you stand out?"),
  tone:           z.string().min(1, "Please choose a tone"),
  extra_notes:    z.string().optional(),
});

type Step1 = z.infer<typeof step1Schema>;
type Step2 = z.infer<typeof step2Schema>;
type Step3 = z.infer<typeof step3Schema>;
type Step4 = z.infer<typeof step4Schema>;

const STEPS = [
  { label: "About You",       emoji: "👋", hint: "Let's start with who you are" },
  { label: "Your Business",   emoji: "🏢", hint: "Tell us about what you do" },
  { label: "Goals & Audience",emoji: "🎯", hint: "What success looks like" },
  { label: "Brand & Fit",     emoji: "✨", hint: "How you want to be seen" },
];

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
  const [step, setStep]         = useState(0);  // 0 = welcome, 1-4 = steps, 5 = done
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [animating, setAnimating] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError]       = useState<string | null>(null);
  const [formData, setFormData] = useState<Partial<Step1 & Step2 & Step3 & Step4>>({});
  const confettiFired            = useRef(false);

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

  const goTo = (next: number, dir: "forward" | "backward") => {
    if (animating) return;
    setDirection(dir);
    setAnimating(true);
    setTimeout(() => {
      setStep(next);
      setAnimating(false);
    }, 220);
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
      // Submit
      await submit(merged as Step1 & Step2 & Step3 & Step4);
    }
  };

  const handleBack = () => {
    if (step <= 1) return;
    goTo(step - 1, "backward");
  };

  const submit = async (data: Step1 & Step2 & Step3 & Step4) => {
    if (!orgId) { setError("Invalid link — org ID missing."); return; }
    setSubmitting(true);
    setError(null);

    try {
      const { error: dbErr } = await supabase.from("intake_submissions").insert({
        org_id:        orgId,
        contact_name:  data.contact_name,
        contact_email: data.contact_email,
        contact_role:  data.contact_role || null,
        company_name:  data.company_name,
        form_data:     data as unknown as import("@/integrations/supabase/types").Json,
      });
      if (dbErr) throw dbErr;
      goTo(5, "forward");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  // ── Slide animation classes ────────────────────────────────────────────────
  const slideOut = direction === "forward" ? "-translate-x-8 opacity-0" : "translate-x-8 opacity-0";
  const base     = animating ? slideOut : "translate-x-0 opacity-100";

  const progress  = step === 0 ? 0 : step >= 5 ? 100 : (step / 4) * 100;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-rose-50 flex flex-col">
      {/* Top bar */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-white/80 backdrop-blur-sm">
        <div className="flex items-center gap-2.5">
          <LVLogo size={28} />
          <div className="leading-tight">
            <p className="text-xs font-semibold text-gray-900">LV Branding</p>
            <p className="text-[10px] text-gray-400">Marketing Suite</p>
          </div>
        </div>
        {step > 0 && step < 5 && (
          <div className="flex items-center gap-3">
            <span className="text-xs text-gray-400">Step {step} of 4</span>
            <div className="w-28 h-1.5 bg-gray-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-rose-500 rounded-full transition-all duration-500"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}
      </header>

      {/* Step dots */}
      {step > 0 && step < 5 && (
        <div className="flex justify-center gap-2 py-4">
          {STEPS.map((s, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={cn(
                "w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300",
                i + 1 < step  ? "bg-rose-500 text-white scale-90"       :
                i + 1 === step ? "bg-rose-500 text-white ring-4 ring-rose-200" :
                                  "bg-gray-100 text-gray-400"
              )}>
                {i + 1 < step ? "✓" : i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div className={cn("w-8 h-0.5 rounded-full transition-colors duration-300", i + 1 < step ? "bg-rose-400" : "bg-gray-200")} />
              )}
            </div>
          ))}
        </div>
      )}

      {/* Card */}
      <div className="flex-1 flex items-center justify-center px-4 py-8">
        <div
          className={cn(
            "w-full max-w-lg bg-white rounded-2xl shadow-xl border border-gray-100 overflow-hidden transition-all duration-220",
            base
          )}
        >
          {/* ── Welcome ── */}
          {step === 0 && (
            <div className="p-10 text-center">
              <div className="text-6xl mb-5">🎉</div>
              <h1 className="text-3xl font-bold text-gray-900 mb-3 leading-tight">
                We're so glad you're here.
              </h1>
              <p className="text-gray-500 text-base leading-relaxed mb-2">
                You've taken the first step toward a brand that truly stands out.
                We can't wait to learn about your business and create something amazing together.
              </p>
              <p className="text-gray-400 text-sm mb-8">
                This takes about <strong className="text-gray-600">3–5 minutes</strong> — and your answers help us hit the ground running.
              </p>
              <Button size="lg" onClick={() => goTo(1, "forward")} className="bg-rose-500 hover:bg-rose-600 text-white px-8 py-3 text-base rounded-xl shadow-md">
                Let's Get Started
                <ArrowRight size={18} className="ml-2" />
              </Button>
              <p className="text-xs text-gray-300 mt-4">No login required · Takes 3–5 min</p>
            </div>
          )}

          {/* ── Step Header ── */}
          {step >= 1 && step <= 4 && (
            <div className="bg-gradient-to-r from-rose-50 to-orange-50 border-b border-gray-100 px-8 pt-7 pb-5">
              <div className="flex items-center gap-3 mb-1">
                <span className="text-3xl">{STEPS[step - 1].emoji}</span>
                <div>
                  <p className="text-xs font-medium text-rose-500 uppercase tracking-wider">{STEPS[step - 1].hint}</p>
                  <h2 className="text-xl font-bold text-gray-900">{STEPS[step - 1].label}</h2>
                </div>
              </div>
            </div>
          )}

          {/* ── Step 1 – About You ── */}
          {step === 1 && (
            <div className="p-8 space-y-5">
              <Field label="Your full name" required error={form1.formState.errors.contact_name?.message}>
                <Input placeholder="Jane Smith" className="h-11" {...form1.register("contact_name")} />
              </Field>
              <Field label="Work email" required error={form1.formState.errors.contact_email?.message}>
                <Input type="email" placeholder="jane@company.com" className="h-11" {...form1.register("contact_email")} />
              </Field>
              <Field label="Your title / role" error={form1.formState.errors.contact_role?.message}>
                <Input placeholder="e.g. Founder, VP Marketing" className="h-11" {...form1.register("contact_role")} />
              </Field>
              <Field label="Company / Brand name" required error={form1.formState.errors.company_name?.message}>
                <Input placeholder="Acme Corp" className="h-11" {...form1.register("company_name")} />
              </Field>
              <Field label="Website" error={form1.formState.errors.website?.message}>
                <Input type="url" placeholder="https://..." className="h-11" {...form1.register("website")} />
              </Field>
            </div>
          )}

          {/* ── Step 2 – Your Business ── */}
          {step === 2 && (
            <div className="p-8 space-y-5">
              <Field label="Industry" required error={form2.formState.errors.industry?.message}>
                <Select onValueChange={(v) => form2.setValue("industry", v)}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Select industry..." /></SelectTrigger>
                  <SelectContent>
                    {["SaaS / Software","E-commerce / Retail","Professional Services","Healthcare","Education","Finance / Fintech","Real Estate","Media / Entertainment","Non-profit","Other"].map(o => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Company size" required error={form2.formState.errors.company_size?.message}>
                <Select onValueChange={(v) => form2.setValue("company_size", v)}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Select size..." /></SelectTrigger>
                  <SelectContent>
                    {["Just me (solo)","2–10 people","11–50 people","51–200 people","201–500 people","500+ people"].map(o => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Business model" required error={form2.formState.errors.business_model?.message}>
                <Select onValueChange={(v) => form2.setValue("business_model", v)}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Select model..." /></SelectTrigger>
                  <SelectContent>
                    {["SaaS","Freemium","Usage-based","E-commerce","Marketplace","Service / Agency","Non-profit","Other"].map(o => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field
                label="One-liner — what do you do?"
                hint="Finish this sentence: 'We help [who] do [what]'"
                required
                error={form2.formState.errors.one_liner?.message}
              >
                <Textarea placeholder="e.g. We help marketing teams ship campaigns 10× faster." rows={2} className="resize-none" {...form2.register("one_liner")} />
              </Field>
            </div>
          )}

          {/* ── Step 3 – Goals & Audience ── */}
          {step === 3 && (
            <div className="p-8 space-y-5">
              <Field
                label="What are you hoping to achieve with us?"
                hint="Think big — more leads, stronger brand, better content?"
                required
                error={form3.formState.errors.goals?.message}
              >
                <Textarea placeholder="e.g. Build brand awareness in the enterprise segment and generate more qualified inbound leads." rows={3} className="resize-none" {...form3.register("goals")} />
              </Field>
              <Field
                label="Who is your ideal customer?"
                hint="Be specific — role, industry, company size"
                required
                error={form3.formState.errors.ideal_customer?.message}
              >
                <Textarea placeholder="e.g. B2B SaaS marketing managers at 50–500 person tech companies." rows={3} className="resize-none" {...form3.register("ideal_customer")} />
              </Field>
              <Field label="Their biggest pain point you solve" error={form3.formState.errors.top_problem?.message}>
                <Textarea placeholder="e.g. They spend too long on manual campaign work..." rows={2} className="resize-none" {...form3.register("top_problem")} />
              </Field>
              <Field label="When are you looking to get started?" error={form3.formState.errors.timeline?.message}>
                <Select onValueChange={(v) => form3.setValue("timeline", v)}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Timeline..." /></SelectTrigger>
                  <SelectContent>
                    {["ASAP","Within 2 weeks","Within 1 month","1–3 months","Just exploring"].map(o => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          )}

          {/* ── Step 4 – Brand & Fit ── */}
          {step === 4 && (
            <div className="p-8 space-y-5">
              <Field label="Top 2–3 competitors" hint="Even if you're disrupting the space" error={form4.formState.errors.competitors?.message}>
                <Input placeholder="e.g. HubSpot, Mailchimp, ActiveCampaign" className="h-11" {...form4.register("competitors")} />
              </Field>
              <Field
                label="What sets you apart?"
                hint="Why should customers choose you over everyone else?"
                required
                error={form4.formState.errors.differentiators?.message}
              >
                <Textarea placeholder="e.g. We're 10× faster to set up, require no code, and are built specifically for SMBs." rows={3} className="resize-none" {...form4.register("differentiators")} />
              </Field>
              <Field label="Brand tone" required error={form4.formState.errors.tone?.message}>
                <Select onValueChange={(v) => form4.setValue("tone", v)}>
                  <SelectTrigger className="h-11"><SelectValue placeholder="Choose a tone..." /></SelectTrigger>
                  <SelectContent>
                    {["Professional & authoritative","Conversational & approachable","Bold & disruptive","Playful & energetic","Empathetic & supportive","Technical & precise"].map(o => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
              <Field label="Anything else we should know?" hint="Challenges, sensitivities, previous agency experience…">
                <Textarea placeholder="Feel free to share anything that will help us understand your situation better." rows={3} className="resize-none" {...form4.register("extra_notes")} />
              </Field>

              {error && (
                <div className="bg-rose-50 border border-rose-200 text-rose-600 rounded-lg px-4 py-3 text-sm">
                  {error}
                </div>
              )}
            </div>
          )}

          {/* ── Done ── */}
          {step === 5 && (
            <div className="p-10 text-center">
              <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                <CheckCircle2 size={44} className="text-green-500" />
              </div>
              <h1 className="text-3xl font-bold text-gray-900 mb-3">You're all set! 🎊</h1>
              <p className="text-gray-500 text-base leading-relaxed mb-3">
                Thank you, <strong className="text-gray-700">{(formData as Step1).contact_name?.split(" ")[0]}</strong>!
                We've received everything we need to hit the ground running.
              </p>
              <p className="text-gray-400 text-sm mb-8">
                Our team will review your brief and reach out to <strong className="text-gray-600">{(formData as Step1).contact_email}</strong> within <strong className="text-gray-600">24 hours</strong>.
              </p>
              <div className="bg-gradient-to-r from-rose-50 to-orange-50 rounded-xl p-5 text-left border border-rose-100">
                <p className="text-xs font-semibold text-rose-600 uppercase tracking-wider mb-2">What happens next</p>
                <ul className="space-y-2 text-sm text-gray-600">
                  <li className="flex items-center gap-2"><span className="w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">1</span>We review your brief & prepare questions</li>
                  <li className="flex items-center gap-2"><span className="w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">2</span>Kickoff call to align on strategy</li>
                  <li className="flex items-center gap-2"><span className="w-5 h-5 bg-rose-500 text-white rounded-full flex items-center justify-center text-[10px] font-bold shrink-0">3</span>We get to work building your brand</li>
                </ul>
              </div>
            </div>
          )}

          {/* ── Navigation ── */}
          {step >= 1 && step <= 4 && (
            <div className="px-8 py-5 border-t border-gray-100 flex items-center justify-between bg-gray-50/50">
              <Button
                variant="ghost"
                onClick={handleBack}
                disabled={step === 1}
                className="text-gray-500 hover:text-gray-800"
              >
                <ChevronLeft size={16} className="mr-1" />
                Back
              </Button>
              <Button
                onClick={handleNext}
                disabled={submitting}
                className="bg-rose-500 hover:bg-rose-600 text-white px-6 rounded-xl"
              >
                {submitting ? (
                  <><Loader2 size={15} className="mr-2 animate-spin" />Submitting...</>
                ) : step === 4 ? (
                  <>Submit Brief <CheckCircle2 size={15} className="ml-2" /></>
                ) : (
                  <>Next <ChevronRight size={15} className="ml-1" /></>
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="text-center py-4 text-xs text-gray-300">
        Powered by LV Marketing Suite · Your information is kept strictly confidential.
      </footer>
    </div>
  );
}
