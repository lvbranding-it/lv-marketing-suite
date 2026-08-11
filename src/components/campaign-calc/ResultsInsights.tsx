// ── Results insights: readiness, balance, break-even, detail cards, report ──────
// Everything here is a read-only view over engine output. The print report at
// the bottom reuses the app's existing `.print-only` print CSS from index.css.

import { AlertCircle, ArrowRight, Info } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  CATEGORIES, DESTINATIONS, LEAN_SCOPE_ASSUMPTIONS, PREPARATION_PHASE,
  READINESS_BANDS, SEPARATE_SCOPE_ADDITIONS, feasibilityBand, formatMoney,
  formatRange, objectiveMeta, readinessItemMeta, scenarioMeta,
  type FeasibilityStatus,
} from "@/lib/campaign/config";
import {
  allocationAmounts, balanceNotes, displayPercents, feasibilityNarrative,
  readinessNarrative,
} from "@/lib/campaign/engine";
import type {
  BalanceNote, CalculationResult, CalculatorAnswers, ScenarioPlan, Shares,
} from "@/lib/campaign/types";

// ── Campaign readiness ──────────────────────────────────────────────────────────

export function ReadinessCard({ result }: { result: CalculationResult }) {
  const { score, band, essentialReady, essentialTotal, needsReview } = result.readiness;
  const bandMeta = READINESS_BANDS.find((b) => b.band === band) ?? READINESS_BANDS[READINESS_BANDS.length - 1];
  const narrative = readinessNarrative(result.readiness);

  return (
    <section aria-labelledby="readiness-h" className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="readiness-h" className="text-sm font-semibold">Campaign readiness</h3>
        <p className="text-sm font-bold tabular-nums">
          {score}<span className="text-muted-foreground">/100</span>
          <span className="ml-2 text-xs font-semibold text-primary">{bandMeta.label}</span>
        </p>
      </div>

      {/* Meter with band markers; the value is also stated in text above. */}
      <div
        role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score}
        aria-label={`Campaign readiness score: ${score} out of 100, ${bandMeta.label}`}
        className="relative mt-3 h-2.5 overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${score}%` }}
        />
        {[40, 65, 85].map((mark) => (
          <span key={mark} aria-hidden="true" className="absolute top-0 h-full w-px bg-background/80" style={{ left: `${mark}%` }} />
        ))}
      </div>
      <div aria-hidden="true" className="mt-1 flex justify-between text-[9px] uppercase tracking-wide text-muted-foreground/70">
        <span>Foundation</span><span>Partial</span><span>Ready</span><span>Scale</span>
      </div>

      <p className="mt-3 text-xs font-medium">
        {essentialReady} of {essentialTotal} essential component{essentialTotal === 1 ? "" : "s"} {essentialTotal === 1 ? "is" : "are"} ready
        {needsReview > 0 && (
          <span className="font-normal text-muted-foreground"> · {needsReview} additional component{needsReview === 1 ? "" : "s"} require{needsReview === 1 ? "s" : ""} review</span>
        )}
      </p>
      <p className="mt-2 text-xs leading-relaxed text-muted-foreground">{narrative}</p>
      <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
        Only the components this campaign actually needs are scored. This isn't a judgment of the
        business; it's what keeps media spend from outrunning the message.
      </p>
    </section>
  );
}

// ── Budget and scope fit ────────────────────────────────────────────────────────

/**
 * Deliberately separate from Campaign readiness. Readiness measures whether the
 * materials exist; this measures whether the money, time, channels, and reach
 * line up. It reports the available investment against BOTH the lean
 * professional minimum and the complete selected scope, because conflating them
 * is what made an insufficient budget look sufficient.
 */
