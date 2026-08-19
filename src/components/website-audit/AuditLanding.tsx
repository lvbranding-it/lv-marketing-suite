import { useEffect, useState, type FormEvent } from "react";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  Code2,
  Compass,
  Gauge,
  Globe2,
  LayoutTemplate,
  LockKeyhole,
  Search,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { auditCopyFor } from "@/lib/website-audit/copy";
import { recordAuditLandingView } from "@/lib/website-audit/api";
import { DIMENSIONS, type AuditDimension, type AuditLanguage } from "@/lib/website-audit/types";

interface AuditLandingProps {
  language: AuditLanguage;
  url: string;
  error?: string;
  onUrlChange: (value: string) => void;
  onSubmit: () => void;
  onSample: () => void;
}

const dimensionIcons: Record<AuditDimension, typeof Gauge> = {
  experience: LayoutTemplate,
  positioning: Target,
  search: Search,
  aiReadiness: Bot,
  technical: Code2,
};

export default function AuditLanding({ language, url, error, onUrlChange, onSubmit, onSample }: AuditLandingProps) {
  const copy = auditCopyFor(language);
  const [submitting, setSubmitting] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [termsError, setTermsError] = useState(false);
  useEffect(() => recordAuditLandingView(language), [language]);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!termsAccepted) {
      setTermsError(true);
      return;
    }
    setSubmitting(true);
    onSubmit();
    window.setTimeout(() => setSubmitting(false), 250);
  };

  return (
    <div className="overflow-hidden bg-white">
      <section className="relative bg-lv-charcoal text-white">
        <div className="audit-grid absolute inset-0 opacity-30" aria-hidden="true" />
        <div className="absolute -right-28 -top-28 h-96 w-96 rounded-full border border-white/10" aria-hidden="true" />
        <div className="absolute -right-12 top-0 h-64 w-64 rounded-full border border-primary/40" aria-hidden="true" />

        <div className="relative mx-auto grid w-full max-w-7xl gap-10 px-4 pb-28 pt-14 sm:px-6 sm:pb-32 sm:pt-20 lg:grid-cols-[1.15fr_.85fr] lg:items-center lg:px-8 lg:pb-36 lg:pt-24">
          <div className="max-w-3xl">
            <p className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-white/65">
              <span className="h-px w-8 bg-primary" /> {copy.landing.eyebrow}
            </p>
            <h1 className="text-[2.55rem] font-semibold leading-[1.03] tracking-[-0.04em] sm:text-6xl lg:text-[4.25rem]">
              {copy.landing.heading}{" "}
              <span className="text-[#f16b7e]">{copy.landing.emphasis}</span>
            </h1>
            <p className="mt-6 max-w-2xl text-base leading-7 text-white/70 sm:text-lg">
              {copy.landing.body}
            </p>
          </div>

          <div className="relative hidden min-h-[360px] lg:block" aria-hidden="true">
            <div className="absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-1/2 rounded-full border border-white/10" />
            <div className="absolute left-1/2 top-1/2 h-52 w-52 -translate-x-1/2 -translate-y-1/2 rounded-full border border-dashed border-white/20" />
            <div className="absolute left-1/2 top-1/2 flex h-28 w-28 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary shadow-[0_0_70px_rgba(203,32,57,.34)]">
              <Compass size={42} strokeWidth={1.5} />
            </div>
            {DIMENSIONS.map((dimension, index) => {
              const positions = ["left-0 top-8", "right-0 top-16", "right-2 bottom-14", "left-8 bottom-5", "left-[-18px] top-[47%]"];
              const Icon = dimensionIcons[dimension];
              return (
                <div key={dimension} className={`absolute ${positions[index]} flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-3 py-2 text-xs text-white/80 backdrop-blur`}>
                  <Icon size={14} className="text-[#f16b7e]" /> {copy.dimensions[dimension].short}
                </div>
              );
            })}
          </div>
        </div>

        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-b from-transparent to-black/10" aria-hidden="true" />
      </section>

      <section className="relative z-10 mx-auto -mt-20 w-full max-w-5xl px-4 sm:-mt-24 sm:px-6">
        <div className="rounded-2xl border border-black/10 bg-white p-4 shadow-[0_24px_65px_rgba(35,31,32,.16)] sm:p-6">
          <form onSubmit={submit} noValidate>
            <label htmlFor="audit-url" className="mb-2 block text-sm font-semibold text-lv-charcoal">
              {copy.landing.urlLabel}
            </label>
            <div className="flex flex-col gap-3 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Globe2 className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground" size={19} aria-hidden="true" />
                <Input
                  id="audit-url"
                  type="url"
                  inputMode="url"
                  autoComplete="url"
                  spellCheck={false}
                  value={url}
                  onChange={(event) => onUrlChange(event.target.value)}
                  placeholder={copy.landing.urlPlaceholder}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? "audit-url-error" : "audit-url-help"}
                  className="h-[52px] border-black/15 pl-11 text-base shadow-none focus-visible:ring-primary"
                />
              </div>
              <Button type="submit" size="lg" disabled={submitting} className="h-[52px] shrink-0 gap-2 px-6 text-sm shadow-sm sm:min-w-48">
                {submitting ? copy.landing.workingCta : copy.landing.cta}
                {!submitting && <ArrowRight size={16} aria-hidden="true" />}
              </Button>
            </div>
            {error ? (
              <p id="audit-url-error" role="alert" className="mt-2 text-xs font-medium text-destructive">{error}</p>
            ) : (
              <p id="audit-url-help" className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                <LockKeyhole size={12} aria-hidden="true" /> {copy.landing.reassurance}
              </p>
            )}

            <label className="mt-4 flex cursor-pointer items-start gap-2.5 border-t border-border pt-3 text-xs leading-5 text-foreground">
              <input
                type="checkbox"
                checked={termsAccepted}
                onChange={(event) => { setTermsAccepted(event.target.checked); setTermsError(false); }}
                aria-invalid={termsError}
                aria-describedby={termsError ? "audit-terms-error" : undefined}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-input accent-primary"
              />
              <span>{copy.landing.acceptTerms}</span>
            </label>
            {termsError && <p id="audit-terms-error" role="alert" className="mt-1.5 text-xs font-medium text-destructive">{copy.landing.termsRequired}</p>}

            <div className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              <details className="group inline">
                <summary className="inline cursor-pointer list-none underline decoration-muted-foreground/40 underline-offset-2 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                  {copy.landing.termsLead} {copy.landing.terms}.
                </summary>
                <p className="mt-2 max-w-3xl rounded-lg bg-muted/60 p-3 text-xs leading-relaxed">{copy.landing.termsBody}</p>
              </details>{" "}
              <span>{copy.landing.privacy}</span>
            </div>
          </form>
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          {copy.landing.sampleLead}{" "}
          <button type="button" onClick={onSample} className="font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
            {copy.landing.sampleCta}
          </button>
        </p>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
        <div className="grid gap-4 md:grid-cols-3">
          {[
            { icon: Gauge, title: copy.landing.representative, body: copy.landing.representativeBody },
            { icon: ShieldCheck, title: copy.landing.evidence, body: copy.landing.evidenceBody },
            { icon: Sparkles, title: copy.landing.useful, body: copy.landing.usefulBody },
          ].map(({ icon: Icon, title, body }) => (
            <article key={title} className="rounded-xl border border-black/10 bg-[#faf9f7] p-5 sm:p-6">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary">
                <Icon size={19} aria-hidden="true" />
              </span>
              <h2 className="mt-4 text-base font-bold tracking-[-0.01em]">{title}</h2>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="border-y border-black/10 bg-[#f6f5f3]">
        <div className="mx-auto grid w-full max-w-7xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-[.85fr_1.15fr] lg:px-8 lg:py-24">
          <div className="max-w-lg">
            <p className="text-xs font-bold uppercase tracking-[0.17em] text-primary">{copy.landing.dimensionEyebrow}</p>
            <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-[-0.03em] sm:text-4xl">{copy.landing.dimensionHeading}</h2>
            <p className="mt-5 text-sm leading-7 text-muted-foreground">{copy.landing.dimensionBody}</p>
          </div>
          <div className="grid gap-px overflow-hidden rounded-2xl border border-black/10 bg-black/10 sm:grid-cols-2">
            {DIMENSIONS.map((dimension, index) => {
              const Icon = dimensionIcons[dimension];
              return (
                <article key={dimension} className={`bg-white p-5 sm:p-6 ${index === DIMENSIONS.length - 1 ? "sm:col-span-2" : ""}`}>
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-lv-charcoal text-white"><Icon size={17} /></span>
                    <div>
                      <h3 className="text-sm font-bold">{copy.dimensions[dimension].label}</h3>
                      <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{copy.dimensions[dimension].description}</p>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto w-full max-w-7xl px-4 py-20 sm:px-6 lg:px-8 lg:py-24">
        <h2 className="max-w-xl text-2xl font-semibold tracking-[-0.025em] sm:text-3xl">{copy.landing.stepsHeading}</h2>
        <div className="mt-10 grid gap-8 md:grid-cols-3">
          {copy.landing.steps.map((step, index) => (
            <article key={step.number} className="relative border-t border-black/20 pt-5">
              <span className="text-xs font-bold tracking-[0.18em] text-primary">{step.number}</span>
              <h3 className="mt-4 flex items-center gap-2 text-base font-bold">
                {step.title} {index < 2 && <ArrowRight size={15} className="hidden text-muted-foreground md:block" aria-hidden="true" />}
              </h3>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{step.body}</p>
            </article>
          ))}
        </div>

        <div className="mt-14 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 rounded-xl border border-primary/15 bg-primary/[0.035] px-5 py-4 text-xs text-muted-foreground">
          {copy.landing.badges.map((badge) => (
            <span key={badge} className="flex items-center gap-2"><CheckCircle2 size={14} className="text-primary" /> {badge}</span>
          ))}
        </div>
      </section>
    </div>
  );
}
