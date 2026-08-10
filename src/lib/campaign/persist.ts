// ── Campaign Investment Calculator: local persistence ──────────────────────────
// Progress survives a refresh via localStorage (the pattern the other public
// tools in this app use). No personally identifiable information is collected
// anywhere in the calculator, so nothing sensitive lands in storage.

import type { CalculatorAnswers, ReadinessKey } from "./types";

const STORAGE_KEY = "lv-campaign-calculator:v1";

export const EMPTY_READINESS: Record<ReadinessKey, boolean> = {
  positioning: false, message: false, visualIdentity: false, photography: false,
  video: false, graphics: false, adCopy: false, landingPage: false,
  captureFlow: false, tracking: false,
};

export function emptyAnswers(): CalculatorAnswers {
  return {
    profile: { audienceFocus: null, stage: null, reach: null, industry: "", currency: "USD" },
    objective: null,
    scope: { durationDays: 90, customDuration: false, channels: [], audience: "unknown", timeSensitive: false },
    readiness: { ...EMPTY_READINESS },
    financial: {
      mode: "budget",
      budgetTotal: null, expectedRevenue: null, goalCount: null,
      avgValue: null, conversionRate: null, costPerResult: null,
      targetFrequency: null, marginPct: null,
      assumedConversion: false, assumedCostPerResult: false, assumedFrequency: false,
    },
  };
}

export interface PersistedState {
  answers: CalculatorAnswers;
  step:    number;
  phase:   "intro" | "steps" | "results";
}

export function loadState(): PersistedState | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PersistedState>;
    if (!parsed || typeof parsed !== "object" || !parsed.answers) return null;
    // Merge over the empty shape so newly added fields get safe defaults.
    const base = emptyAnswers();
    return {
      answers: {
        profile:   { ...base.profile,   ...parsed.answers.profile },
        objective: parsed.answers.objective ?? null,
        scope:     { ...base.scope,     ...parsed.answers.scope },
        readiness: { ...base.readiness, ...parsed.answers.readiness },
        financial: { ...base.financial, ...parsed.answers.financial },
      },
      step:  typeof parsed.step === "number" ? parsed.step : 0,
      phase: parsed.phase === "results" || parsed.phase === "steps" ? parsed.phase : "intro",
    };
  } catch {
    return null;
  }
}

export function saveState(state: PersistedState): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage full or unavailable. The calculator still works; it just won't
    // survive a refresh. Not worth interrupting the user for.
  }
}

export function clearState(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
}
