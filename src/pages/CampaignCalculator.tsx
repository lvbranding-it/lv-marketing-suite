// ── Campaign Investment Calculator: page orchestration ─────────────────────────
// Public tool (no auth) following the same shell as /qr-generator and
// /email-signature-generator. State machine: intro → 6 guided steps → results.
// Progress persists to localStorage; the engine in src/lib/campaign does the math.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Calculator, CheckCircle2, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import AuditLottie from "@/components/website-audit/AuditLottie";
import LVLogo from "@/components/LVLogo";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { CATEGORIES } from "@/lib/campaign/config";
import { categories } from "@/lib/campaign/localized";
import {
  buildTextSummary, calculate, rebalanceShares,
} from "@/lib/campaign/engine";
import {
  clearState, emptyAnswers, loadState, saveState,
} from "@/lib/campaign/persist";
import type {
  CalculatorAnswers, CategoryKey, ScenarioKey, Shares,
} from "@/lib/campaign/types";
import {
  FinancialStep, ObjectiveStep, ProfileStep, ReadinessStep, ReviewStep,
  ScopeStep, STEP_LABELS, validateStep, type StepErrors,
} from "@/components/campaign-calc/steps";
import { StepProgress } from "@/components/campaign-calc/shared";
import ResultsDashboard from "@/components/campaign-calc/ResultsDashboard";
import {
  BalanceCard, BreakEvenCard, DetailCards, Disclaimer,
  FeasibilityCard, PhaseScopeCard, ReadinessCard,
} from "@/components/campaign-calc/ResultsInsights";
import ReviewCta from "@/components/campaign-calc/ReviewCta";
import PrintReport, { reportFilename } from "@/components/campaign-calc/PrintReport";
import { CalcLangProvider, useCalcCopy } from "@/components/campaign-calc/lang";
import { supabase } from "@/integrations/supabase/client";
import { LEAD_SOURCE } from "@/lib/campaign/lead";
import { copyFor } from "@/lib/campaign/copy/resolve";
import type { Lang } from "@/lib/campaign/copy";

type Phase = "intro" | "steps" | "results";

function usePageMetadata(lang: Lang) {
  useEffect(() => {
    const { pageTitle, pageDescription } = copyFor(lang).meta;
    const previousTitle = document.title;
    document.title = pageTitle;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const created = !meta;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    const previousDescription = meta.content;
    meta.content = pageDescription;
    return () => {
      document.title = previousTitle;
      if (created) meta?.remove();
      else if (meta) meta.content = previousDescription;
    };
  }, [lang]);

  // The document language matters for screen readers and for how browsers
  // hyphenate and offer translation.
  useEffect(() => {
    const previous = document.documentElement.lang;
    document.documentElement.lang = lang;
    return () => { document.documentElement.lang = previous; };
  }, [lang]);
}

export default function CampaignCalculator({ lang = "en" }: { lang?: Lang }) {
  return (
    <CalcLangProvider lang={lang}>
      <CalculatorBody lang={lang} />
    </CalcLangProvider>
  );
}

/**
 * Records one view per browser session, matching ServiceLeadWizard so the
 * conversion rate on /lead-forms compares like with like. Best-effort and
 * non-blocking: a failure here must never affect the tool. Both languages count
 * under one source, because they are the same funnel; `av_leads.lang` carries
 * the split.
 */
function useRecordView() {
  useEffect(() => {
    const key = `lead-form-viewed:${LEAD_SOURCE}`;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, "1");
    } catch { /* private mode: count anyway */ }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (supabase as any).from("lead_form_views").insert({ source: LEAD_SOURCE }).then(() => {});
  }, []);
}

