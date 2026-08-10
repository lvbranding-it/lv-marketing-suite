// ── Campaign Investment Calculator: wizard steps ───────────────────────────────
// Each step is a controlled view over `answers`; validation runs on "Continue"
// so typing is never interrupted. All business math lives in src/lib/campaign.

import { useState } from "react";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import {
  ASSUMPTIONS, AUDIENCE_BANDS, AUDIENCE_FOCUS_OPTIONS, BUSINESS_STAGES, CHANNELS,
  CURRENCIES, DESTINATIONS, DURATION_PRESETS, INDUSTRIES, MARKET_REACHES,
  OBJECTIVES, READINESS_BANDS, READINESS_GROUPS, READINESS_STATES,
  RELEVANCE_LABELS, formatMoney, objectiveMeta, readinessItemMeta,
} from "@/lib/campaign/config";
import { componentAssessments, readinessScore } from "@/lib/campaign/engine";
import { validateStep, type StepErrors } from "@/lib/campaign/validate";
import type {
  CalculatorAnswers, ChannelKey, ComponentAssessment, ComponentRelevance,
  CurrencyCode, FinancialMode, ObjectiveKey, ReadinessKey, ReadinessState,
} from "@/lib/campaign/types";
import {
  Field, NumberField, OptionCards, ToggleChips,
  formatNumericInput, parseMoney, parsePercent,
} from "./shared";

export { validateStep };
export type { StepErrors };

export const STEP_LABELS = ["Profile", "Objective", "Scope", "Readiness", "Investment", "Review"];

interface StepProps {
  answers:  CalculatorAnswers;
  onChange: React.Dispatch<React.SetStateAction<CalculatorAnswers>>;
  errors:   StepErrors;
}

// ── Step 1: Business profile ────────────────────────────────────────────────────

