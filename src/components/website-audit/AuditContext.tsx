import { useEffect, useRef, type ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, ExternalLink, Info, Target } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { auditCopyFor } from "@/lib/website-audit/copy";
import type {
  AuditAnswers,
  AuditLanguage,
  BusinessType,
  ConversionAction,
  ReviewRecency,
  TernaryAnswer,
  WebsitePurpose,
} from "@/lib/website-audit/types";

interface AuditContextProps {
  language: AuditLanguage;
  url: string;
  answers: AuditAnswers;
  error?: string;
  onChange: (next: AuditAnswers) => void;
  onBack: () => void;
  onSubmit: () => void;
}

function Section({ number, title, hint, children, id, invalid, error }: {
  number: string;
  title: string;
  hint?: string;
  children: ReactNode;
  id: string;
  invalid?: boolean;
  error?: string;
}) {
  return (
    <fieldset
      aria-invalid={invalid || undefined}
      aria-describedby={invalid ? `${id}-error` : undefined}
      className={cn("border-t border-black/10 py-7 first:border-t-0 first:pt-0 sm:py-8", invalid && "rounded-xl bg-primary/[0.035] px-3")}
    >
      <legend className="float-left mb-4 flex w-full items-start gap-3">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-lv-charcoal text-[11px] font-bold text-white">{number}</span>
        <span>
          <span className="block text-sm font-bold leading-6 sm:text-base">{title}</span>
          {hint && <span className="mt-0.5 block text-xs font-normal leading-5 text-muted-foreground">{hint}</span>}
        </span>
      </legend>
      <div className="clear-both pl-0 sm:pl-10">{children}</div>
      {invalid && <p id={`${id}-error`} className="clear-both mt-2 pl-0 text-xs font-semibold text-primary sm:pl-10">{error}</p>}
    </fieldset>
  );
}

function ChoiceCards<T extends string>({
  options,
  value,
  onChange,
  name,
  columns = 3,
}: {
  options: { value: T; label: string; hint?: string }[];
  value: T | null;
  onChange: (value: T) => void;
  name: string;
  columns?: 2 | 3 | 4;
}) {
  const grid = columns === 4 ? "sm:grid-cols-2 lg:grid-cols-4" : columns === 2 ? "sm:grid-cols-2" : "sm:grid-cols-2 lg:grid-cols-3";
  return (
    <div className={cn("grid gap-2", grid)}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <label
            key={option.value}
            className={cn(
              "relative flex min-h-12 cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-3 transition-all",
              "focus-within:ring-2 focus-within:ring-ring focus-within:ring-offset-2",
              selected ? "border-primary bg-primary/[0.055] shadow-sm" : "border-black/10 bg-white hover:border-black/25",
            )}
          >
            <input
              type="radio"
              name={name}
              checked={selected}
              onChange={() => onChange(option.value)}
              className="sr-only"
            />
            <span className={cn(
              "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
              selected ? "border-primary bg-primary text-white" : "border-black/20 bg-white",
            )}>
              {selected && <Check size={10} strokeWidth={3} aria-hidden="true" />}
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-semibold leading-5 sm:text-sm">{option.label}</span>
              {option.hint && <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">{option.hint}</span>}
            </span>
          </label>
        );
      })}
    </div>
  );
}