function CalculatorBody({ lang }: { lang: Lang }) {
  usePageMetadata(lang);
  useRecordView();
  const t = useCalcCopy();
  const { toast } = useToast();

  // ── Persistent core state ─────────────────────────────────────────────────────
  // The validator is passed in so a restored session can never resume past a
  // question whose answer no longer exists (e.g. after a taxonomy change).
  const restored = useRef(loadState(validateStep));
  const [phase, setPhase]     = useState<Phase>(restored.current?.phase ?? "intro");
  const [step, setStep]       = useState(restored.current?.step ?? 0);
  const [answers, setAnswers] = useState<CalculatorAnswers>(restored.current?.answers ?? emptyAnswers());
  const [maxVisited, setMaxVisited] = useState(restored.current?.step ?? 0);
  const [errors, setErrors]   = useState<StepErrors>({});
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => { saveState({ answers, step, phase }); }, [answers, step, phase]);

  // Clear errors the user has just resolved. Only ever removes messages, so
  // validation still never interrupts someone mid-answer.
  useEffect(() => {
    setErrors((prev) => {
      const keys = Object.keys(prev);
      if (keys.length === 0) return prev;
      const current = validateStep(step, answers);
      const remaining: StepErrors = {};
      for (const key of keys) if (current[key]) remaining[key] = current[key];
      return Object.keys(remaining).length === keys.length ? prev : remaining;
    });
  }, [answers, step]);

  // ── Results state ─────────────────────────────────────────────────────────────
  const result = useMemo(() => (phase === "results" ? calculate(answers, lang) : null), [phase, answers, lang]);
  const [selected, setSelected] = useState<ScenarioKey>("growth");
  const [customShares, setCustomShares] = useState<Partial<Record<ScenarioKey, Shares>>>({});
  const [locked, setLocked] = useState<CategoryKey[]>([]);

  const plan = result ? result.scenarios[selected] : null;
  const currentShares: Shares | null = plan ? (customShares[selected] ?? plan.shares) : null;

  // ── Step navigation ───────────────────────────────────────────────────────────
  const goNext = () => {
    const stepErrors = validateStep(step, answers);
    setErrors(stepErrors);
    if (Object.keys(stepErrors).length > 0) return;
    if (step < STEP_LABELS.length - 1) {
      const next = step + 1;
      setStep(next);
      setMaxVisited((m) => Math.max(m, next));
      window.scrollTo({ top: 0 });
    } else {
      // Build the plan: fresh customisations, recommendation selected.
      setCustomShares({});
      setLocked([]);
      setPhase("results");
      window.scrollTo({ top: 0 });
    }
  };

  const goBack = () => {
    if (step > 0) { setStep(step - 1); setErrors({}); window.scrollTo({ top: 0 }); }
    else setPhase("intro");
  };

  const jumpTo = useCallback((target: number) => {
    setStep(target);
    setErrors({});
    setPhase("steps");
    window.scrollTo({ top: 0 });
  }, []);

  // Recommended scenario becomes the initial selection when results open.
  useEffect(() => {
    if (phase === "results" && result) setSelected(result.recommendedScenario);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase]);

  // ── Results interactions ──────────────────────────────────────────────────────
  const handleShareChange = (key: CategoryKey, nextShare: number) => {
    if (!plan || !currentShares) return;
    setCustomShares((prev) => ({
      ...prev,
      [selected]: rebalanceShares(currentShares, key, nextShare, locked),
    }));
  };

  const resetShares = () => {
    setCustomShares((prev) => ({ ...prev, [selected]: undefined }));
    setLocked([]);
  };

  const toggleLock = (key: CategoryKey) =>
    setLocked((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const copySummary = async (): Promise<boolean> => {
    if (!result || !plan || !currentShares) return false;
    try {
      await navigator.clipboard.writeText(buildTextSummary(answers, plan, currentShares, result.readiness, lang));
      return true;
    } catch {
      toast({ title: t.results.copySummary, description: t.cta.submitFailed });
      return false;
    }
  };

  /**
   * Two things have to happen before `window.print()`:
   *
   * 1. `document.title` becomes the suggested PDF filename in every major
   *    browser, so it is swapped for the report name and restored afterwards.
   * 2. The report is several pages long, and the app's shared `.print-only`
   *    rule pins its content absolutely, which would clip everything past page
   *    one. Collapsing the report's siblings up the ancestor chain lets it
   *    print from normal flow, where the browser paginates it properly and
   *    repeats the fixed footer. `visibility: hidden` alone is not enough:
   *    hidden elements still occupy layout, which would push the report past
   *    the first page.
   *
   * `afterprint` covers the normal path; the timeout is a backstop for browsers
   * that never fire it, so the page is never left collapsed or misnamed.
   */
  const printReport = () => {
    const report = document.querySelector<HTMLElement>(".cc-report");
    const collapsed: HTMLElement[] = [];

    if (report) {
      for (let node: HTMLElement | null = report; node && node !== document.body;) {
        const parent: HTMLElement | null = node.parentElement;
        if (!parent) break;
        for (const sibling of Array.from(parent.children)) {
          if (sibling !== node && sibling instanceof HTMLElement) {
            sibling.classList.add("cc-print-hidden");
            collapsed.push(sibling);
          }
        }
        node = parent;
      }
      document.body.classList.add("cc-printing");
    }

    const originalTitle = document.title;
    let restored = false;
    const restore = () => {
      if (restored) return;
      restored = true;
      document.title = originalTitle;
      document.body.classList.remove("cc-printing");
      collapsed.forEach((el) => el.classList.remove("cc-print-hidden"));
      window.removeEventListener("afterprint", restore);
    };

    document.title = reportFilename(lang);
    window.addEventListener("afterprint", restore);
    window.setTimeout(restore, 60_000);

    try {
      window.print();
    } finally {
      // Chrome blocks on print() and fires afterprint; Safari returns early.
      // Either way the listener or this timeout puts the page back.
      window.setTimeout(restore, 0);
    }
  };

  const startOver = () => {
    clearState();
    setAnswers(emptyAnswers());
    setStep(0);
    setMaxVisited(0);
    setErrors({});
    setCustomShares({});
    setLocked([]);
    setPhase("intro");
    setConfirmReset(false);
    window.scrollTo({ top: 0 });
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  const stepView = [
    <ProfileStep key="p" answers={answers} onChange={setAnswers} errors={errors} />,
    <ObjectiveStep key="o" answers={answers} onChange={setAnswers} errors={errors} />,
    <ScopeStep key="s" answers={answers} onChange={setAnswers} errors={errors} />,
    <ReadinessStep key="r" answers={answers} onChange={setAnswers} errors={errors} />,
    <FinancialStep key="f" answers={answers} onChange={setAnswers} errors={errors} />,
    <ReviewStep key="v" answers={answers} onChange={setAnswers} errors={errors} onJump={jumpTo} />,
  ][step];

  return (
    <div className="min-h-screen bg-muted/30 flex flex-col">
      {/* Header */}
      <header className="bg-background border-b border-border px-4 sm:px-6 py-3 flex items-center gap-3 flex-wrap shrink-0">
        <div className="flex items-center gap-3 mr-auto min-w-0">
          <LVLogo size={34} className="shrink-0" />
          <div className="leading-tight min-w-0">
            <h1 className="text-base font-bold text-foreground">
              {t.meta.productName}{" "}
              <span className="font-light text-muted-foreground">{t.meta.byline}</span>
            </h1>
          </div>
        </div>
        {phase !== "intro" && (
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setConfirmReset(true)}>
            <RefreshCw size={13} /> {t.nav.startOver}
          </Button>
        )}
      </header>

      <main className={cn("w-full flex-1", phase === "intro" ? "" : "mx-auto max-w-5xl p-3 sm:p-6")}>
        {/* ── Intro ── */}
        {phase === "intro" && (
          <div className="overflow-hidden bg-white">
            {/* ── Hero, matching the Website Opportunity Audit ── */}
            <section className="relative bg-white text-lv-charcoal">
              <div className="audit-grid-light absolute inset-0 opacity-70" aria-hidden="true" />
              <div className="absolute -right-28 -top-28 h-96 w-96 rounded-full border border-black/[0.07]" aria-hidden="true" />
              <div className="absolute -right-12 top-0 h-64 w-64 rounded-full border border-primary/25" aria-hidden="true" />

              <div className="relative mx-auto grid w-full max-w-7xl gap-10 px-4 pb-20 pt-14 sm:px-6 sm:pb-24 sm:pt-20 lg:grid-cols-[1.065fr_.935fr] lg:items-center lg:px-8 lg:pt-24">
                <div className="max-w-3xl">
                  <p className="mb-5 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-lv-charcoal/60">
                    <span className="h-px w-8 bg-primary" /> {t.intro.eyebrow}
                  </p>
                  <h1 className="text-[2.2rem] font-bold leading-[1.05] tracking-[-0.04em] sm:text-5xl lg:text-[3.5rem]">
                    {t.intro.heading}{" "}
                    <span className="text-primary">{t.intro.headingEmphasis}</span>
                  </h1>
                  <p className="mt-6 max-w-2xl text-base leading-7 text-lv-charcoal/70 sm:text-lg">
                    {t.intro.body}
                  </p>
                  <p className="mt-4 max-w-2xl text-sm font-bold leading-6">{t.intro.emphasis}</p>

                  <Button size="lg" className="mt-8 gap-2" onClick={() => { setPhase("steps"); setStep(0); }}>
                    {t.intro.cta} <ArrowRight size={16} aria-hidden="true" />
                  </Button>
                  <p className="mt-4 text-[11px] text-muted-foreground">{t.intro.reassurance}</p>

                  {restored.current && restored.current.phase !== "intro" && (
                    <p className="mt-6 text-xs text-muted-foreground">
                      {t.intro.resumeLead}{" "}
                      <button
                        type="button"
                        className="font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                        onClick={() => { setPhase(restored.current?.phase === "results" ? "results" : "steps"); setStep(restored.current?.step ?? 0); setMaxVisited(restored.current?.step ?? 0); }}
                      >
                        {t.intro.resumeLink}
                      </button>.
                    </p>
                  )}
                </div>

                {/*
                  The illustration slot. `AuditLottie` renders nothing when the
                  file is absent, so this stays empty and the layout closes up
                  until the animation is dropped in at this path.
                */}
                <div className="relative hidden min-h-[360px] items-center justify-center lg:flex">
                  <AuditLottie src="/campaign-calculator-hero.json" className="max-w-[560px]" />
                </div>
              </div>
            </section>

            {/* ── Three reasons to trust the number ── */}
            <section className="mx-auto w-full max-w-6xl px-4 pb-4 sm:px-6 lg:px-8">
              <div className="grid gap-px overflow-hidden rounded-2xl border border-black/10 bg-black/10 sm:grid-cols-3">
                {t.intro.cards.map((card) => (
                  <article key={card.title} className="bg-white p-5 sm:p-6">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary">
                      <CheckCircle2 size={17} aria-hidden="true" />
                    </span>
                    <h2 className="mt-4 text-sm font-bold">{card.title}</h2>
                    <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{card.body}</p>
                  </article>
                ))}
              </div>
            </section>

            {/* ── Where the money goes: the six funded categories ── */}
            <section className="mt-16 bg-[#faf9f8] py-16 sm:mt-20 sm:py-20">
              <div className="mx-auto grid w-full max-w-6xl gap-10 px-4 sm:px-6 lg:grid-cols-[.85fr_1.15fr] lg:items-start lg:px-8">
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.17em] text-primary">{t.intro.categoriesEyebrow}</p>
                  <h2 className="mt-4 text-3xl font-bold leading-tight tracking-[-0.03em] sm:text-4xl">{t.intro.categoriesHeading}</h2>
                  <p className="mt-5 text-sm leading-7 text-muted-foreground">{t.intro.categoriesBody}</p>
                </div>
                <div className="grid gap-px overflow-hidden rounded-2xl border border-black/10 bg-black/10 sm:grid-cols-2">
                  {categories(lang).map((entry) => (
                    <article key={entry.key} className="flex gap-3 bg-white p-5">
                      <span
                        className="mt-0.5 h-9 w-1.5 shrink-0 rounded-full"
                        style={{ backgroundColor: entry.colorLight }}
                        aria-hidden="true"
                      />
                      <span className="min-w-0">
                        <h3 className="text-sm font-bold">{entry.label}</h3>
                        <p className="mt-1.5 text-xs leading-5 text-muted-foreground">{entry.why}</p>
                      </span>
                    </article>
                  ))}
                </div>
              </div>
            </section>

            {/* ── What happens next ── */}
            <section className="mx-auto w-full max-w-6xl px-4 py-16 sm:px-6 sm:py-20 lg:px-8">
              <h2 className="max-w-xl text-2xl font-bold tracking-[-0.025em] text-primary sm:text-3xl">{t.intro.stepsHeading}</h2>
              <div className="mt-10 grid gap-8 md:grid-cols-3">
                {t.intro.steps.map((entry, index) => (
                  <div key={entry.number} className="border-t border-black/10 pt-5">
                    <span className="text-xs font-bold tracking-[0.18em] text-primary">{entry.number}</span>
                    <h3 className="mt-4 flex items-center gap-2 text-base font-bold">
                      {entry.title}
                      {index < 2 && <ArrowRight size={15} className="hidden text-muted-foreground md:block" aria-hidden="true" />}
                    </h3>
                    <p className="mt-2 text-sm leading-6 text-muted-foreground">{entry.body}</p>
                  </div>
                ))}
              </div>

              <div className="mt-14 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 rounded-xl border border-primary/15 bg-primary/[0.035] px-5 py-4 text-xs text-muted-foreground">
                {t.intro.badges.map((badge) => (
                  <span key={badge} className="flex items-center gap-2">
                    <CheckCircle2 size={14} className="text-primary" /> {badge}
                  </span>
                ))}
              </div>
            </section>
          </div>
        )}

        {/* ── Guided steps ── */}
        {phase === "steps" && (
          <div className="mx-auto max-w-3xl space-y-5">
            <StepProgress steps={t.steps.labels.slice(0, STEP_LABELS.length)} current={step} maxVisited={maxVisited} onJump={jumpTo} />
            <section
              aria-label={`${t.nav.stepOf(step + 1, STEP_LABELS.length)}: ${t.steps.labels[step]}`}
              className="rounded-xl border border-border bg-card p-4 sm:p-6"
            >
              <h2 className="mb-5 text-base font-bold">{t.steps.titles[step]}</h2>
              {stepView}
            </section>
            <div className="flex items-center justify-between gap-3 pb-8">
              <Button variant="outline" className="gap-1.5" onClick={goBack}>
                <ArrowLeft size={15} aria-hidden="true" /> {t.nav.back}
              </Button>
              <Button className="gap-1.5" onClick={goNext}>
                {step === STEP_LABELS.length - 1 ? t.steps.buildPlan : t.nav.next}
                <ArrowRight size={15} aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {phase === "results" && result && plan && currentShares && (
          <div className="space-y-5 pb-10">
            <div>
              <h2 className="text-xl font-bold sm:text-2xl">{t.results.heading}</h2>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                {t.results.blurb}
              </p>
            </div>

            <ResultsDashboard
              answers={answers}
              result={result}
              selected={selected}
              onSelect={setSelected}
              currentShares={currentShares}
              onSharesChange={handleShareChange}
              locked={locked}
              onToggleLock={toggleLock}
              onReset={resetShares}
              isCustomised={Boolean(customShares[selected]) || locked.length > 0}
              onPrint={printReport}
              onCopySummary={copySummary}
              onAdjust={() => jumpTo(4)}
            />

            <div className="grid gap-4 lg:grid-cols-2">
              <ReadinessCard result={result} />
              <FeasibilityCard answers={answers} result={result} />
              <PhaseScopeCard result={result} />
              <BalanceCard answers={answers} plan={plan} currentShares={currentShares} />
            </div>

            <BreakEvenCard plan={plan} />
            <DetailCards result={result} plan={plan} currentShares={currentShares} />
            <ReviewCta answers={answers} result={result} plan={plan} currentShares={currentShares} />
            <Disclaimer />

            <PrintReport answers={answers} result={result} plan={plan} currentShares={currentShares} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="bg-background border-t border-border py-4 text-center shrink-0">
        <p className="text-xs text-muted-foreground">
          Made with <span className="text-primary">&hearts;</span> by{" "}
          <a
            href="https://www.lvbranding.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-foreground hover:text-primary transition-colors"
          >
            LV Branding
          </a>
        </p>
      </footer>

      {/* ── Start-over confirmation (clearly scoped to this device) ── */}
      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.nav.startOverConfirmTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              This clears your answers and any adjusted allocations from this browser. If you want
              to keep the current plan, copy the summary or print it first; nothing is stored
              anywhere else.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t.nav.cancel}</AlertDialogCancel>
            <AlertDialogAction onClick={startOver}>{t.nav.startOverConfirm}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Category colours as CSS variables so light/dark swap in one place. */}
      <style>{`
        :root { ${CATEGORIES.map((c) => `--cc-${c.key}: ${c.colorLight};`).join(" ")} }
        .dark { ${CATEGORIES.map((c) => `--cc-${c.key}: ${c.colorDark};`).join(" ")} }

        /* Allocation sliders. The track is painted here rather than left to the
           native accent-color, which derives the UNFILLED track from the accent's
           luminance: the lighter category colours (green, orange, amber) produced
           a near-black bar while the darker ones (blue, red, purple) produced a
           light one. Same track for all six, filled portion in category colour.
           --cc-accent and --cc-pct are set per slider in ResultsDashboard. */
        .cc-range {
          --cc-thumb-size: 14px;
          --cc-track-size: 6px;
          /* The thumb centre travels inset by half its width, so the fill has to
             follow it rather than run to a flat percentage of the track. */
          --cc-fill-to: calc(var(--cc-pct, 0) * (100% - var(--cc-thumb-size)) / 100 + var(--cc-thumb-size) / 2);
          -webkit-appearance: none;
          appearance: none;
          background: transparent;
        }
        .cc-range::-webkit-slider-runnable-track {
          height: var(--cc-track-size);
          border-radius: 999px;
          background: linear-gradient(to right,
            var(--cc-accent) 0 var(--cc-fill-to),
            hsl(var(--border)) var(--cc-fill-to) 100%);
        }
        .cc-range::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          height: var(--cc-thumb-size);
          width: var(--cc-thumb-size);
          margin-top: calc((var(--cc-track-size) - var(--cc-thumb-size)) / 2);
          border-radius: 50%;
          background: var(--cc-accent);
          border: 2px solid hsl(var(--background));
          box-shadow: 0 0 0 1px hsl(var(--border));
        }
        /* Firefox fills the track natively, so it gets a plain track plus progress. */
        .cc-range::-moz-range-track {
          height: var(--cc-track-size);
          border-radius: 999px;
          background: hsl(var(--border));
        }
        .cc-range::-moz-range-progress {
          height: var(--cc-track-size);
          border-radius: 999px;
          background: var(--cc-accent);
        }
        .cc-range::-moz-range-thumb {
          height: var(--cc-thumb-size);
          width: var(--cc-thumb-size);
          border-radius: 50%;
          background: var(--cc-accent);
          border: 2px solid hsl(var(--background));
          box-shadow: 0 0 0 1px hsl(var(--border));
        }
        /* appearance:none drops the native focus ring; keyboard users keep one. */
        .cc-range:focus-visible { outline: none; }
        .cc-range:focus-visible::-webkit-slider-thumb {
          box-shadow: 0 0 0 2px hsl(var(--background)), 0 0 0 4px hsl(var(--ring));
        }
        .cc-range:focus-visible::-moz-range-thumb {
          box-shadow: 0 0 0 2px hsl(var(--background)), 0 0 0 4px hsl(var(--ring));
        }
      `}</style>
    </div>
  );
}