export function ProfileStep({ answers, onChange, errors }: StepProps) {
  const p = answers.profile;
  const set = (patch: Partial<typeof p>) =>
    onChange((prev) => ({ ...prev, profile: { ...prev.profile, ...patch } }));

  return (
    <div className="space-y-6">
      <OptionCards
        legend="Who do you primarily sell or communicate to?"
        columns={2}
        options={AUDIENCE_FOCUS_OPTIONS.map((o) => ({ value: o.key, label: o.label }))}
        value={p.audienceFocus}
        onChange={(audienceFocus) => set({ audienceFocus })}
        error={errors.audienceFocus}
      />
      <OptionCards
        legend="What stage is the business in?"
        options={BUSINESS_STAGES.map((s) => ({ value: s.key, label: s.label, hint: s.hint }))}
        value={p.stage}
        onChange={(stage) => set({ stage })}
        error={errors.stage}
      />
      <OptionCards
        legend="How far does your market reach?"
        options={MARKET_REACHES.map((r) => ({ value: r.key, label: r.label }))}
        value={p.reach}
        onChange={(reach) => set({ reach })}
        error={errors.reach}
      />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Industry" error={errors.industry}>
          <Select value={p.industry || undefined} onValueChange={(industry) => set({ industry })}>
            <SelectTrigger aria-label="Industry"><SelectValue placeholder="Choose an industry" /></SelectTrigger>
            <SelectContent>
              {INDUSTRIES.map((i) => <SelectItem key={i} value={i}>{i}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <Field label="Currency">
          <Select value={p.currency} onValueChange={(currency) => set({ currency: currency as CurrencyCode })}>
            <SelectTrigger aria-label="Currency"><SelectValue /></SelectTrigger>
            <SelectContent>
              {Object.entries(CURRENCIES).map(([code, meta]) => (
                <SelectItem key={code} value={code}>{meta.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>
    </div>
  );
}

// ── Step 2: Campaign objective ──────────────────────────────────────────────────

export function ObjectiveStep({ answers, onChange, errors }: StepProps) {
  return (
    <div className="space-y-4">
      <OptionCards
        legend="What is the one outcome this campaign exists to produce?"
        options={OBJECTIVES.map((o) => ({ value: o.key, label: o.label }))}
        value={answers.objective}
        onChange={(objective: ObjectiveKey) => onChange((prev) => ({ ...prev, objective }))}
        error={errors.objective}
      />
      <p className="text-[11px] leading-relaxed text-muted-foreground">
        Campaigns that try to do everything usually measure nothing. Pick the primary outcome;
        secondary benefits still happen, they just don't drive the plan.
      </p>
    </div>
  );
}

// ── Step 3: Campaign scope ──────────────────────────────────────────────────────

export function ScopeStep({ answers, onChange, errors }: StepProps) {
  const s = answers.scope;
  const set = (patch: Partial<typeof s>) =>
    onChange((prev) => ({ ...prev, scope: { ...prev.scope, ...patch } }));
  const isPreset = DURATION_PRESETS.some((d) => d.days === s.durationDays) && !s.customDuration;

  return (
    <div className="space-y-6">
      <div>
        <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          Campaign duration
        </p>
        <div role="radiogroup" aria-label="Campaign duration" className="flex flex-wrap gap-2">
          {DURATION_PRESETS.map((d) => {
            const active = isPreset && s.durationDays === d.days;
            return (
              <button
                key={d.days}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => set({ durationDays: d.days, customDuration: false })}
                className={`min-h-10 rounded-full border px-4 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                  active ? "border-primary bg-accent font-medium text-accent-foreground" : "border-border text-muted-foreground hover:border-muted-foreground/40"
                }`}
              >
                {d.label}
              </button>
            );
          })}
          <button
            type="button"
            role="radio"
            aria-checked={s.customDuration}
            onClick={() => set({ customDuration: true })}
            className={`min-h-10 rounded-full border px-4 py-2 text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
              s.customDuration ? "border-primary bg-accent font-medium text-accent-foreground" : "border-border text-muted-foreground hover:border-muted-foreground/40"
            }`}
          >
            Custom
          </button>
        </div>
        {s.customDuration && (
          <div className="mt-3 max-w-[200px]">
            <Field label="Duration in days" error={errors.duration}>
              <Input
                inputMode="numeric"
                value={s.durationDays ? String(s.durationDays) : ""}
                onChange={(e) => {
                  const v = Number(e.target.value.replace(/[^\d]/g, ""));
                  set({ durationDays: Number.isFinite(v) ? v : 0 });
                }}
                placeholder="45"
              />
            </Field>
          </div>
        )}
        {!s.customDuration && errors.duration && (
          <p role="alert" className="mt-1.5 text-[11px] font-medium text-destructive">{errors.duration}</p>
        )}
      </div>

      <ToggleChips
        legend="Which advertising channels are you considering?"
        options={CHANNELS.map((c) => ({ value: c.key, label: c.label }))}
        selected={s.channels}
        onToggle={(key: ChannelKey) =>
          // Functional update all the way down: the toggle must read the channel
          // list from prev state, not the render closure, or rapid taps drop picks.
          onChange((prev) => ({
            ...prev,
            scope: {
              ...prev.scope,
              channels: prev.scope.channels.includes(key)
                ? prev.scope.channels.filter((c) => c !== key)
                : [...prev.scope.channels, key],
            },
          }))
        }
        hint={s.channels.length > 0 ? `${s.channels.length} selected. The plan will tell you how many your budget realistically supports.` : undefined}
        error={errors.channels}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Estimated audience size" optional hint="If you know roughly how many people you're trying to reach.">
          <Select value={s.audience} onValueChange={(audience) => set({ audience: audience as typeof s.audience })}>
            <SelectTrigger aria-label="Estimated audience size"><SelectValue /></SelectTrigger>
            <SelectContent>
              {AUDIENCE_BANDS.map((a) => <SelectItem key={a.key} value={a.key}>{a.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </Field>
        <OptionCards
          legend="Timing"
          columns={2}
          options={[
            { value: "always-on", label: "Always-on", hint: "Runs continuously, can start anytime" },
            { value: "time-sensitive", label: "Time-sensitive", hint: "Fixed date: event, launch, season" },
          ]}
          value={s.timeSensitive ? "time-sensitive" : "always-on"}
          onChange={(v) => set({ timeSensitive: v === "time-sensitive" })}
        />
      </div>
    </div>
  );
}

// ── Step 4: Campaign readiness ──────────────────────────────────────────────────

const RELEVANCE_CHIP: Record<ComponentRelevance, string> = {
  essential:      "bg-accent text-accent-foreground",
  recommended:    "bg-muted text-muted-foreground",
  optional:       "bg-muted/60 text-muted-foreground",
  "not-required": "bg-muted/60 text-muted-foreground",
};

/** One component: relevance, why it applies, and a four-state readiness choice. */
function ReadinessRow({
  assessment, onSelect,
}: {
  assessment: ComponentAssessment;
  onSelect: (state: ReadinessState) => void;
}) {
  const item = readinessItemMeta(assessment.key);
  const groupId = `readiness-${assessment.key}`;

  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span id={groupId} className="text-xs font-semibold">{item.label}</span>
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-semibold", RELEVANCE_CHIP[assessment.relevance])}>
          {RELEVANCE_LABELS[assessment.relevance]}
        </span>
      </div>
      {assessment.reason && (
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">{assessment.reason}</p>
      )}
      <div role="radiogroup" aria-labelledby={groupId} className="mt-2 grid grid-cols-2 gap-1.5 sm:grid-cols-4">
        {READINESS_STATES.map((state) => {
          const active = assessment.state === state.key;
          return (
            <button
              key={state.key}
              type="button"
              role="radio"
              aria-checked={active}
              aria-label={`${item.label}: ${state.label}`}
              onClick={() => onSelect(state.key)}
              className={cn(
                "min-h-9 rounded-md border px-2 py-1.5 text-[11px] font-medium leading-tight transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                active
                  ? "border-primary bg-accent text-accent-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-muted-foreground/40",
              )}
            >
              {state.short}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ReadinessStep({ answers, onChange, errors }: StepProps) {
  const setState = (key: ReadinessKey, value: ReadinessState) =>
    onChange((prev) => ({ ...prev, readiness: { ...prev.readiness, [key]: value } }));

  const assessments = componentAssessments(answers);
  const byKey = new Map(assessments.map((a) => [a.key, a]));
  const applicable = assessments.filter((a) => a.relevance !== "not-required");
  const notRequired = assessments.filter((a) => a.relevance === "not-required");

  return (
    <div className="space-y-6">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Campaigns do not all require the same materials. Based on your objective and selected
        channels, we've identified what is essential, recommended, or optional for this plan.
        Tell us what can be used confidently today; if something exists but may need improvement,
        select "Needs review."{" "}
        <strong className="text-foreground">You do not need every item listed below.</strong>
      </p>

      {/* The destination decides which destination components matter, so it is
          asked before the checklist rather than assumed. */}
      <div>
        <OptionCards
          legend="Where should people go, or what should they do, after seeing the campaign?"
          columns={2}
          options={DESTINATIONS.map((d) => ({ value: d.key, label: d.label }))}
          value={answers.destination}
          onChange={(destination) => onChange((prev) => ({ ...prev, destination }))}
          error={errors.destination}
        />
      </div>

      {answers.destination && (
        <>

          {READINESS_GROUPS.map((group) => {
            const rows = applicable.filter((a) => readinessItemMeta(a.key).group === group.key);
            if (rows.length === 0) return null;
            return (
              <section key={group.key} className="space-y-2">
                <div>
                  <h3 className="text-xs font-semibold uppercase tracking-wide">{group.label}</h3>
                  <p className="text-[11px] text-muted-foreground">{group.blurb}</p>
                </div>
                <div className="grid gap-2 lg:grid-cols-2">
                  {rows.map((a) => (
                    <ReadinessRow
                      key={a.key}
                      assessment={byKey.get(a.key) as ComponentAssessment}
                      onSelect={(state) => setState(a.key, state)}
                    />
                  ))}
                </div>
              </section>
            );
          })}

          {notRequired.length > 0 && (
            <details className="rounded-lg border border-border bg-muted/30 px-3 py-2">
              <summary className="cursor-pointer select-none text-xs font-medium text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
                Not required for this plan ({notRequired.length})
              </summary>
              <ul className="mt-2 space-y-1">
                {notRequired.map((a) => (
                  <li key={a.key} className="text-[11px] text-muted-foreground">
                    {readinessItemMeta(a.key).label}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                These don't apply to the objective, channels, and destination you selected, so they
                are excluded from your readiness score entirely.
              </p>
            </details>
          )}

          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Anything left unanswered is planned as though it still needs to be created.
          </p>
        </>
      )}
    </div>
  );
}

// ── Step 5: Financial mode + inputs ─────────────────────────────────────────────

interface AssumptionRowProps {
  active:      boolean;
  explanation: string;
  onUse:       () => void;
}

function AssumptionRow({ active, explanation, onUse }: AssumptionRowProps) {
  if (active) {
    return (
      <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <span className="mr-1.5 inline-flex items-center rounded-full bg-accent px-2 py-0.5 text-[10px] font-semibold text-accent-foreground">
          Planning assumption
        </span>
        Edit the value anytime; the plan updates with it.
      </p>
    );
  }
  return (
    <p className="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
      <button type="button" onClick={onUse} className="font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
        Not sure? Use a planning assumption
      </button>
      {" "}· {explanation}
    </p>
  );
}

/** Keeps raw input strings locally; parsed values propagate to `answers` on each change. */
export function FinancialStep({ answers, onChange, errors }: StepProps) {
  const fin = answers.financial;
  const obj = answers.objective ? objectiveMeta(answers.objective) : null;
  const usesLeadStep = obj?.usesLeadStep ?? false;

  const [raw, setRaw] = useState<Record<string, string>>(() => ({
    budgetTotal:     fin.budgetTotal !== null ? formatNumericInput(String(fin.budgetTotal)) : "",
    expectedRevenue: fin.expectedRevenue !== null ? formatNumericInput(String(fin.expectedRevenue)) : "",
    goalCount:       fin.goalCount !== null ? formatNumericInput(String(fin.goalCount)) : "",
    avgValue:        fin.avgValue !== null ? formatNumericInput(String(fin.avgValue)) : "",
    conversionRate:  fin.conversionRate !== null ? String(Math.round(fin.conversionRate * 1000) / 10) : "",
    costPerResult:   fin.costPerResult !== null ? String(fin.costPerResult) : "",
    targetFrequency: fin.targetFrequency !== null ? String(fin.targetFrequency) : "",
    marginPct:       fin.marginPct !== null ? String(Math.round(fin.marginPct * 1000) / 10) : "",
  }));

  const setFin = (patch: Partial<typeof fin>) =>
    onChange((prev) => ({ ...prev, financial: { ...prev.financial, ...patch } }));

  // Money and count fields get live thousands grouping ("1000000" shows as "1,000,000").
  const bindMoney = (key: keyof typeof fin & string) => (value: string) => {
    const formatted = formatNumericInput(value);
    setRaw((r) => ({ ...r, [key]: formatted }));
    setFin({ [key]: parseMoney(formatted) } as Partial<typeof fin>);
  };
  const bindPercent = (key: "conversionRate" | "marginPct") => (value: string) => {
    setRaw((r) => ({ ...r, [key]: value }));
    const patch: Partial<typeof fin> = { [key]: parsePercent(value) };
    if (key === "conversionRate") patch.assumedConversion = false;
    setFin(patch);
  };

  const useCostAssumption = () => {
    if (!obj) return;
    setRaw((r) => ({ ...r, costPerResult: String(obj.defaultCostPerResult) }));
    setFin({ costPerResult: obj.defaultCostPerResult, assumedCostPerResult: true });
  };
  const useConversionAssumption = () => {
    if (!obj) return;
    setRaw((r) => ({ ...r, conversionRate: String(obj.defaultConversion * 100) }));
    setFin({ conversionRate: obj.defaultConversion, assumedConversion: true });
  };
  const useFrequencyAssumption = () => {
    if (!obj?.defaultFrequency) return;
    setRaw((r) => ({ ...r, targetFrequency: String(obj.defaultFrequency) }));
    setFin({ targetFrequency: obj.defaultFrequency, assumedFrequency: true });
  };

  return (
    <div className="space-y-6">
      <OptionCards
        legend="How would you like to plan?"
        columns={2}
        options={[
          { value: "budget", label: "I have a budget and want to allocate it", hint: "Start with your available investment and build a balanced allocation." },
          { value: "goal", label: "I have a goal and want to estimate the investment", hint: "Start with your campaign objective and estimate what it may require." },
        ]}
        value={fin.mode}
        onChange={(mode) => setFin({ mode: mode as FinancialMode })}
      />

      {fin.mode === "budget" ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Total available campaign budget"
            prefix="$" placeholder="25,000"
            value={raw.budgetTotal} onChange={bindMoney("budgetTotal")}
            error={errors.budgetTotal}
            hint="Everything: strategy, creative, media, and management, not just ad spend."
          />
          <NumberField
            label="Expected revenue from the campaign"
            prefix="$" placeholder="80,000" optional
            value={raw.expectedRevenue} onChange={bindMoney("expectedRevenue")}
            error={errors.expectedRevenue}
          />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label={obj?.goalLabel ?? (obj ? `Desired ${obj.unitNoun}` : "Desired results")}
            placeholder={obj?.perThousand ? "1,000,000" : "100"}
            value={raw.goalCount} onChange={bindMoney("goalCount")}
            error={errors.goalCount}
          />
          {obj?.perThousand && (
            <NumberField
              label="Target frequency"
              placeholder={String(obj.defaultFrequency ?? 3)}
              value={raw.targetFrequency}
              onChange={(v) => { setRaw((r) => ({ ...r, targetFrequency: v })); setFin({ targetFrequency: parseMoney(v), assumedFrequency: false }); }}
              error={errors.targetFrequency}
              hint="Frequency is the average number of times each person may see the campaign. Brand-awareness campaigns commonly require repeated exposure to build recognition."
              extra={
                <AssumptionRow
                  active={fin.assumedFrequency}
                  explanation="A CPM buys impressions, not people, so reach times frequency is what actually sizes the media budget."
                  onUse={useFrequencyAssumption}
                />
              }
            />
          )}
          <NumberField
            label={obj?.costLabel ?? "Estimated cost per result"}
            prefix="$" placeholder={obj ? String(obj.defaultCostPerResult) : "45"}
            value={raw.costPerResult} onChange={(v) => { setRaw((r) => ({ ...r, costPerResult: v })); setFin({ costPerResult: parseMoney(v), assumedCostPerResult: false }); }}
            error={errors.costPerResult}
            extra={
              <AssumptionRow
                active={fin.assumedCostPerResult}
                explanation="This estimate is what turns your goal into a media budget, and it varies widely by market and competition."
                onUse={useCostAssumption}
              />
            }
          />
          {usesLeadStep && (
            <NumberField
              label="Lead-to-customer conversion rate"
              suffix="%" placeholder={obj ? String(obj.defaultConversion * 100) : "15"}
              value={raw.conversionRate} onChange={bindPercent("conversionRate")}
              error={errors.conversionRate}
              extra={
                <AssumptionRow
                  active={fin.assumedConversion}
                  explanation="Of the people who raise a hand, how many become customers? It links leads to revenue."
                  onUse={useConversionAssumption}
                />
              }
            />
          )}
        </div>
      )}

      <div className="rounded-lg border border-border bg-muted/40 p-4">
        <p className="mb-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
          For break-even analysis <span className="font-normal normal-case tracking-normal">(optional, unlocks the break-even view)</span>
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          <NumberField
            label="Average customer or transaction value"
            prefix="$" placeholder="400" optional
            value={raw.avgValue} onChange={bindMoney("avgValue")}
            error={errors.avgValue}
          />
          <NumberField
            label="Gross profit margin"
            suffix="%" placeholder="50" optional
            value={raw.marginPct} onChange={bindPercent("marginPct")}
            error={errors.marginPct}
            hint="Roughly what's left of each sale after direct costs."
          />
        </div>
      </div>
    </div>
  );
}

// ── Step 6: Review ──────────────────────────────────────────────────────────────

interface ReviewStepProps extends StepProps {
  onJump: (step: number) => void;
}

export function ReviewStep({ answers, onJump }: ReviewStepProps) {
  const fin = answers.financial;
  const obj = answers.objective ? objectiveMeta(answers.objective) : null;
  const duration = DURATION_PRESETS.find((d) => d.days === answers.scope.durationDays && !answers.scope.customDuration)?.label
    ?? `${answers.scope.durationDays} days`;

  const ready = readinessScore(answers);
  const readinessBand = READINESS_BANDS.find((b) => b.band === ready.band);
  const readinessPhrase = ready.essentialReady === 0
    ? "Campaign foundation requires development"
    : readinessBand?.label ?? "Partially prepared";

  /**
   * Awareness spend hinges on frequency, so the review spells the whole chain
   * out: reach, frequency, CPM, and the resulting impressions.
   */
  const financialValue = (() => {
    if (fin.mode === "budget") {
      return `Budget-first · ${fin.budgetTotal !== null ? formatMoney(fin.budgetTotal) : "–"}`;
    }
    const goal = fin.goalCount;
    const parts = ["Goal-first"];
    if (obj?.perThousand) {
      parts.push(`${goal !== null ? goal.toLocaleString() : "–"} audience reach`);
      if (fin.targetFrequency !== null) parts.push(`Frequency ${fin.targetFrequency}`);
      if (fin.costPerResult !== null) parts.push(`${formatMoney(fin.costPerResult)} CPM${fin.assumedCostPerResult ? " (assumption)" : ""}`);
      if (goal !== null && fin.targetFrequency !== null) {
        parts.push(`${Math.round(goal * fin.targetFrequency).toLocaleString()} estimated impressions`);
      }
      return parts.join(" · ");
    }
    parts.push(`${goal !== null ? goal.toLocaleString() : "–"} ${obj?.unitNoun ?? "results"}`);
    if (fin.costPerResult !== null) {
      parts.push(`${formatMoney(fin.costPerResult)} per ${obj?.usesLeadStep ? "lead" : obj?.unitSingular ?? "result"}${fin.assumedCostPerResult ? " (assumption)" : ""}`);
    }
    if (obj?.usesLeadStep && fin.conversionRate !== null) {
      parts.push(`${Math.round(fin.conversionRate * 1000) / 10}% conversion`);
    }
    return parts.join(" · ");
  })();

  const rows: { step: number; label: string; value: string }[] = [
    {
      step: 0, label: "Business",
      value: [
        AUDIENCE_FOCUS_OPTIONS.find((o) => o.key === answers.profile.audienceFocus)?.label ?? "Audience not selected",
        BUSINESS_STAGES.find((s) => s.key === answers.profile.stage)?.label,
        MARKET_REACHES.find((r) => r.key === answers.profile.reach)?.label,
        answers.profile.industry,
      ].filter(Boolean).join(" · "),
    },
    { step: 1, label: "Objective", value: obj?.label ?? "–" },
    {
      step: 2, label: "Scope",
      value: `${duration} · ${answers.scope.channels.length} channel${answers.scope.channels.length === 1 ? "" : "s"} · ${answers.scope.timeSensitive ? "time-sensitive" : "always-on"}`,
    },
    {
      step: 3, label: "Readiness",
      value: `${DESTINATIONS.find((d) => d.key === answers.destination)?.label ?? "Destination not selected"} · ${readinessPhrase} · ${ready.essentialReady} of ${ready.essentialTotal} essential component${ready.essentialTotal === 1 ? "" : "s"} ready`,
    },
    { step: 4, label: "Financials", value: financialValue },
  ];

  return (
    <div className="space-y-3">
      <p className="text-sm leading-relaxed text-muted-foreground">
        A quick check before we build the plan. Jump back to any step without losing your answers.
      </p>
      <dl className="divide-y divide-border rounded-lg border border-border">
        {rows.map((row) => (
          <div key={row.label} className="flex items-start gap-3 px-4 py-3">
            <dt className="w-24 shrink-0 pt-0.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {row.label}
            </dt>
            <dd className="min-w-0 flex-1 text-sm leading-relaxed">{row.value || "–"}</dd>
            <Button
              variant="ghost" size="sm"
              className="h-7 shrink-0 gap-1 px-2 text-xs text-muted-foreground"
              onClick={() => onJump(row.step)}
            >
              <Pencil size={11} /> Edit
            </Button>
          </div>
        ))}
      </dl>
    </div>
  );
}
