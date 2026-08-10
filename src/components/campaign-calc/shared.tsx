// ── Campaign Investment Calculator: shared UI primitives ───────────────────────
// Presentation only: parsing helpers are thin and all real math lives in
// src/lib/campaign. Everything here is keyboard- and touch-first.

import { useId } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

// ── Field wrapper ───────────────────────────────────────────────────────────────

interface FieldProps {
  label:     string;
  hint?:     string;
  error?:    string;
  optional?: boolean;
  htmlFor?:  string;
  children:  React.ReactNode;
}

export function Field({ label, hint, error, optional, htmlFor, children }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor} className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
        {optional && <span className="ml-1.5 font-normal normal-case tracking-normal text-muted-foreground/70">(optional)</span>}
      </Label>
      {children}
      {hint && !error && <p className="text-[11px] leading-relaxed text-muted-foreground">{hint}</p>}
      {error && <p role="alert" className="text-[11px] font-medium text-destructive">{error}</p>}
    </div>
  );
}

// ── Single-select option cards ──────────────────────────────────────────────────

export interface CardOption<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

interface OptionCardsProps<T extends string> {
  legend:    string;
  options:   CardOption<T>[];
  value:     T | null;
  onChange:  (value: T) => void;
  columns?:  2 | 3;
  error?:    string;
}

/** Radio-semantics option grid rendered as touch-friendly cards. */
export function OptionCards<T extends string>({
  legend, options, value, onChange, columns = 3, error,
}: OptionCardsProps<T>) {
  const id = useId();
  return (
    <fieldset aria-describedby={error ? `${id}-err` : undefined}>
      <legend className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {legend}
      </legend>
      <div role="radiogroup" aria-label={legend} className={cn("grid gap-2", columns === 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-1 sm:grid-cols-2")}>
        {options.map((opt) => {
          const active = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(opt.value)}
              className={cn(
                "min-h-11 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                active
                  ? "border-primary bg-accent text-accent-foreground font-medium"
                  : "border-border bg-background hover:border-muted-foreground/40",
              )}
            >
              <span className="block leading-snug">{opt.label}</span>
              {opt.hint && <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">{opt.hint}</span>}
            </button>
          );
        })}
      </div>
      {error && <p id={`${id}-err`} role="alert" className="mt-1.5 text-[11px] font-medium text-destructive">{error}</p>}
    </fieldset>
  );
}

// ── Multi-select toggle chips ───────────────────────────────────────────────────

interface ToggleChipsProps<T extends string> {
  legend:   string;
  options:  { value: T; label: string }[];
  selected: T[];
  onToggle: (value: T) => void;
  error?:   string;
  hint?:    string;
}

export function ToggleChips<T extends string>({
  legend, options, selected, onToggle, error, hint,
}: ToggleChipsProps<T>) {
  const id = useId();
  return (
    <fieldset aria-describedby={error ? `${id}-err` : undefined}>
      <legend className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
        {legend}
      </legend>
      <div className="flex flex-wrap gap-2">
        {options.map((opt) => {
          const active = selected.includes(opt.value);
          return (
            <button
              key={opt.value}
              type="button"
              aria-pressed={active}
              onClick={() => onToggle(opt.value)}
              className={cn(
                "inline-flex min-h-10 items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
                active
                  ? "border-primary bg-accent font-medium text-accent-foreground"
                  : "border-border bg-background text-muted-foreground hover:border-muted-foreground/40",
              )}
            >
              {active && <Check size={12} className="text-primary" aria-hidden="true" />}
              {opt.label}
            </button>
          );
        })}
      </div>
      {hint && !error && <p className="mt-1.5 text-[11px] text-muted-foreground">{hint}</p>}
      {error && <p id={`${id}-err`} role="alert" className="mt-1.5 text-[11px] font-medium text-destructive">{error}</p>}
    </fieldset>
  );
}

// ── Yes/no statement rows (readiness step) ──────────────────────────────────────

interface StatementToggleProps {
  label:    string;
  checked:  boolean;
  onChange: (next: boolean) => void;
}

export function StatementToggle({ label, checked, onChange }: StatementToggleProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        "flex w-full min-h-11 items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        checked ? "border-primary/50 bg-accent/60" : "border-border bg-background hover:border-muted-foreground/40",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded border transition-colors",
          checked ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 bg-background",
        )}
      >
        {checked && <Check size={13} />}
      </span>
      <span className={cn("leading-snug", checked ? "text-foreground" : "text-muted-foreground")}>{label}</span>
    </button>
  );
}

