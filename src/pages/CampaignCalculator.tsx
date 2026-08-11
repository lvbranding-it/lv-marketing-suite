// ── Campaign Investment Calculator: page orchestration ─────────────────────────
// Public tool (no auth) following the same shell as /qr-generator and
// /email-signature-generator. State machine: intro → 6 guided steps → results.
// Progress persists to localStorage; the engine in src/lib/campaign does the math.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, Calculator, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import LVLogo from "@/components/LVLogo";
import { useToast } from "@/hooks/use-toast";
import { CATEGORIES } from "@/lib/campaign/config";
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
  BalanceCard, BreakEvenCard, DetailCards, Disclaimer, PrintReport,
  FeasibilityCard, ReadinessCard, ReviewCta,
} from "@/components/campaign-calc/ResultsInsights";

type Phase = "intro" | "steps" | "results";

const PAGE_TITLE = "Campaign Investment Calculator | LV Branding";
const PAGE_DESCRIPTION =
  "Estimate how to distribute your campaign investment across strategy, branding, creative production, digital experience, paid media, management, and testing.";

function usePageMetadata() {
  useEffect(() => {
    const previousTitle = document.title;
    document.title = PAGE_TITLE;
    let meta = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    const created = !meta;
    if (!meta) {
      meta = document.createElement("meta");
      meta.name = "description";
      document.head.appendChild(meta);
    }
    const previousDescription = meta.content;
    meta.content = PAGE_DESCRIPTION;
    return () => {
      document.title = previousTitle;
      if (created) meta?.remove();
      else if (meta) meta.content = previousDescription;
    };
  }, []);
}

export default function CampaignCalculator() {
  usePageMetadata();
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
  const result = useMemo(() => (phase === "results" ? calculate(answers) : null), [phase, answers]);
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
      await navigator.clipboard.writeText(buildTextSummary(answers, plan, currentShares, result.readiness));
      return true;
    } catch {
      toast({ title: "Copy failed", description: "Your browser blocked clipboard access." });
      return false;
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
            <h1 className="text-base font-bold text-foreground">Campaign Investment Calculator</h1>
            <p className="text-xs text-muted-foreground">A free planning tool by LV Branding</p>
          </div>
        </div>
        {phase !== "intro" && (
          <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setConfirmReset(true)}>
            <RefreshCw size={13} /> Start over
          </Button>
        )}
      </header>

      <main className="flex-1 w-full max-w-5xl mx-auto p-3 sm:p-6">
        {/* ── Intro ── */}
        {phase === "intro" && (
          <div className="mx-auto max-w-2xl py-8 sm:py-16 text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
              <Calculator size={26} aria-hidden="true" />
            </div>
            <h2 className="text-2xl font-bold leading-tight sm:text-3xl">
              Know what your campaign really requires.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground">
              Build a practical investment plan across strategy, branding, creative production,
              paid media, and campaign management based on your goals, market, and business readiness.
            </p>
            <p className="mx-auto mt-3 max-w-xl text-sm font-medium leading-relaxed">
              Media amplifies what already exists. A strong campaign must fund both the message
              and its distribution.
            </p>
            <Button size="lg" className="mt-7 gap-2" onClick={() => { setPhase("steps"); setStep(0); }}>
              Calculate My Investment <ArrowRight size={16} aria-hidden="true" />
            </Button>
            <p className="mt-4 text-[11px] text-muted-foreground">
              Six short steps · about 3 minutes · no account, no email gate
            </p>
            {restored.current && restored.current.phase !== "intro" && (
              <p className="mt-6 text-xs text-muted-foreground">
                You have a plan in progress.{" "}
                <button
                  type="button"
                  className="font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                  onClick={() => { setPhase(restored.current?.phase === "results" ? "results" : "steps"); setStep(restored.current?.step ?? 0); setMaxVisited(restored.current?.step ?? 0); }}
                >
                  pick up where you left off
                </button>.
              </p>
            )}
          </div>
        )}

        {/* ── Guided steps ── */}
        {phase === "steps" && (
          <div className="mx-auto max-w-3xl space-y-5">
            <StepProgress steps={STEP_LABELS} current={step} maxVisited={maxVisited} onJump={jumpTo} />
            <section aria-label={`Step ${step + 1}: ${STEP_LABELS[step]}`} className="rounded-xl border border-border bg-card p-4 sm:p-6">
              <h2 className="mb-5 text-base font-bold">
                {[
                  "Tell us about the business",
                  "What should this campaign achieve?",
                  "Shape the campaign",
                  "What is ready for this campaign?",
                  "How would you like to plan your investment?",
                  "Review your answers",
                ][step]}
              </h2>
              {stepView}
            </section>
            <div className="flex items-center justify-between gap-3 pb-8">
              <Button variant="outline" className="gap-1.5" onClick={goBack}>
                <ArrowLeft size={15} aria-hidden="true" /> Back
              </Button>
              <Button className="gap-1.5" onClick={goNext}>
                {step === STEP_LABELS.length - 1 ? "Build My Investment Plan" : "Continue"}
                <ArrowRight size={15} aria-hidden="true" />
              </Button>
            </div>
          </div>
        )}

        {/* ── Results ── */}
        {phase === "results" && result && plan && currentShares && (
          <div className="space-y-5 pb-10">
            <div>
              <h2 className="text-xl font-bold sm:text-2xl">Your Campaign Investment Plan</h2>
              <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-muted-foreground">
                Based on your goals and current campaign readiness, we created three potential
                investment scenarios. These estimates are intended to support planning and do not
                guarantee campaign performance.
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
              onPrint={() => window.print()}
              onCopySummary={copySummary}
              onAdjust={() => jumpTo(4)}
            />

            <div className="grid gap-4 lg:grid-cols-2">
              <ReadinessCard result={result} />
              <FeasibilityCard answers={answers} result={result} />
              <BalanceCard answers={answers} plan={plan} currentShares={currentShares} />
            </div>

            <BreakEvenCard plan={plan} />
            <DetailCards result={result} plan={plan} currentShares={currentShares} />
            <ReviewCta />
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
            <AlertDialogTitle>Start over?</AlertDialogTitle>
            <AlertDialogDescription>
              This clears your answers and any adjusted allocations from this browser. If you want
              to keep the current plan, copy the summary or print it first; nothing is stored
              anywhere else.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep my plan</AlertDialogCancel>
            <AlertDialogAction onClick={startOver}>Start over</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Category colours as CSS variables so light/dark swap in one place. */}
      <style>{`
        :root { ${CATEGORIES.map((c) => `--cc-${c.key}: ${c.colorLight};`).join(" ")} }
        .dark { ${CATEGORIES.map((c) => `--cc-${c.key}: ${c.colorDark};`).join(" ")} }
      `}</style>
    </div>
  );
}
