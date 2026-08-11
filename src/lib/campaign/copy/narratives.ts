// ── Narrative contract ──────────────────────────────────────────────────────────
// The engine computes; this speaks. Every sentence the calculator composes at
// runtime is declared here and implemented once per language.
//
// The split matters for Spanish. These sentences interleave numbers with nouns,
// and Spanish agreement follows the number ("1 canal" / "3 canales") and the
// noun's gender ("el plan completo" / "la campaña completa"). A shared template
// with placeholders cannot express that, so each language writes its own
// sentence from the same computed inputs.
//
// Inputs are already-formatted strings wherever money or ranges are involved,
// because the engine owns the arithmetic and the locale owns the words.

import type {
  CalculatorAnswers, CalculationResult, FeasibilityResult, ReadinessResult,
  ScenarioPlan,
} from "../types";

export interface FeasibilityCopy { headline: string; detail: string }
export interface PathCopy { id: string; title: string; text: string }

/** Text for each balance note. The engine decides which fire; this words them. */
export interface BalanceCopy {
  mediaHeavy:      (mediaPct: number) => string;
  tracking:        string;
  landing:         string;
  channels:        (selected: number, supported: number) => string;
  testing:         string;
  goalGap:         (required: string, allocated: string) => string;
  timeline:        string;
  reachVsAudience: (goal: number, audienceLabel: string) => string;
  localVsScale:    string;
  durationVsScale: string;
}

export interface Narratives {
  feasibility:           (a: CalculatorAnswers, fit: FeasibilityResult) => FeasibilityCopy;
  paths:                 (a: CalculatorAnswers, fit: FeasibilityResult) => PathCopy[];
  scenarioRationale:     (a: CalculatorAnswers, plan: ScenarioPlan) => string;
  recommendationSummary: (a: CalculatorAnswers, r: CalculationResult) => string;
  planLevers:            (a: CalculatorAnswers, r: CalculationResult) => string;
  readiness:             (r: ReadinessResult) => string;
  balance:               BalanceCopy;
  /** Header lines for the clipboard summary. */
  summary: {
    title:        string;
    objective:    string;
    duration:     string;
    channels:     string;
    startingPoint:string;
    allocation:   string;
    total:        string;
    reserve:      string;
    disclaimer:   string;
  };
}
