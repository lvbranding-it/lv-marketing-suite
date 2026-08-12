// ── Results dashboard: scenarios, donut, allocation controls ────────────────────
// State lives in the page; this renders the interactive centrepiece. All math
// comes from the engine; this file never computes an allocation itself.

import { useMemo, useState, type CSSProperties } from "react";
import { AlertTriangle, CheckCircle2, Copy, Check, HelpCircle, Lock, LockOpen, Printer, RotateCcw, SlidersHorizontal, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CATEGORIES, formatMoney, scenarioMeta } from "@/lib/campaign/config";
import {
  allocationAmounts, displayPercents, feasibilityNarrative, feasibilityPaths,
  planLevers, protectedFloorShare, recommendationSummary, scenarioRationale,
  shareStatus,
} from "@/lib/campaign/engine";
import { SCOPE_LEVERS, formatRange } from "@/lib/campaign/config";
import type {
  CalculationResult, CalculatorAnswers, CategoryKey, ScenarioKey, Shares,
} from "@/lib/campaign/types";
import { useCalcCopy, useCalcLang } from "./lang";
import {
  categories as localCategories, scenario as localScenario, scenarios as localScenarios,
  scopeLevers,
} from "@/lib/campaign/localized";
import AllocationDonut from "./AllocationDonut";
import { StatusBadge } from "./shared";

/** Splices a standalone sentence into the middle of another one. */
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

/** No single category may be dragged past this share of the budget. */
const SLIDER_MAX = 80;

interface ResultsDashboardProps {
  answers:        CalculatorAnswers;
  result:         CalculationResult;
  selected:       ScenarioKey;
  onSelect:       (key: ScenarioKey) => void;
  currentShares:  Shares;
  onSharesChange: (key: CategoryKey, nextShare: number) => void;
  locked:         CategoryKey[];
  onToggleLock:   (key: CategoryKey) => void;
  onReset:        () => void;
  isCustomised:   boolean;
  onPrint:        () => void;
  onCopySummary:  () => Promise<boolean>;
  onAdjust:       () => void;
}

