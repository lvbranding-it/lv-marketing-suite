// ── Campaign Investment Calculator: wizard steps ───────────────────────────────
// Each step is a controlled view over `answers`; validation runs on "Continue"
// so typing is never interrupted. All business math lives in src/lib/campaign.

import { useState } from "react";
import { z } from "zod";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  ASSUMPTIONS, AUDIENCE_BANDS, BUSINESS_STAGES, BUSINESS_TYPES, CHANNELS,
  CURRENCIES, DURATION_PRESETS, INDUSTRIES, MARKET_REACHES, OBJECTIVES,
  READINESS_ITEMS, formatMoney, objectiveMeta,
} from "@/lib/campaign/config";
import type {
  CalculatorAnswers, ChannelKey, CurrencyCode, FinancialMode, ObjectiveKey,
} from "@/lib/campaign/types";
import {
  Field, NumberField, OptionCards, StatementToggle, ToggleChips,
  parseMoney, parsePercent,
} from "./shared";

export const STEP_LABELS = ["Profile", "Objective", "Scope", "Readiness", "Investment", "Review"];

export type StepErrors = Record<string, string>;

interface StepProps {
  answers:  CalculatorAnswers;
  onChange: (next: CalculatorAnswers) => void;
  errors:   StepErrors;
}

// ── Validation ──────────────────────────────────────────────────────────────────

const moneyBounds = z.number()
  .min(ASSUMPTIONS.minBudget, `Enter at least ${formatMoney(ASSUMPTIONS.minBudget)} to build a meaningful plan.`)
  .max(ASSUMPTIONS.maxBudget, "That budget is above what this planner supports. Contact us directly for engagements at that scale.");

const goalBounds = z.number()
  .min(ASSUMPTIONS.minGoal, "Enter a goal of at least 1.")
  .max(ASSUMPTIONS.maxGoal, "That goal is above what this planner supports.");

const costBounds = z.number()
  .min(ASSUMPTIONS.minCostPerResult, "Cost must be above zero.")
  .max(ASSUMPTIONS.maxCostPerResult, "That cost looks too high. Double-check the number.");

const conversionBounds = z.number()
  .min(ASSUMPTIONS.minConversion, "Conversion rate must be above 0%.")
  .max(ASSUMPTIONS.maxConversion, "Conversion rate can't exceed 100%.");

const marginBounds = z.number()
  .min(ASSUMPTIONS.minMargin, "Margin must be above 0%.")
  .max(ASSUMPTIONS.maxMargin, "Margins above 95% are outside typical planning ranges.");

function boundsError(schema: z.ZodType<number>, value: number): string | null {
  const parsed = schema.safeParse(value);
  if (parsed.success) return null;
  return parsed.error.issues[0]?.message ?? "Check this value.";
}

export function validateStep(step: number, answers: CalculatorAnswers): StepErrors {
  const errors: StepErrors = {};

  if (step === 0) {
    if (!answers.profile.businessType) errors.businessType = "Choose the option closest to your organization.";
    if (!answers.profile.stage) errors.stage = "Choose your business stage.";
    if (!answers.profile.reach) errors.reach = "Choose your market reach.";
    if (!answers.profile.industry) errors.industry = "Choose an industry. “Other” works fine.";
  }

  if (step === 1 && !answers.objective) {
    errors.objective = "Choose the single outcome that matters most for this campaign.";
  }

  if (step === 2) {
    if (!answers.scope.durationDays || answers.scope.durationDays < 7) errors.duration = "Campaigns shorter than a week rarely produce readable results. Enter at least 7 days.";
    if (answers.scope.durationDays > 730) errors.duration = "Enter a duration of two years or less.";
    if (answers.scope.channels.length === 0) errors.channels = "Select at least one advertising channel.";
  }

  if (step === 4) {
    const fin = answers.financial;
    if (fin.mode === "budget") {
      if (fin.budgetTotal === null) errors.budgetTotal = "Enter your total available campaign budget.";
      else {
        const e = boundsError(moneyBounds, fin.budgetTotal);
        if (e) errors.budgetTotal = e;
      }
      if (fin.expectedRevenue !== null && fin.expectedRevenue < 0) errors.expectedRevenue = "Revenue can't be negative.";
    } else {
      if (fin.goalCount === null) errors.goalCount = "Enter the result you're aiming for.";
      else {
        const e = boundsError(goalBounds, fin.goalCount);
        if (e) errors.goalCount = e;
      }
      if (fin.costPerResult === null) errors.costPerResult = "Enter a cost estimate, or use the planning assumption.";
      else {
        const e = boundsError(costBounds, fin.costPerResult);
        if (e) errors.costPerResult = e;
      }
      const needsConversion = answers.objective ? objectiveMeta(answers.objective).usesLeadStep : false;
      if (needsConversion) {
        if (fin.conversionRate === null) errors.conversionRate = "Enter a conversion rate, or use the planning assumption.";
        else {
          const e = boundsError(conversionBounds, fin.conversionRate);
          if (e) errors.conversionRate = e;
        }
      }
    }
    if (answers.financial.avgValue !== null && answers.financial.avgValue <= 0) errors.avgValue = "Average value must be above zero.";
    if (answers.financial.marginPct !== null) {
      const e = boundsError(marginBounds, answers.financial.marginPct);
      if (e) errors.marginPct = e;
    }
  }

  return errors;
}

