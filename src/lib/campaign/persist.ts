// ── Campaign Investment Calculator: local persistence ──────────────────────────
// Progress survives a refresh via localStorage (the pattern the other public
// tools in this app use). No personally identifiable information is collected
// anywhere in the calculator, so nothing sensitive lands in storage.
//
// The stored shape is versioned. When the question set changes, old state is
// migrated where the meaning carries over and dropped where it doesn't, and the
// restored position is re-validated so nobody resumes past a question whose
// answer no longer exists.

import type {
  CalculatorAnswers, ReadinessKey, ReadinessState,
} from "./types";

const STORAGE_KEY = "lv-campaign-calculator:v2";
/** Superseded keys, newest first. Read once, migrated, then removed. */
const LEGACY_KEYS = ["lv-campaign-calculator:v1"];

export const EMPTY_READINESS: Record<ReadinessKey, ReadinessState | null> = {
  positioning: null, objectiveOffer: null, message: null,
  channelStrategy: null, campaignPlan: null, visualIdentity: null,
  photography: null, video: null, graphics: null, adCopy: null,
  landingPage: null, leadForm: null, checkoutFlow: null, eventPage: null,
  tracking: null, analytics: null, pixels: null, successMetrics: null,
};

export function emptyAnswers(): CalculatorAnswers {
  return {
    profile: { audienceFocus: null, stage: null, reach: null, industry: "", currency: "USD" },
    objective: null,
    scope: { durationDays: 90, customDuration: false, channels: [], audience: "unknown", timeSensitive: false },
    destination: null,
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

// ── Migration ───────────────────────────────────────────────────────────────────

/** v1 mixed business models with organization types; these carry over cleanly. */
const V1_BUSINESS_TYPE_TO_FOCUS: Record<string, CalculatorAnswers["profile"]["audienceFocus"]> = {
  b2b: "businesses",
  b2c: "consumers",
  ecommerce: "consumers",
  services: "businesses",
  nonprofit: "community",
};

/** v1 industries that map onto the shorter v2 list. Anything else is dropped. */
const V1_INDUSTRY_MAP: Record<string, string> = {
  "Restaurants & food": "Hospitality",
  "Retail & ecommerce": "Ecommerce and retail",
  "Health & wellness": "Healthcare",
  "Professional services": "Professional services",
  "Events & entertainment": "Events and entertainment",
  "Education & nonprofit": "Nonprofit",
  "Home services": "Home services",
  "Other": "Other",
};

/** v1 stored booleans; `true` meant "we have it", which maps to "ready to use". */
const V1_READINESS_TO_STATE = (value: unknown): ReadinessState | null =>
  value === true ? "ready" : value === false ? null : null;

/* eslint-disable @typescript-eslint/no-explicit-any */
function migrateFromV1(parsedAnswers: any): CalculatorAnswers {
  const base = emptyAnswers();
  const profile = parsedAnswers?.profile ?? {};
  const oldReadiness = parsedAnswers?.readiness ?? {};

  const readiness = { ...base.readiness };
  // Keys whose meaning survived the redesign.
  readiness.positioning    = V1_READINESS_TO_STATE(oldReadiness.positioning);
  readiness.message        = V1_READINESS_TO_STATE(oldReadiness.message);
  readiness.visualIdentity = V1_READINESS_TO_STATE(oldReadiness.visualIdentity);
  readiness.photography    = V1_READINESS_TO_STATE(oldReadiness.photography);
  readiness.video          = V1_READINESS_TO_STATE(oldReadiness.video);
  readiness.graphics       = V1_READINESS_TO_STATE(oldReadiness.graphics);
  readiness.adCopy         = V1_READINESS_TO_STATE(oldReadiness.adCopy);
  readiness.landingPage    = V1_READINESS_TO_STATE(oldReadiness.landingPage);
  readiness.tracking       = V1_READINESS_TO_STATE(oldReadiness.tracking);
  // v1's single "captureFlow" covered both a lead form and a checkout flow.
  const captureFlow = V1_READINESS_TO_STATE(oldReadiness.captureFlow);
  readiness.leadForm     = captureFlow;
  readiness.checkoutFlow = captureFlow;

  return {
    ...base,
    profile: {
      ...base.profile,
      audienceFocus: V1_BUSINESS_TYPE_TO_FOCUS[profile.businessType] ?? null,
      stage:    profile.stage ?? null,
      reach:    profile.reach ?? null,
      industry: V1_INDUSTRY_MAP[profile.industry] ?? "",
      currency: profile.currency ?? "USD",
    },
    objective: parsedAnswers?.objective ?? null,
    scope:     { ...base.scope, ...parsedAnswers?.scope },
    readiness,
    financial: { ...base.financial, ...parsedAnswers?.financial },
  };
}

function mergeV2(parsedAnswers: any): CalculatorAnswers {
  const base = emptyAnswers();
  return {
    profile:     { ...base.profile,   ...parsedAnswers.profile },
    objective:   parsedAnswers.objective ?? null,
    scope:       { ...base.scope,     ...parsedAnswers.scope },
    destination: parsedAnswers.destination ?? null,
    readiness:   { ...base.readiness, ...parsedAnswers.readiness },
    financial:   { ...base.financial, ...parsedAnswers.financial },
  };
}
/* eslint-enable @typescript-eslint/no-explicit-any */

// ── Load / save ─────────────────────────────────────────────────────────────────

function readRaw(key: string): unknown | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

/**
 * `validate` is injected (the step validator lives in the UI layer) so this
 * module stays free of component imports. Any step that no longer passes pulls
 * the user back to it rather than letting them resume past a missing answer.
 */
export function loadState(
  validate?: (step: number, answers: CalculatorAnswers) => Record<string, string>,
): PersistedState | null {
  let answers: CalculatorAnswers | null = null;
  let step = 0;
  let phase: PersistedState["phase"] = "intro";

  const current = readRaw(STORAGE_KEY) as Partial<PersistedState> | null;
  if (current && typeof current === "object" && current.answers) {
    answers = mergeV2(current.answers);
    step = typeof current.step === "number" ? current.step : 0;
    phase = current.phase === "results" || current.phase === "steps" ? current.phase : "intro";
  } else {
    for (const legacyKey of LEGACY_KEYS) {
      const legacy = readRaw(legacyKey) as Partial<PersistedState> | null;
      if (!legacy || typeof legacy !== "object" || !legacy.answers) continue;
      answers = migrateFromV1(legacy.answers);
      step = typeof legacy.step === "number" ? legacy.step : 0;
      phase = legacy.phase === "results" || legacy.phase === "steps" ? legacy.phase : "intro";
      try { window.localStorage.removeItem(legacyKey); } catch { /* ignore */ }
      break;
    }
  }

  if (!answers) return null;

  // Re-validate everything the restored position claims to have passed. The
  // first step that fails becomes the resume point, so a schema change can never
  // strand someone on a results screen built from answers they never gave.
  if (validate) {
    const target = phase === "results" ? 6 : step;
    for (let i = 0; i < target; i++) {
      if (Object.keys(validate(i, answers)).length > 0) {
        return { answers, step: i, phase: "steps" };
      }
    }
  }

  return { answers, step, phase };
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
    for (const key of LEGACY_KEYS) window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
