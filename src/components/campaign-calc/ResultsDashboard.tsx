// ── Results dashboard: scenarios, donut, allocation controls ────────────────────
// State lives in the page; this renders the interactive centrepiece. All math
// comes from the engine; this file never computes an allocation itself.

import { useMemo, useState } from "react";
import { AlertTriangle, Copy, Check, HelpCircle, Lock, LockOpen, Printer, RotateCcw, SlidersHorizontal, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CATEGORIES, formatMoney, scenarioMeta } from "@/lib/campaign/config";
import {
  allocationAmounts, displayPercents, planLevers, recommendationSummary,
  scenarioRationale, shareStatus, suggestedRange,
} from "@/lib/campaign/engine";
import type {
  CalculationResult, CalculatorAnswers, CategoryKey, ScenarioKey, Shares,
} from "@/lib/campaign/types";
import AllocationDonut from "./AllocationDonut";
import { StatusBadge } from "./shared";

/** Splices a standalone sentence into the middle of another one. */
const lowerFirst = (s: string) => s.charAt(0).toLowerCase() + s.slice(1);

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
  const [hovered, setHovered] = useState<CategoryKey | null>(null);
  // A clicked donut segment stays highlighted until clicked again; hover wins while it lasts.
  const [pinned, setPinned] = useState<CategoryKey | null>(null);
  const [whyOpen, setWhyOpen] = useState<ScenarioKey | null>(null);
  const [copied, setCopied] = useState(false);

  const active = hovered ?? pinned;
  const plan = result.scenarios[selected];
  const amounts = useMemo(() => allocationAmounts(plan.total, currentShares), [plan.total, currentShares]);
  const pcts = useMemo(() => displayPercents(currentShares), [currentShares]);
  const summary = useMemo(() => recommendationSummary(answers, result), [answers, result]);
  const levers = useMemo(() => planLevers(answers, result), [answers, result]);
  // While a contradiction is open we show the scenarios for comparison but stop
  // short of endorsing one.
  const hasContradiction = result.contradictions.length > 0;

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

      {/* ── Scenario selector (doubles as the scenario comparison) ── */}
      <div role="radiogroup" aria-label="Investment scenario" className="grid gap-2 sm:grid-cols-3">
        {(["essential", "growth", "expansion"] as ScenarioKey[]).map((key) => {
          const meta = scenarioMeta(key);
          const scenario = result.scenarios[key];
          const isSelected = key === selected;
          const isRecommended = key === result.recommendedScenario;
          const isWhyOpen = whyOpen === key;
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
                <div className="flex items-center justify-between gap-2">
                  <p className={cn("text-sm font-bold", isSelected && "text-primary")}>{meta.label}</p>
                  {isRecommended && (
                    hasContradiction ? (
                      <span className="inline-flex items-center gap-1 rounded-full border border-primary/50 px-2 py-0.5 text-[10px] font-semibold text-primary">
                        <AlertTriangle size={9} aria-hidden="true" /> Review assumptions
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                        <Star size={9} aria-hidden="true" /> Recommended
                      </span>
                    )
                  )}
                </div>
                <p className="mt-1 text-lg font-bold tabular-nums">{formatMoney(scenario.total)}</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{meta.tagline} · plans around {scenario.recommendedChannels} channel{scenario.recommendedChannels === 1 ? "" : "s"}</p>
              </button>
              <button
                type="button"
                aria-expanded={isWhyOpen}
                onClick={() => setWhyOpen(isWhyOpen ? null : key)}
                className="flex items-center gap-1 px-4 pb-3 pt-1 text-[11px] font-medium text-muted-foreground hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-b-xl w-fit"
              >
                <HelpCircle size={11} aria-hidden="true" /> Why this amount?
              </button>
              {isWhyOpen && (
                <p className="border-t border-border/60 px-4 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
                  {scenarioRationale(answers, scenario)}
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
          <span className="font-semibold text-foreground">Why this recommendation:</span>{" "}
          {summary}
        </p>
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{levers}</p>
      </div>

      <p className="text-[11px] leading-relaxed text-muted-foreground">
        {scenarioMeta(selected).description}{" "}
        <span className="text-muted-foreground/80">{scenarioMeta(selected).limitations}</span>
      </p>

      {/* ── Donut + controls ── */}
      <div className="grid items-start gap-6 rounded-xl border border-border bg-card p-4 sm:p-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        <div className="space-y-4">
          <AllocationDonut
            shares={currentShares}
            amounts={amounts}
            pcts={pcts}
            total={plan.total}
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
                <caption className="sr-only">Allocation of the selected scenario by category</caption>
                <thead>
                  <tr className="border-b border-border text-left text-[10px] uppercase tracking-wide text-muted-foreground">
                    <th scope="col" className="py-1.5 pr-2 font-semibold">Category</th>
                    <th scope="col" className="py-1.5 pr-2 text-right font-semibold">Amount</th>
                    <th scope="col" className="py-1.5 text-right font-semibold">Share</th>
                  </tr>
                </thead>
                <tbody>
                  {CATEGORIES.map((cat) => (
                    <tr key={cat.key} className="border-b border-border/50 last:border-0">
                      <th scope="row" className="py-1.5 pr-2 text-left font-medium">{cat.label}</th>
                      <td className="py-1.5 pr-2 text-right tabular-nums">{formatMoney(amounts[cat.key])}</td>
                      <td className="py-1.5 text-right tabular-nums">{pcts[cat.key]}%</td>
                    </tr>
                  ))}
                  <tr>
                    <th scope="row" className="py-1.5 pr-2 text-left font-bold">Total</th>
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
              Adjust the allocation
            </p>
            <Button
              variant="ghost" size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
              onClick={onReset}
              disabled={!isCustomised}
            >
              <RotateCcw size={12} /> Reset to recommendation
            </Button>
          </div>

          {CATEGORIES.map((cat) => {
            const share = currentShares[cat.key];
            const pct = pcts[cat.key];
            const rec = plan.shares[cat.key];
            const [rangeLo, rangeHi] = suggestedRange(cat.key, rec);
            const status = shareStatus(share, rec);
            const isLocked = locked.includes(cat.key);
            const isActive = active === cat.key;
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
                    min={1} max={80} step={1}
                    value={pct}
                    disabled={isLocked}
                    aria-label={`${cat.label} share of the budget`}
                    aria-valuetext={`${pct} percent, ${formatMoney(amounts[cat.key])}`}
                    onChange={(e) => onSharesChange(cat.key, Number(e.target.value) / 100)}
                    onFocus={() => setHovered(cat.key)}
                    onBlur={() => setHovered(null)}
                    style={{ accentColor: `var(--cc-${cat.key})` }}
                    className="h-6 min-w-0 flex-1 cursor-pointer disabled:cursor-not-allowed disabled:opacity-40"
                  />
                  <span className="w-24 shrink-0 text-right text-xs font-semibold tabular-nums">
                    {formatMoney(amounts[cat.key])}
                  </span>
                  <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">{pct}%</span>
                </div>
                <p className="pl-5 text-[10px] text-muted-foreground/80">
                  Suggested for you: {rangeLo}–{rangeHi}%
                </p>
              </div>
            );
          })}
          <p className="pl-2 pt-1 text-[11px] leading-relaxed text-muted-foreground">
            Raising one category rebalances the unlocked ones proportionally, so the plan always
            totals 100%. Lock anything you've decided on first.
          </p>
        </div>
      </div>

      {/* ── Actions ── */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={onPrint}>
          <Printer size={13} /> Print / save as PDF
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={copy}>
          {copied ? <><Check size={13} className="text-primary" /> Copied</> : <><Copy size={13} /> Copy summary</>}
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5 text-xs" onClick={onAdjust}>
          <SlidersHorizontal size={13} /> Adjust assumptions
        </Button>
      </div>

    </div>
  );
}