export function FeasibilityCard({
  answers, result,
}: { answers: CalculatorAnswers; result: CalculationResult }) {
  const fit = result.feasibility;
  if (!fit.applies) return null;

  const band = feasibilityBand(fit.status);
  const order: FeasibilityStatus[] =
    ["preparation-only", "campaign-preparation", "focused-pilot", "scope-supported"];
  const activeIndex = order.indexOf(fit.status);
  const detail = feasibilityNarrative(answers, fit).detail;

  return (
    <section aria-labelledby="fit-h" className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="fit-h" className="text-sm font-semibold">Budget and scope fit</h3>
        <p className="text-sm font-bold tabular-nums">
          {fit.score}<span className="text-muted-foreground">/100</span>
          <span className="ml-2 text-xs font-semibold text-primary">{band.label}</span>
        </p>
      </div>

      {/* Four discrete states, labelled in text as well as position. */}
      <div className="mt-3 flex gap-1" role="img" aria-label={`Budget and scope fit: ${band.label}`}>
        {order.map((status, i) => (
          <span
            key={status}
            className={cn("h-2 flex-1 rounded-full", i <= activeIndex ? "bg-primary" : "bg-muted")}
          />
        ))}
      </div>
      <div aria-hidden="true" className="mt-1 flex justify-between text-[9px] uppercase tracking-wide text-muted-foreground/70">
        <span>Preparation</span><span>Foundation</span><span>Pilot</span><span>Full scope</span>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{detail}</p>

      {/* The figures the spec requires to be shown separately, never merged. */}
      <dl className="mt-3 space-y-2 border-t border-border pt-3">
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[11px] text-muted-foreground">Available investment</dt>
          <dd className="text-xs font-bold tabular-nums">{formatMoney(fit.available)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[11px] text-muted-foreground">Lean professional minimum</dt>
          <dd className="text-xs font-bold tabular-nums">{formatRange(fit.minimumViable.total)}</dd>
        </div>
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[11px] text-muted-foreground">Complete selected scope</dt>
          <dd className="text-xs font-bold tabular-nums">{formatRange(fit.completeScope.total)}</dd>
        </div>
        {fit.minimumFundingGap.max > 0 && (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[11px] text-muted-foreground">Minimum funding gap</dt>
            <dd className="text-xs font-bold tabular-nums text-primary">{formatRange(fit.minimumFundingGap)}</dd>
          </div>
        )}
        {fit.completeScopeFundingGap.max > 0 && (
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-[11px] text-muted-foreground">Complete-scope funding gap</dt>
            <dd className="text-xs font-bold tabular-nums">{formatRange(fit.completeScopeFundingGap)}</dd>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-3">
          <dt className="text-[11px] text-muted-foreground">Media available after protected requirements</dt>
          <dd className="text-xs font-bold tabular-nums">{formatMoney(fit.mediaAvailable)}</dd>
        </div>
      </dl>

      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Readiness measures whether the campaign materials exist. This measures whether the money,
        time, channels, and reach align. All figures are planning estimates calibrated from market
        references, not LV Branding quotes.
      </p>
    </section>
  );
}

/** What this phase includes and, just as importantly, what it does not. */
export function PhaseScopeCard({ result }: { result: CalculationResult }) {
  const fit = result.feasibility;
  const plan = result.scenarios[result.recommendedScenario];
  if (!fit.applies || fit.status === "scope-supported") return null;

  const deferred = plan.requirements.deferred;

  return (
    <section aria-labelledby="phase-h" className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h3 id="phase-h" className="text-sm font-semibold">What this phase includes</h3>

      {plan.isPreparationPhase ? (
        <>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {PREPARATION_PHASE.title}. This phase produces a plan, not a running campaign.
          </p>
          <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
            {PREPARATION_PHASE.inclusions.map((i) => <li key={i}>{i}</li>)}
          </ul>
          <p className="mt-2 text-[11px] font-medium text-primary">
            Media activation and complete campaign delivery are excluded from this phase.
          </p>
        </>
      ) : (
        <>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            A lean professional campaign on {plan.recommendedChannels || 1} channel, reusing what
            already works.
          </p>
          <ul className="mt-2 list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
            {LEAN_SCOPE_ASSUMPTIONS.slice(0, 6).map((a) => <li key={a}>{a}</li>)}
          </ul>
        </>
      )}

      {deferred.length > 0 && (
        <div className="mt-3 border-t border-border pt-3">
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            Deferred from this phase
          </p>
          <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
            {deferred.map((d) => <li key={d.key}>{readinessItemMeta(d.key).label}</li>)}
          </ul>
        </div>
      )}

      <div className="mt-3 border-t border-border pt-3">
        <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Quoted separately
        </p>
        <ul className="mt-1.5 list-disc space-y-0.5 pl-4 text-[11px] text-muted-foreground">
          {SEPARATE_SCOPE_ADDITIONS.slice(0, 5).map((a) => <li key={a}>{a}</li>)}
        </ul>
      </div>
    </section>
  );
}

// ── Budget balance ──────────────────────────────────────────────────────────────

export function BalanceCard({
  answers, plan, currentShares,
}: { answers: CalculatorAnswers; plan: ScenarioPlan; currentShares: Shares }) {
  const notes: BalanceNote[] = balanceNotes(answers, plan, currentShares);

  return (
    <section aria-labelledby="balance-h" className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h3 id="balance-h" className="text-sm font-semibold">Budget balance</h3>
      {notes.length === 0 ? (
        <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
          No structural concerns with this allocation. The mix of foundation, distribution, and
          testing looks proportionate to your answers.
        </p>
      ) : (
        <ul className="mt-3 space-y-2.5">
          {notes.map((note) => (
            <li key={note.id} className="flex gap-2.5 text-xs leading-relaxed">
              {note.tone === "attention"
                ? <AlertCircle size={14} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                : <Info size={14} className="mt-0.5 shrink-0 text-muted-foreground" aria-hidden="true" />}
              <span className="text-muted-foreground">
                <span className="sr-only">{note.tone === "attention" ? "Worth attention: " : "Note: "}</span>
                {note.text}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Break-even ──────────────────────────────────────────────────────────────────

export function BreakEvenCard({ plan }: { plan: ScenarioPlan }) {
  const be = plan.breakEven;
  if (!be) return null;

  const goal = be.goalUnits;
  const max = Math.max(be.breakEvenUnits, goal ?? 0) || 1;
  const bePct = Math.min(100, (be.breakEvenUnits / max) * 100);
  const goalPct = goal !== null ? Math.min(100, (goal / max) * 100) : null;

  return (
    <section aria-labelledby="breakeven-h" className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <h3 id="breakeven-h" className="text-sm font-semibold">Break-even view</h3>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        At roughly {formatMoney(be.grossProfitPerUnit)} gross profit per {be.unitNoun.replace(/s$/, "")},
        this scenario breaks even at about{" "}
        <strong className="text-foreground">{be.breakEvenUnits.toLocaleString()} {be.unitNoun}</strong>.
      </p>

      {/* Simple comparison bars; values are stated in text, colour is not the only channel. */}
      <div className="mt-4 space-y-3">
        <div>
          <div className="mb-1 flex items-baseline justify-between text-[11px]">
            <span className="font-medium">Break-even point</span>
            <span className="tabular-nums text-muted-foreground">{be.breakEvenUnits.toLocaleString()} {be.unitNoun}</span>
          </div>
          <div className="h-2.5 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-foreground/60" style={{ width: `${bePct}%` }} />
          </div>
        </div>
        {goal !== null && goalPct !== null && (
          <div>
            <div className="mb-1 flex items-baseline justify-between text-[11px]">
              <span className="font-medium">This scenario's estimated {be.unitNoun}</span>
              <span className="tabular-nums text-muted-foreground">{goal.toLocaleString()}</span>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-muted">
              <div className="h-full rounded-full bg-primary" style={{ width: `${goalPct}%` }} />
            </div>
          </div>
        )}
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 sm:grid-cols-3">
        {be.projectedRevenue !== null && (
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Projected revenue</dt>
            <dd className="text-sm font-bold tabular-nums">{formatMoney(Math.round(be.projectedRevenue))}</dd>
          </div>
        )}
        {be.projectedGrossProfit !== null && (
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Projected gross profit</dt>
            <dd className="text-sm font-bold tabular-nums">{formatMoney(Math.round(be.projectedGrossProfit))}</dd>
          </div>
        )}
        <div>
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Scenario investment</dt>
          <dd className="text-sm font-bold tabular-nums">{formatMoney(plan.total)}</dd>
        </div>
      </dl>
      <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
        Revenue is not profit: projected gross profit already subtracts direct costs at your stated
        margin, but not the campaign investment itself. These figures follow from your own
        assumptions; they are planning arithmetic, not a forecast.
      </p>
    </section>
  );
}

// ── Detailed allocation cards ───────────────────────────────────────────────────

export function DetailCards({
  result, plan, currentShares,
}: { result: CalculationResult; plan: ScenarioPlan; currentShares: Shares }) {
  const amounts = allocationAmounts(plan.total, currentShares);
  const pcts = displayPercents(currentShares);

  return (
    <section aria-labelledby="details-h" className="space-y-3">
      <h3 id="details-h" className="text-sm font-semibold">What each allocation is for</h3>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {CATEGORIES.map((cat) => {
          const influences = result.insights.find((i) => i.key === cat.key)?.influences ?? [];
          return (
            <article key={cat.key} className="flex flex-col rounded-xl border border-border bg-card p-4">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="h-3 w-3 rounded-sm" style={{ background: `var(--cc-${cat.key})` }} />
                <h4 className="min-w-0 flex-1 truncate text-xs font-bold">{cat.label}</h4>
              </div>
              <p className="mt-2 text-base font-bold tabular-nums">
                {formatMoney(amounts[cat.key])}
                <span className="ml-1.5 text-xs font-medium text-muted-foreground">
                  · {pcts[cat.key]}%
                </span>
              </p>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">{cat.why}</p>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                <span className="font-semibold text-foreground/80">Could cover:</span> {cat.covers}
              </p>
              {influences.length > 0 && (
                <p className="mt-2 border-t border-border pt-2 text-[11px] leading-relaxed text-muted-foreground">
                  <span className="font-semibold text-foreground/80">Shaped by your answers:</span>{" "}
                  {influences.join("; ")}.
                </p>
              )}
            </article>
          );
        })}
      </div>
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Amounts describe planning capacity, not a quote; what specific deliverables cost depends on
        scope and market. Nothing here commits you (or LV Branding) to a price.
      </p>
    </section>
  );
}

// ── Disclaimer ──────────────────────────────────────────────────────────────────

export function Disclaimer() {
  return (
    <section aria-label="Disclaimer" className="rounded-xl border border-border bg-muted/40 p-4 text-[11px] leading-relaxed text-muted-foreground">
      <p>
        This calculator provides planning estimates based on the information and assumptions
        entered. Actual advertising costs and campaign performance vary by industry, market,
        audience, platform, competition, creative quality, and execution. Results are not guaranteed.
      </p>
      <details className="mt-2">
        <summary className="cursor-pointer select-none font-semibold text-foreground/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
          How these estimates work
        </summary>
        <div className="mt-2 space-y-2">
          <p>
            Allocations start from configurable planning ranges (for example, paid media typically
            lands between 30% and 55% of a campaign budget) and adapt to your answers: missing
            foundations shift budget toward strategy, creative, and digital experience; a complete
            foundation releases more toward media. The three scenarios change scope (reach, channel
            count, creative coverage, and testing depth) rather than multiplying one number.
          </p>
          <p>
            Goal-first estimates convert your goal into a media budget using the cost and conversion
            values you entered (or accepted as planning assumptions), then size the surrounding
            investment so distribution isn't funded at the expense of the message. Where a default
            appears, it is a starting point to edit, not a benchmark, and not a promise of what your
            market will actually charge.
          </p>
          <p>This tool is for planning purposes only and is not financial advice.</p>
        </div>
      </details>
    </section>
  );
}

// ── Consultation CTA ────────────────────────────────────────────────────────────

export function ReviewCta() {
  return (
    <section aria-labelledby="cta-h" className="rounded-xl border border-border bg-card p-4 sm:p-5">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
        <div className="min-w-0 flex-1 basis-64">
          <h3 id="cta-h" className="text-sm font-semibold">Want a professional review of your campaign plan?</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            LV Branding can help you evaluate the strategy, creative requirements, digital
            experience, and media structure behind your investment.
          </p>
        </div>
        <a
          href="/digital-marketing-paid-media-houston"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          Request a Campaign Review
          <ArrowRight size={14} aria-hidden="true" />
        </a>
      </div>
    </section>
  );
}

// ── Print report (uses the app's existing .print-only pattern) ──────────────────

export function PrintReport({
  answers, result, plan, currentShares,
}: {
  answers: CalculatorAnswers;
  result: CalculationResult;
  plan: ScenarioPlan;
  currentShares: Shares;
}) {
  const amounts = allocationAmounts(plan.total, currentShares);
  const pcts = displayPercents(currentShares);
  const obj = answers.objective ? objectiveMeta(answers.objective) : null;
  const notes = balanceNotes(answers, plan, currentShares);
  const bandMeta = READINESS_BANDS.find((b) => b.band === result.readiness.band);

  return (
    <div className="print-only printable-output" aria-hidden="true">
      <header className="printable-output__header">
        <div>
          <p className="printable-output__eyebrow">LV Branding · Campaign Investment Calculator</p>
          <h1>Campaign Investment Plan: {scenarioMeta(plan.key).label}</h1>
        </div>
        <div className="printable-output__meta">
          <p>Planning estimate</p>
          <p>{new Date().toLocaleDateString()}</p>
          <p>lvbranding.com</p>
        </div>
      </header>
      <div className="printable-output__body">
        <p>
          <strong>Total investment: {formatMoney(plan.total)}</strong>
          {obj ? ` · Objective: ${obj.label}` : ""} · Duration: {answers.scope.durationDays} days ·
          Channels selected: {answers.scope.channels.length}
          {answers.destination ? ` · Destination: ${DESTINATIONS.find((d) => d.key === answers.destination)?.label}` : ""}
          {" "}· Readiness: {result.readiness.score}/100{bandMeta ? ` (${bandMeta.label})` : ""},
          {" "}{result.readiness.essentialReady} of {result.readiness.essentialTotal} essential components ready
        </p>
        {result.contradictions.length > 0 && (
          <p><strong>Assumption to review:</strong> {result.contradictions[0].text}</p>
        )}
        <table style={{ width: "100%", borderCollapse: "collapse", margin: "14px 0" }}>
          <thead>
            <tr>
              <th style={{ textAlign: "left", borderBottom: "1px solid #d1d5db", padding: "4px 0" }}>Category</th>
              <th style={{ textAlign: "right", borderBottom: "1px solid #d1d5db", padding: "4px 0" }}>Amount</th>
              <th style={{ textAlign: "right", borderBottom: "1px solid #d1d5db", padding: "4px 0" }}>Share</th>
            </tr>
          </thead>
          <tbody>
            {CATEGORIES.map((cat) => (
              <tr key={cat.key}>
                <td style={{ padding: "4px 0", borderBottom: "1px solid #f3f4f6" }}>{cat.label}</td>
                <td style={{ padding: "4px 0", borderBottom: "1px solid #f3f4f6", textAlign: "right" }}>{formatMoney(amounts[cat.key])}</td>
                <td style={{ padding: "4px 0", borderBottom: "1px solid #f3f4f6", textAlign: "right" }}>{pcts[cat.key]}%</td>
              </tr>
            ))}
            <tr>
              <td style={{ padding: "6px 0", fontWeight: 700 }}>Total</td>
              <td style={{ padding: "6px 0", fontWeight: 700, textAlign: "right" }}>{formatMoney(plan.total)}</td>
              <td style={{ padding: "6px 0", fontWeight: 700, textAlign: "right" }}>100%</td>
            </tr>
          </tbody>
        </table>
        {plan.breakEven && (
          <p>
            <strong>Break-even:</strong> about {plan.breakEven.breakEvenUnits.toLocaleString()} {plan.breakEven.unitNoun}
            {plan.breakEven.goalUnits !== null ? ` · Estimated ${plan.breakEven.unitNoun}: ${plan.breakEven.goalUnits.toLocaleString()}` : ""}
            {plan.breakEven.projectedRevenue !== null ? ` · Projected revenue: ${formatMoney(Math.round(plan.breakEven.projectedRevenue))}` : ""}
            {plan.breakEven.projectedGrossProfit !== null ? ` · Projected gross profit: ${formatMoney(Math.round(plan.breakEven.projectedGrossProfit))}` : ""}
          </p>
        )}
        {notes.length > 0 && (
          <>
            <h3>Planning considerations</h3>
            <ul>
              {notes.map((n) => <li key={n.id}>{n.text}</li>)}
            </ul>
          </>
        )}
        <p style={{ marginTop: 18, fontSize: "9.5pt", color: "#6b7280" }}>
          This plan contains planning estimates based on the information and assumptions entered.
          Actual advertising costs and campaign performance vary by industry, market, audience,
          platform, competition, creative quality, and execution. Results are not guaranteed.
          Prepared with the LV Branding Campaign Investment Calculator.
        </p>
      </div>
    </div>
  );
}