export default function AuditContext({ language, url, answers, error, onChange, onBack, onSubmit }: AuditContextProps) {
  const copy = auditCopyFor(language);
  const errorRef = useRef<HTMLDivElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const set = <K extends keyof AuditAnswers>(key: K, value: AuditAnswers[K]) => onChange({ ...answers, [key]: value });
  let displayUrl = url;
  try { displayUrl = new URL(url).hostname; } catch { /* keep submitted value */ }
  useEffect(() => {
    if (!error) return;
    const frame = window.requestAnimationFrame(() => {
      const firstInvalid = formRef.current?.querySelector<HTMLElement>('fieldset[aria-invalid="true"] input');
      (firstInvalid ?? errorRef.current)?.focus({ preventScroll: false });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [error]);
  const missing = {
    businessType: Boolean(error && !answers.businessType),
    audience: Boolean(error && !answers.audience.trim()),
    purpose: Boolean(error && !answers.purpose),
    conversionAction: Boolean(error && !answers.conversionAction),
    differentiation: Boolean(error && !answers.differentiation),
    expectedResults: Boolean(error && !answers.expectedResults),
    lastReviewed: Boolean(error && !answers.lastReviewed),
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
      <div className="mx-auto max-w-4xl">
        <div className="mb-7">
          <div className="flex items-center justify-between gap-4 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <span>{copy.context.progress}</span>
            <span>2 / 3</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-black/10"><div className="h-full w-2/3 rounded-full bg-primary" /></div>
        </div>

        <div className="mb-8 flex flex-col justify-between gap-5 sm:flex-row sm:items-end">
          <div className="max-w-2xl">
            <div className="inline-flex items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-1.5 text-xs text-muted-foreground">
              <span className="h-2 w-2 rounded-full bg-emerald-500" />
              <span className="max-w-[240px] truncate font-medium text-foreground sm:max-w-md">{displayUrl}</span>
              <ExternalLink size={11} aria-hidden="true" />
            </div>
            <h1 className="mt-5 text-3xl font-semibold leading-tight tracking-[-0.035em] sm:text-4xl">{copy.context.heading}</h1>
            <p className="mt-4 text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">{copy.context.body}</p>
          </div>
          <div className="hidden h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-lv-charcoal text-white sm:flex">
            <Target size={25} strokeWidth={1.6} aria-hidden="true" />
          </div>
        </div>

        {error && (
          <div ref={errorRef} role="alert" tabIndex={-1} className="mb-5 flex items-start gap-2 rounded-xl border border-primary/25 bg-primary/[0.045] px-4 py-3 text-sm text-primary outline-none">
            <Info size={16} className="mt-0.5 shrink-0" aria-hidden="true" /> {error}
          </div>
        )}

        <form ref={formRef} onSubmit={(event) => { event.preventDefault(); onSubmit(); }} className="rounded-2xl border border-black/10 bg-white px-4 py-6 shadow-[0_12px_40px_rgba(35,31,32,.06)] sm:px-7 sm:py-8">
          <Section id="audit-business-type" number="1" title={copy.context.businessType} invalid={missing.businessType} error={copy.context.required}>
            <ChoiceCards<BusinessType> name="audit-business-type" options={copy.context.businessTypes} value={answers.businessType} onChange={(value) => set("businessType", value)} />
          </Section>

          <Section id="audit-audience" number="2" title={copy.context.audience} hint={copy.context.audienceHint} invalid={missing.audience} error={copy.context.required}>
            <Input
              aria-label={copy.context.audience}
              aria-invalid={missing.audience || undefined}
              aria-describedby={missing.audience ? "audit-audience-error" : undefined}
              value={answers.audience}
              onChange={(event) => set("audience", event.target.value.slice(0, 240))}
              placeholder={copy.context.audiencePlaceholder}
              className="h-11 max-w-2xl border-black/15 bg-[#faf9f7] text-sm"
            />
          </Section>

          <Section id="audit-purpose" number="3" title={copy.context.purpose} invalid={missing.purpose} error={copy.context.required}>
            <ChoiceCards<WebsitePurpose> name="audit-purpose" options={copy.context.purposes} value={answers.purpose} onChange={(value) => set("purpose", value)} />
          </Section>

          <Section id="audit-conversion-action" number="4" title={copy.context.conversionAction} invalid={missing.conversionAction} error={copy.context.required}>
            <ChoiceCards<ConversionAction> name="audit-conversion-action" options={copy.context.conversionActions} value={answers.conversionAction} onChange={(value) => set("conversionAction", value)} columns={4} />
          </Section>

          <Section id="audit-differentiation" number="5" title={copy.context.differentiation} hint={copy.context.differentiationHint} invalid={missing.differentiation} error={copy.context.required}>
            <ChoiceCards<TernaryAnswer> name="audit-differentiation" options={copy.context.ternary} value={answers.differentiation} onChange={(value) => set("differentiation", value)} />
          </Section>

          <Section id="audit-expected-results" number="6" title={copy.context.expectedResults} hint={copy.context.expectedResultsHint} invalid={missing.expectedResults} error={copy.context.required}>
            <ChoiceCards<TernaryAnswer> name="audit-expected-results" options={copy.context.ternary} value={answers.expectedResults} onChange={(value) => set("expectedResults", value)} />
          </Section>

          <Section id="audit-last-reviewed" number="7" title={copy.context.lastReviewed} invalid={missing.lastReviewed} error={copy.context.required}>
            <ChoiceCards<ReviewRecency> name="audit-review-recency" options={copy.context.reviewRecency} value={answers.lastReviewed} onChange={(value) => set("lastReviewed", value)} columns={4} />
          </Section>

          <div className="flex flex-col-reverse items-stretch justify-between gap-3 border-t border-black/10 pt-6 sm:flex-row sm:items-center">
            <Button type="button" variant="ghost" onClick={onBack} className="gap-2 sm:-ml-2">
              <ArrowLeft size={15} aria-hidden="true" /> {copy.common.back}
            </Button>
            <Button type="submit" size="lg" className="gap-2 px-6">
              {copy.context.submit} <ArrowRight size={16} aria-hidden="true" />
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
