// ── Results dashboard: scenarios, donut, allocation controls ────────────────────
// State lives in the page; this renders the interactive centrepiece. All math
// comes from the engine; this file never computes an allocation itself.

import { useMemo, useState } from "react";
import { Copy, Check, Lock, LockOpen, Printer, RotateCcw, SlidersHorizontal, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CATEGORIES, formatMoney, scenarioMeta } from "@/lib/campaign/config";
import {
  allocationAmounts, displayPercents, shareStatus, suggestedRange,
} from "@/lib/campaign/engine";
import type {
  CalculationResult, CategoryKey, ScenarioKey, Shares,
} from "@/lib/campaign/types";
import AllocationDonut from "./AllocationDonut";
import { StatusBadge } from "./shared";

interface ResultsDashboardProps {
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
  result, selected, onSelect, currentShares, onSharesChange,
  locked, onToggleLock, onReset, isCustomised, onPrint, onCopySummary, onAdjust,
}: ResultsDashboardProps) {
  const [active, setActive] = useState<CategoryKey | null>(null);
  const [copied, setCopied] = useState(false);

  const plan = result.scenarios[selected];
  const amounts = useMemo(() => allocationAmounts(plan.total, currentShares), [plan.total, currentShares]);
  const pcts = useMemo(() => displayPercents(currentShares), [currentShares]);

  const copy = async () => {
    const ok = await onCopySummary();
    if (ok) {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <div className="space-y-4">
      {/* ── Scenario selector (doubles as the scenario comparison) ── */}
      <div role="radiogroup" aria-label="Investment scenario" className="grid gap-2 sm:grid-cols-3">
        {(["essential", "growth", "expansion"] as ScenarioKey[]).map((key) => {
          const meta = scenarioMeta(key);
          const scenario = result.scenarios[key];
          const isSelected = key === selected;
          const isRecommended = key === result.recommendedScenario;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => onSelect(key)}
              className={cn(
                "rounded-xl border p-4 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                isSelected ? "border-primary bg-accent/60 shadow-sm" : "border-border bg-card hover:border-muted-foreground/40",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className={cn("text-sm font-bold", isSelected && "text-primary")}>{meta.label}</p>
                {isRecommended && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary px-2 py-0.5 text-[10px] font-semibold text-primary-foreground">
                    <Star size={9} aria-hidden="true" /> Recommended
                  </span>
                )}
              </div>
              <p className="mt-1 text-lg font-bold tabular-nums">{formatMoney(scenario.total)}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{meta.tagline} · plans around {scenario.recommendedChannels} channel{scenario.recommendedChannels === 1 ? "" : "s"}</p>
            </button>
          );
        })}
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
            onActiveChange={setActive}
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
                className={cn("rounded-lg px-2 py-2 transition-colors", isActive && "bg-muted/60")}
                onMouseEnter={() => setActive(cat.key)}
                onMouseLeave={() => setActive(null)}
              >
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className="h-3 w-3 shrink-0 rounded-sm" style={{ background: `var(--cc-${cat.key})` }} />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">{cat.label}</span>
                  <StatusBadge status={status} />
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
                    onFocus={() => setActive(cat.key)}
                    onBlur={() => setActive(null)}
                    className="h-6 min-w-0 flex-1 cursor-pointer accent-primary disabled:cursor-not-allowed disabled:opacity-40"
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