// ── Numeric inputs ──────────────────────────────────────────────────────────────

/** "25,000", "$25000", " 25000 " → 25000; anything unparsable → null. */
export function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/[$,\s]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value : null;
}

/** "15", "15%", "15.5" → 0.155 as a decimal; unparsable → null. */
export function parsePercent(raw: string): number | null {
  const cleaned = raw.replace(/[%\s]/g, "");
  if (!cleaned) return null;
  const value = Number(cleaned);
  return Number.isFinite(value) ? value / 100 : null;
}

interface NumberFieldProps {
  label:       string;
  value:       string;
  onChange:    (raw: string) => void;
  prefix?:     string;
  suffix?:     string;
  hint?:       string;
  error?:      string;
  optional?:   boolean;
  placeholder?: string;
  /** Extra element rendered under the input (e.g. the "not sure" assumption row). */
  extra?:      React.ReactNode;
}

export function NumberField({
  label, value, onChange, prefix, suffix, hint, error, optional, placeholder, extra,
}: NumberFieldProps) {
  const id = useId();
  return (
    <Field label={label} hint={hint} error={error} optional={optional} htmlFor={id}>
      <div className="relative">
        {prefix && (
          <span aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {prefix}
          </span>
        )}
        <Input
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          inputMode="decimal"
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          className={cn(prefix && "pl-7", suffix && "pr-9", error && "border-destructive")}
        />
        {suffix && (
          <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            {suffix}
          </span>
        )}
      </div>
      {extra}
    </Field>
  );
}

// ── Step progress ───────────────────────────────────────────────────────────────

interface StepProgressProps {
  steps:       string[];
  current:     number;
  maxVisited:  number;
  onJump:      (step: number) => void;
}

export function StepProgress({ steps, current, maxVisited, onJump }: StepProgressProps) {
  return (
    <nav aria-label="Calculator progress">
      <ol className="flex items-center gap-1">
        {steps.map((label, i) => {
          const done = i < current;
          const active = i === current;
          const reachable = i <= maxVisited;
          return (
            <li key={label} className="flex flex-1 flex-col items-stretch gap-1.5">
              <button
                type="button"
                disabled={!reachable}
                onClick={() => reachable && onJump(i)}
                aria-current={active ? "step" : undefined}
                aria-label={`Step ${i + 1}: ${label}${done ? " (completed)" : active ? " (current)" : ""}`}
                className={cn(
                  "group flex flex-col items-stretch gap-1.5 rounded-md px-0.5 py-1",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  reachable ? "cursor-pointer" : "cursor-default",
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "h-1.5 rounded-full transition-colors",
                    active ? "bg-primary" : done ? "bg-primary/50" : "bg-border",
                    reachable && !active && "group-hover:bg-primary/70",
                  )}
                />
                <span
                  className={cn(
                    "hidden truncate text-center text-[10px] font-medium uppercase tracking-wide sm:block",
                    active ? "text-primary" : done ? "text-foreground/70" : "text-muted-foreground/60",
                  )}
                >
                  {label}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-1 text-[11px] text-muted-foreground sm:hidden" aria-hidden="true">
        Step {current + 1} of {steps.length}: {steps[current]}
      </p>
    </nav>
  );
}

// ── Status badge for allocation controls ────────────────────────────────────────

export function StatusBadge({ status }: { status: "below" | "balanced" | "above" }) {
  const map = {
    below:    { label: "Below suggested", cls: "bg-muted text-muted-foreground" },
    balanced: { label: "Balanced",        cls: "bg-accent text-accent-foreground" },
    above:    { label: "Above suggested", cls: "bg-muted text-muted-foreground" },
  } as const;
  const m = map[status];
  return (
    <span className={cn("inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold", m.cls)}>
      {m.label}
    </span>
  );
}