// ── Step 1: Business profile ────────────────────────────────────────────────────

export function ProfileStep({ answers, onChange, errors }: StepProps) {
  const p = answers.profile;
  const set = (patch: Partial<typeof p>) => onChange({ ...answers, profile: { ...p, ...patch } });

  return (
    <div className="space-y-6">
      <OptionCards
        legend="What kind of organization is this for?"
        options={BUSINESS_TYPES.map((b) => ({ value: b.key, label: b.label }))}
        value={p.businessType}
        onChange={(businessType) => set({ businessType })}
        error={errors.businessType}
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
        onChange={(objective: ObjectiveKey) => onChange({ ...answers, objective })}
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
  const set = (patch: Partial<typeof s>) => onChange({ ...answers, scope: { ...s, ...patch } });
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
          set({ channels: s.channels.includes(key) ? s.channels.filter((c) => c !== key) : [...s.channels, key] })
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

export function ReadinessStep({ answers, onChange }: StepProps) {
  const set = (key: keyof typeof answers.readiness, value: boolean) =>
    onChange({ ...answers, readiness: { ...answers.readiness, [key]: value } });

  return (
    <div className="space-y-4">
      <p className="text-sm leading-relaxed text-muted-foreground">
        Check everything you <strong className="text-foreground">already have and could use in this campaign
        today</strong>. Anything unchecked isn't a problem; it becomes a planning consideration
        in your investment plan.
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {READINESS_ITEMS.map((item) => (
          <StatementToggle
            key={item.key}
            label={item.label}
            checked={answers.readiness[item.key]}
            onChange={(v) => set(item.key, v)}
          />
        ))}
      </div>
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
    budgetTotal:     fin.budgetTotal !== null ? String(fin.budgetTotal) : "",
    expectedRevenue: fin.expectedRevenue !== null ? String(fin.expectedRevenue) : "",
    goalCount:       fin.goalCount !== null ? String(fin.goalCount) : "",
    avgValue:        fin.avgValue !== null ? String(fin.avgValue) : "",
    conversionRate:  fin.conversionRate !== null ? String(Math.round(fin.conversionRate * 1000) / 10) : "",
    costPerResult:   fin.costPerResult !== null ? String(fin.costPerResult) : "",
    marginPct:       fin.marginPct !== null ? String(Math.round(fin.marginPct * 1000) / 10) : "",
  }));

  const setFin = (patch: Partial<typeof fin>) => onChange({ ...answers, financial: { ...fin, ...patch } });

  const bindMoney = (key: keyof typeof fin & string) => (value: string) => {
    setRaw((r) => ({ ...r, [key]: value }));
    setFin({ [key]: parseMoney(value) } as Partial<typeof fin>);
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

  return (
    <div className="space-y-6">
      <OptionCards
        legend="How do you want to plan?"
        columns={2}
        options={[
          { value: "budget", label: "I have a budget and want to allocate it", hint: "Start from the money and split it well" },
          { value: "goal", label: "I have a goal and want to estimate the investment", hint: "Start from the outcome and work backwards" },
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
            label={obj ? `Desired ${obj.unitNoun}` : "Desired results"}
            placeholder="100"
            value={raw.goalCount} onChange={bindMoney("goalCount")}
            error={errors.goalCount}
          />
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
  const readyCount = READINESS_ITEMS.filter((i) => answers.readiness[i.key]).length;
  const duration = DURATION_PRESETS.find((d) => d.days === answers.scope.durationDays && !answers.scope.customDuration)?.label
    ?? `${answers.scope.durationDays} days`;

  const rows: { step: number; label: string; value: string }[] = [
    {
      step: 0, label: "Business",
      value: [
        BUSINESS_TYPES.find((b) => b.key === answers.profile.businessType)?.label,
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
    { step: 3, label: "Readiness", value: `${readyCount} of ${READINESS_ITEMS.length} campaign components in place` },
    {
      step: 4, label: "Financials",
      value: fin.mode === "budget"
        ? `Budget-first · ${fin.budgetTotal !== null ? formatMoney(fin.budgetTotal) : "–"}`
        : `Goal-first · ${fin.goalCount !== null ? fin.goalCount.toLocaleString() : "–"} ${obj?.unitNoun ?? "results"} · ${fin.costPerResult !== null ? `${formatMoney(fin.costPerResult)} per ${obj?.perThousand ? "1,000 reached" : obj?.usesLeadStep ? "lead" : obj?.unitSingular ?? "result"}` : "–"}${fin.assumedCostPerResult ? " (assumption)" : ""}`,
    },
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