export default function ResultsDashboard({
  answers, result, selected, onSelect, currentShares, onSharesChange,
  locked, onToggleLock, onReset, isCustomised, onPrint, onCopySummary, onAdjust,
}: ResultsDashboardProps) {
  const t = useCalcCopy();
  const lang = useCalcLang();
  const [hovered, setHovered] = useState<CategoryKey | null>(null);
  // A clicked donut segment stays highlighted until clicked again; hover wins while it lasts.
  const [pinned, setPinned] = useState<CategoryKey | null>(null);
  const [whyOpen, setWhyOpen] = useState<ScenarioKey | null>(null);
  const [copied, setCopied] = useState(false);

  const active = hovered ?? pinned;
  const plan = result.scenarios[selected];
  // The six categories are allocated from the total MINUS the reserve, so the
  // displayed identity P + M + R = I holds exactly.
  const allocatable = plan.total - plan.reserveAmount;
  const amounts = useMemo(() => allocationAmounts(allocatable, currentShares), [allocatable, currentShares]);
  const pcts = useMemo(() => displayPercents(currentShares), [currentShares]);
  const summary = useMemo(() => recommendationSummary(answers, result, lang), [answers, result]);
  const protectedAmount = useMemo(
    () => (["strategy", "creative", "digital", "management", "testing"] as CategoryKey[])
      .reduce((t, k) => t + amounts[k], 0),
    [amounts],
  );
  const levers = useMemo(() => planLevers(answers, result, lang), [answers, result]);
  /*
   * An amount is only called "protected" when the displayed plan actually funds
   * that minimum. Labelling a smaller allocation as protected would claim work
   * the phase cannot deliver.
   */
  const fundsProtectedMinimum = protectedAmount >= plan.requirements.protectedTotal.min - 1;
  // While a contradiction is open we show the scenarios for comparison but stop
  // short of endorsing one.
  const hasContradiction = result.contradictions.length > 0;

  const isConstrained = result.budgetConstrained;
  const showFeasibility = result.feasibility.applies;
  const fitCopy = useMemo(() => feasibilityNarrative(answers, result.feasibility, lang), [answers, result.feasibility]);
  const paths = useMemo(() => feasibilityPaths(answers, result.feasibility, lang), [answers, result.feasibility]);

  const copy = async () => {
    const ok = await onCopySummary();
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-4">
      {/* A contradiction we can already see makes any recommendation misleading. */}
      {hasContradiction && (
        <div role="status" className="rounded-xl border border-primary/40 bg-accent/50 px-4 py-3">
          <p className="flex items-start gap-2 text-xs leading-relaxed">
            <AlertTriangle size={14} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
            <span>
              <span className="font-semibold text-foreground">Your plan contains an assumption that needs review.</span>{" "}
              The investment scenarios are available for comparison, but{" "}
              {result.contradictions.length === 1
                ? lowerFirst(result.contradictions[0].text)
                : "several answers conflict with each other."}
            </span>
          </p>
        </div>
      )}

      {/* Allocation and feasibility are different questions. When the stated
          budget can't fund the scope, say so before showing any allocation. */}
      {showFeasibility && (
        <div className={cn(
          "rounded-xl border px-4 py-3.5",
          isConstrained ? "border-primary/40 bg-accent/40" : "border-border bg-muted/40",
        )}>
          <div className="flex items-start gap-2">
            {isConstrained
              ? <AlertTriangle size={15} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
              : <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />}
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{fitCopy.headline}</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{fitCopy.detail}</p>

              {paths.length > 0 && (
                <div className="mt-3 grid gap-2 sm:grid-cols-3">
                  {paths.map((path) => (
                    <div key={path.id} className="rounded-lg border border-border bg-background p-3">
                      <p className="text-xs font-semibold">{path.title}</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{path.text}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── Scenario selector (doubles as the scenario comparison) ── */}
      <div role="radiogroup" aria-label="Investment scenario" className="grid gap-2 sm:grid-cols-3">
        {(["essential", "growth", "expansion"] as ScenarioKey[]).map((key) => {
          const meta = localScenario(key, lang);
          const scenario = result.scenarios[key];
          const isSelected = key === selected;
          const isRecommended = key === result.recommendedScenario;
          const isWhyOpen = whyOpen === key;
          // Under a constrained budget the affordable plan is a reduced-scope
          // pilot, and the larger ones are priced at what the scope really costs.
          const isAffordablePlan = isConstrained && key === "essential";
          const label = isAffordablePlan
            ? (scenario.isPreparationPhase ? t.results.preparationPhase : t.results.focusedPilot)
            : meta.label;
          // Estimates are ranges; only the plan the budget actually funds is exact.
          const showRange = !isAffordablePlan && scenario.totalRange.max > scenario.totalRange.min;
          const extraNeeded = isConstrained && !isAffordablePlan
            ? Math.max(0, scenario.totalRange.min - result.feasibility.available)
            : 0;
          return (
            /* The card is a div so the "Why this amount?" toggle isn't nested
               inside the radio button (interactive-in-interactive is invalid). */
            <div
              key={key}
              className={cn(
                "flex flex-col rounded-xl border transition-colors",
                isSelected ? "border-primary bg-accent/60 shadow-sm" : "border-border bg-card hover:border-muted-foreground/40",
              )}
            >
              <button
                type="button"
                role="radio"
                aria-checked={isSelected}
                onClick={() => onSelect(key)}
                className="flex-1 rounded-t-xl p-4 pb-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className="flex flex-wrap items-center justify-between gap-1.5">
                  <p className={cn("text-sm font-bold", isSelected && "text-primary")}>{label}</p>
                  {isRecommended && (
                    hasContradiction ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-primary/50 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        <AlertTriangle size={9} aria-hidden="true" /> Review assumptions
                      </span>
                    ) : isAffordablePlan ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                        <Star size={9} aria-hidden="true" /> {t.results.bestFitBadge}
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                        <Star size={9} aria-hidden="true" /> {t.results.recommended}
                      </span>
                    )
                  )}
                  {extraNeeded > 0 && (
                    <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      Needs {formatMoney(extraNeeded)}+ more
                    </span>
                  )}
                </div>
                <p className="mt-1 text-lg font-bold tabular-nums">
                  {showRange ? formatRange(scenario.totalRange, "USD", lang) : formatMoney(scenario.total)}
                </p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                  {scenario.isPreparationPhase
                    ? t.results.prepSprintTagline
                    : isAffordablePlan
                      ? (scenario.recommendedChannels === 0
                          ? t.results.noMediaActivation
                          : t.results.reducedScope(scenario.recommendedChannels))
                      /* Growth and Expansion are estimates of their own scope, so
                         they describe the channels that scope funds. */
                      : t.results.scopeChannels(meta.tagline, scenario.requirements.activeChannels.length)}
                </p>
                {isAffordablePlan && (
                  <p className="mt-1 text-[11px] leading-relaxed text-primary">
                    {scenario.isPreparationPhase
                      ? t.results.prepOnlyNote
                      : t.results.reducedScopeNote(result.feasibility.selectedChannels)}
                  </p>
                )}
              </button>
              <button
                type="button"
                aria-expanded={isWhyOpen}
                onClick={() => setWhyOpen(isWhyOpen ? null : key)}
                className="flex items-center gap-1 px-4 pb-3 pt-1 text-[11px] font-medium text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-b-xl w-fit"
              >
                <HelpCircle size={11} aria-hidden="true" /> {t.results.whyThisAmount}
              </button>
              {isWhyOpen && (
                <p className="border-t border-border/60 px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
                  {scenarioRationale(answers, scenario, lang)}
                </p>
              )}
            </div>
          );
        })}
      </div>

      {/* Why this recommendation: ties the numbers back to the user's answers,
          then names the levers so a large total reads as a decision, not a price. */}
      <div className="rounded-xl border border-border bg-muted/40 px-4 py-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          <span className="font-semibold text-foreground">{t.results.whySuggest}</span>{" "}
          {summary}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{levers}</p>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {localScenario(selected, lang).description}{" "}
        <span className="text-muted-foreground/80">{localScenario(selected, lang).limitations}</span>
      </p>

      {/* The central distinction: media buys distribution; the protected
          investment creates, operates, measures, and improves what is distributed. */}
      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {fundsProtectedMinimum ? t.results.protectedInvestment : t.results.currentPhaseAllocation}
          </p>
          <p className="mt-1 text-lg font-bold tabular-nums">{formatMoney(protectedAmount)}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {fundsProtectedMinimum
              ? t.results.protectedBlurb
              : t.results.belowMinimumBlurb(t.formatRange(plan.requirements.protectedTotal, formatMoney))}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{t.results.mediaDistribution}</p>
          <p className="mt-1 text-lg font-bold tabular-nums">{formatMoney(amounts.media)}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {t.results.mediaBlurb}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-4">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{t.results.campaignReserve}</p>
          <p className="mt-1 text-lg font-bold tabular-nums">{formatMoney(plan.reserveAmount)}</p>
          <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
            {t.results.reserveBlurb}
          </p>
        </div>
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {t.results.identity({
          protectedAmount: formatMoney(protectedAmount),
          media: formatMoney(amounts.media),
          reserve: formatMoney(plan.reserveAmount),
          total: formatMoney(plan.total),
          funded: fundsProtectedMinimum,
        })}
      </p>

      {/* ── Donut + controls ── */}
      <div className="grid items-start gap-6 rounded-xl border border-border bg-card p-4 sm:p-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="space-y-4">
          <AllocationDonut
            shares={currentShares}
            amounts={amounts}
            pcts={pcts}
            total={allocatable}
            totalLabel={plan.reserveAmount > 0 ? t.results.campaignAllocation : t.results.totalInvestment}
            active={active}
            pinned={pinned}
            onHover={setHovered}
            onTogglePin={(key) => setPinned((p) => (p === key ? null : key))}
          />

          {/* Accessible text/table alternative: always available, not hover-dependent */}
          <details className="rounded-lg border border-border">
            <summary className="cursor-pointer select-none px-3 py-2 text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-lg">
              View allocation as a table
            </summary>
            <div className="overflow-x-auto px-3 pb-3">
              <table className="w-full text-xs">
                <caption className="sr-only">{t.results.tableCaption}</caption>
                <thead>
                  <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="py-1.5 pr-2 font-semibold">{t.results.category}</th>
                    <th scope="col" className="py-1.5 pr-2 text-right font-semibold">{t.results.amount}</th>
                    <th scope="col" className="py-1.5 text-right font-semibold">{t.results.share}</th>
                  </tr>
                </thead>
                <tbody>
                  {localCategories(lang).map((cat) => (
                    <tr key={cat.key} className="border-b border-border/50 last:border-0">
                      <th scope="row" className="py-1.5 pr-2 text-left font-medium">{cat.label}</th>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{formatMoney(amounts[cat.key])}</td>
                      <td className="py-1.5 text-right tabular-nums">{pcts[cat.key]}%</td>
                    </tr>
                  ))}
                  {plan.reserveAmount > 0 && (
                    <tr className="border-b border-border/50">
                      <th scope="row" className="py-1.5 pr-2 text-left font-medium">{t.results.campaignReserve}</th>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{formatMoney(plan.reserveAmount)}</td>
                      <td className="py-1.5 text-right tabular-nums text-muted-foreground">held separately</td>
                    </tr>
                  )}
                  <tr>
                    <th scope="row" className="py-1.5 pr-2 text-left font-bold">{t.results.totalInvestment}</th>
                    <td className="py-1.5 pr-2 text-right font-bold tabular-nums">{formatMoney(plan.total)}</td>
                    <td className="py-1.5 text-right font-bold tabular-nums">100%</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </details>
        </div>

        {/* Allocation controls: connected legend + adjusters */}
        <div className="space-y-1">
          <div className="mb-2 flex items-center justify-between gap-2">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              {t.results.adjustAllocation}
            </p>
            <Button
              variant="ghost" size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
              onClick={onReset}
              disabled={!isCustomised}
            >
              <RotateCcw size={12} /> {t.results.resetAllocation}
            </Button>
          </div>

          {localCategories(lang).map((cat) => {
            const share = currentShares[cat.key];
            const pct = pcts[cat.key];
            const rec = plan.shares[cat.key];
            // The protected-allocation rule: X_i >= P_i. Media is the one line
            // that may be reduced freely, because reach is recalculated with it.
            const floorShare = protectedFloorShare(cat.key, plan.requirements, plan.total);
            const floorPct = Math.ceil(floorShare * 100);
            const floorAmount = plan.requirements.floors[cat.key].min;
            // Only warn when a FUNDED category has been pulled down to its floor. A
            // deferred category at zero is already explained by its label.
            const atFloor = cat.key !== "media" && amounts[cat.key] > 0 && pct <= floorPct;
            const status = shareStatus(share, rec);
            const isLocked = locked.includes(cat.key);
            const isActive = active === cat.key;
            // The track is painted by .cc-range, so the filled portion has to be
            // measured against this slider's own range rather than against 100.
            const sliderMin = cat.key === "media" ? 0 : Math.max(1, floorPct);
            const fillPct = sliderMin < SLIDER_MAX
              ? Math.min(100, Math.max(0, ((pct - sliderMin) / (SLIDER_MAX - sliderMin)) * 100))
              : 100;
            return (
              <div
                key={cat.key}
                className={cn(
                  "rounded-lg px-2 py-2 transition-colors",
                  isActive && "bg-muted/60",
                  pinned === cat.key && "ring-1 ring-inset ring-border",
                )}
                onMouseEnter={() => setHovered(cat.key)}
                onMouseLeave={() => setHovered(null)}
              >
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-sm" style={{ background: `var(--cc-${cat.key})` }} />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{cat.label}</span>
                  {/* Only deviations earn a badge; six identical "Balanced" chips said nothing. */}
                  {status !== "balanced" && <StatusBadge status={status} />}
                  <button
                    type="button"
                    aria-pressed={isLocked}
                    aria-label={isLocked ? `Unlock ${cat.label}` : `Lock ${cat.label} so rebalancing doesn't change it`}
                    title={isLocked ? "Unlock" : "Lock before rebalancing others"}
                    onClick={() => onToggleLock(cat.key)}
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      isLocked ? "text-primary" : "text-muted-foreground/50 hover:text-muted-foreground",
                    )}
                  >
                    {isLocked ? <Lock size={13} /> : <LockOpen size={13} />}
                  </button>
                </div>
                <div className="mt-1 flex items-center gap-3 pl-5">
                  <input
                    type="range"
                    min={sliderMin} max={SLIDER_MAX} step={1}
                    value={pct}
                    disabled={isLocked}
                    aria-label={`${cat.label} share of the budget`}
                    aria-valuetext={`${pct} percent, ${formatMoney(amounts[cat.key])}`}
                    onChange={(e) => onSharesChange(cat.key, Number(e.target.value) / 100)}
                    onFocus={() => setHovered(cat.key)}
                    onBlur={() => setHovered(null)}
                    style={{
                      "--cc-accent": `var(--cc-${cat.key})`,
                      "--cc-pct": fillPct.toFixed(2),
                    } as CSSProperties}
                    className="cc-range h-6 min-w-0 flex-1 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                  />
                  <span className="w-24 shrink-0 text-right text-xs font-semibold tabular-nums">
                    {formatMoney(amounts[cat.key])}
                  </span>
                  <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{pct}%</span>
                </div>
                <p className="pl-5 text-[10px] text-muted-foreground/80">
                  {/* A minimum above the current allocation is always qualified,
                      so it can never read as work this phase will deliver. */}
                  {cat.key === "media"
                    ? t.results.mediaAdjustable
                    : amounts[cat.key] === 0
                      ? t.results.floorDeferred(formatMoney(floorAmount))
                      : amounts[cat.key] < floorAmount
                        ? t.results.floorPartial(formatMoney(floorAmount))
                        : t.results.floorPlain(formatMoney(floorAmount))}
                </p>
                {atFloor && (
                  <p className="mt-1 pl-5 text-[10px] leading-relaxed text-primary">
                    {t.results.floorProtected}
                  </p>
                )}
              </div>
            );
          })}
          <p className="pl-2 pt-1 text-[11px] leading-relaxed text-muted-foreground">
            {t.results.rebalanceNote}
          </p>
          <details className="mt-1 pl-2">
            <summary className="cursor-pointer select-none text-[11px] font-medium text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
              {t.results.scopeLeversTitle}
            </summary>
            <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
              {scopeLevers(lang).map((lever) => <li key={lever}>{lever}</li>)}
            </ul>
          </details>
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={onPrint}>
          <Printer size={13} /> Print / save as PDF
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={copy}>
          {copied ? <><Check size={13} className="text-primary" /> Copied</> : <><Copy size={13} /> {t.results.copySummary}</>}
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={onAdjust}>
          <SlidersHorizontal size={13} /> Adjust assumptions
        </Button>
      </div>

    </div>
  );
}
