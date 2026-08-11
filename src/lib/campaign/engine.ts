// ── Campaign Investment Calculator: calculation engine ─────────────────────────
// Pure functions only: no React, no DOM, no I/O. Business assumptions live in
// config.ts; this file is the math that consumes them. Comments distinguish
// [ASSUMPTION] (a business judgment worth revisiting) from plain arithmetic.
//
// Base formula:
//   Total investment = Strategy + Creative + Digital + Media + Management + Testing
// Goal-first:
//   Required leads       = customer goal ÷ lead→customer conversion rate
//   Estimated media spend = required leads × cost per lead   (or goal × cost per result)
//   Total investment      = media spend ÷ media share of the allocation
// Break-even:
//   Gross profit per unit = average value × gross margin
//   Break-even units      = total investment ÷ gross profit per unit

import {
  ASSUMPTIONS, CATEGORY_KEYS, CHANNELS,
  CHANNELS_FAVOURING_VIDEO, CHANNELS_REQUIRING_IMAGERY, CHANNELS_REQUIRING_VIDEO,
  CHANNELS_SUPPORTING_VIDEO, CHANNELS_WITH_NATIVE_FORMS, DESTINATIONS,
  DESTINATION_RULES, FEASIBILITY_SCORE_BANDS, READINESS_BANDS,
  READINESS_ITEMS, RELEVANCE_GAP_MULTIPLIER, RELEVANCE_WEIGHTS, SCENARIOS,
  audienceBandMeta, categoryMeta, formatMoney, formatRange, objectiveMeta,
  readinessItemMeta,
  readinessStateMeta, scenarioMeta,
} from "./config";
import {
  affordableChannels, buildRequirements, campaignMonths, channelLabel,
} from "./requirements";
import { PREPARATION_PHASE, RESERVE } from "./config";
import type {
  BalanceNote, BreakEvenResult, CalculationResult, CalculatorAnswers,
  CategoryInsight, CategoryKey, ChannelKey, ComponentAssessment,
  ComponentRelevance, FeasibilityResult, ReadinessKey, ReadinessResult,
  ReadinessState, Range, Requirements, ScenarioKey, ScenarioPlan, ScopeKind,
  Shares,
} from "./types";

// ── Numeric guards ──────────────────────────────────────────────────────────────

export function clamp(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  // Math.min/max resolve ±Infinity to the correct bound on their own.
  return Math.min(max, Math.max(min, value));
}

/** Division that can never produce NaN/Infinity; returns `fallback` instead. */
export function safeDiv(a: number, b: number, fallback = 0): number {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return fallback;
  const out = a / b;
  return Number.isFinite(out) ? out : fallback;
}

/** Coerce a possibly-null user input into a finite number or null. */
function num(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

// ── Readiness score ─────────────────────────────────────────────────────────────

/** Fraction of its weight a component earns. Unanswered is treated as not ready. */
export function stateScore(state: ReadinessState | null): number {
  return state ? readinessStateMeta(state).score : 0;
}

function channelNames(keys: ChannelKey[], selected: ChannelKey[]): string {
  const hits = keys.filter((k) => selected.includes(k))
    .map((k) => CHANNELS.find((c) => c.key === k)?.label ?? k);
  if (hits.length === 0) return "";
  if (hits.length === 1) return hits[0];
  if (hits.length === 2) return `${hits[0]} and ${hits[1]}`;
  return `${hits.slice(0, -1).join(", ")}, and ${hits[hits.length - 1]}`;
}

/**
 * Decides how much each component matters for THIS campaign, from the objective,
 * the channel mix, and where the campaign sends people. Components that don't
 * apply come back as `not-required` and are excluded from the score entirely.
 * All the thresholds behind this live in config.ts. [ASSUMPTION]
 */
export function componentAssessments(answers: CalculatorAnswers): ComponentAssessment[] {
  const channels = answers.scope.channels;
  const destination = answers.destination;
  const isAwareness = answers.objective === "awareness";

  const has = (set: ChannelKey[]) => set.some((k) => channels.includes(k));
  const visualChannels = has(CHANNELS_REQUIRING_IMAGERY) || has(CHANNELS_REQUIRING_VIDEO);

  const out: Record<ReadinessKey, { relevance: ComponentRelevance; reason?: string }> = {
    // ── Campaign foundation: the strategy every campaign runs on ──
    positioning:    { relevance: "essential" },
    objectiveOffer: { relevance: "essential" },
    message:        { relevance: "essential" },
    channelStrategy: channels.length > 1
      ? { relevance: "essential", reason: `Running ${channels.length} channels together needs a plan for how they work as one campaign.` }
      : { relevance: "recommended", reason: "A single channel still benefits from a deliberate plan, but the coordination burden is small." },
    campaignPlan:   { relevance: "essential" },
    visualIdentity: visualChannels
      ? { relevance: "essential", reason: "Your channel mix is visual, so the campaign needs a consistent look." }
      : { relevance: "recommended", reason: "Your channels are mostly text-based, so visual direction matters less here." },

    // ── Creative assets: driven by the channels selected ──
    video: has(CHANNELS_REQUIRING_VIDEO)
      ? { relevance: "essential", reason: `You selected ${channelNames(CHANNELS_REQUIRING_VIDEO, channels)}, making video an important creative requirement for this channel mix.` }
      : has(CHANNELS_FAVOURING_VIDEO)
        ? { relevance: "recommended", reason: `Video typically outperforms static creative on ${channelNames(CHANNELS_FAVOURING_VIDEO, channels)}.` }
        : has(CHANNELS_SUPPORTING_VIDEO)
          ? { relevance: "optional", reason: "Your channels can carry video, but none of them depend on it." }
          : { relevance: "not-required", reason: "None of your selected channels can run video." },
    photography: has(CHANNELS_REQUIRING_IMAGERY)
      ? { relevance: "recommended", reason: `${channelNames(CHANNELS_REQUIRING_IMAGERY, channels)} run on imagery.` }
      : { relevance: "optional" },
    graphics: has(CHANNELS_REQUIRING_IMAGERY)
      ? { relevance: "essential", reason: `${channelNames(CHANNELS_REQUIRING_IMAGERY, channels)} need sized ad creative.` }
      : { relevance: "optional", reason: "Your selected channels are primarily text-based." },
    adCopy: { relevance: "essential", reason: "Every channel needs written copy." },

    // ── Campaign destination: driven by what people should do next ──
    landingPage:  { relevance: "not-required" },
    leadForm:     { relevance: "not-required" },
    checkoutFlow: { relevance: "not-required" },
    eventPage:    { relevance: "not-required" },

    // ── Measurement: performance campaigns need it; awareness benefits from it ──
    analytics:      { relevance: "essential" },
    successMetrics: { relevance: "essential" },
    tracking: destination && destination !== "none"
      ? { relevance: "essential", reason: "Your campaign drives a specific action, so it needs conversion tracking to be evaluated." }
      : { relevance: "recommended", reason: "There is no direct conversion to measure, though tracking still shows what the campaign influenced." },
    pixels: destination && destination !== "none"
      ? { relevance: "essential", reason: "Platform tracking is what lets each channel optimize toward your goal." }
      : { relevance: "recommended" },
  };

  if (destination) {
    for (const [key, relevance] of Object.entries(DESTINATION_RULES[destination])) {
      out[key as ReadinessKey] = { relevance: relevance as ComponentRelevance };
    }
    // A lead campaign running only on channels with native forms can skip the page.
    if (destination === "lead-form" && channels.length > 0 && channels.every((c) => CHANNELS_WITH_NATIVE_FORMS.includes(c))) {
      out.landingPage = {
        relevance: "optional",
        reason: `${channelNames(CHANNELS_WITH_NATIVE_FORMS, channels)} can host the form natively, so a landing page is optional.`,
      };
    }
    const destLabel = DESTINATIONS.find((d) => d.key === destination)?.label.toLowerCase();
    for (const key of ["landingPage", "leadForm", "checkoutFlow", "eventPage"] as ReadinessKey[]) {
      if (out[key].relevance !== "not-required" && !out[key].reason && destLabel) {
        out[key] = { ...out[key], reason: `You chose "${destLabel}" as the campaign destination.` };
      }
    }
  }

  if (isAwareness && !destination) {
    out.landingPage = { relevance: "optional" };
  }

  return READINESS_ITEMS.map((item) => ({
    key:       item.key,
    relevance: out[item.key].relevance,
    reason:    out[item.key].reason,
    state:     answers.readiness[item.key] ?? null,
  }));
}

/**
 * Weighted readiness: only components that apply are counted, essentials weigh
 * most, and "exists but needs review" earns partial credit. An all-or-nothing
 * checklist would penalise a Search campaign for having no video.
 */
export function readinessScore(answers: CalculatorAnswers): ReadinessResult {
  const assessments = componentAssessments(answers);

  let weighted = 0;
  let totalWeight = 0;
  let essentialTotal = 0;
  let essentialReady = 0;
  let needsReview = 0;
  const gaps: { essential: ReadinessKey[]; recommended: ReadinessKey[] } = { essential: [], recommended: [] };

  for (const a of assessments) {
    const weight = RELEVANCE_WEIGHTS[a.relevance];
    if (weight === 0) continue;              // not required: excluded entirely
    const score = stateScore(a.state);
    totalWeight += weight;
    weighted += weight * score;

    if (a.relevance === "essential") {
      essentialTotal += 1;
      if (a.state === "ready") essentialReady += 1;
    }
    if (a.state === "review" || a.state === "unsure") needsReview += 1;
    if (score < 1) {
      if (a.relevance === "essential") gaps.essential.push(a.key);
      else if (a.relevance === "recommended") gaps.recommended.push(a.key);
    }
  }

  const score = totalWeight === 0 ? 0 : clamp(Math.round((weighted / totalWeight) * 100), 0, 100);
  const bandEntry = READINESS_BANDS.find((b) => score >= b.min) ?? READINESS_BANDS[READINESS_BANDS.length - 1];
  return { score, band: bandEntry.band, assessments, essentialTotal, essentialReady, needsReview, gaps };
}

// ── Allocation from requirements ────────────────────────────────────────────────
// Shares are now DERIVED from real dollar requirements rather than driving them.
// The percentages are a view of the plan, not the plan itself.

export function sharesFromAmounts(amounts: Record<CategoryKey, number>): Shares {
  const total = CATEGORY_KEYS.reduce((t, k) => t + Math.max(0, amounts[k]), 0);
  const out = {} as Shares;
  if (total <= 0) {
    for (const key of CATEGORY_KEYS) out[key] = 1 / CATEGORY_KEYS.length;
    return out;
  }
  let acc = 0;
  for (const key of CATEGORY_KEYS) {
    out[key] = Math.max(0, amounts[key]) / total;
    acc += out[key];
  }
  out.media += 1 - acc;   // absorb float drift into the adjustable line
  return out;
}

// ── Rounding ────────────────────────────────────────────────────────────────────

/** Planning-grade rounding: totals shouldn't pretend to be precise. */
export function roundTotal(raw: number): number {
  const v = clamp(raw, 0, ASSUMPTIONS.maxBudget * 2);
  const step = v >= 50_000 ? 500 : v >= 10_000 ? 100 : v >= 2_000 ? 50 : 10;
  return Math.round(v / step) * step;
}

/**
 * Splits `total` across categories so the amounts sum EXACTLY to `total`.
 * Largest-remainder method at a planning-friendly step size.
 */
export function allocationAmounts(total: number, shares: Shares): Record<CategoryKey, number> {
  const out = {} as Record<CategoryKey, number>;
  const safeTotal = clamp(total, 0, ASSUMPTIONS.maxBudget * 2);
  const step = safeTotal >= 10_000 ? 50 : 10;
  const totalUnits = Math.round(safeTotal / step);

  const floors: number[] = [];
  const remainders: { key: CategoryKey; rem: number; idx: number }[] = [];
  let used = 0;
  CATEGORY_KEYS.forEach((key, idx) => {
    const exact = clamp(shares[key], 0, 1) * totalUnits;
    const floor = Math.floor(exact);
    floors[idx] = floor;
    used += floor;
    remainders.push({ key, rem: exact - floor, idx });
  });
  remainders.sort((a, b) => b.rem - a.rem);
  let leftover = totalUnits - used;
  for (const r of remainders) {
    if (leftover <= 0) break;
    floors[r.idx] += 1;
    leftover -= 1;
  }
  CATEGORY_KEYS.forEach((key, idx) => { out[key] = floors[idx] * step; });
  // Guarantee the exact sum even if shares didn't quite total 1.
  const drift = Math.round(safeTotal) - CATEGORY_KEYS.reduce((s, k) => s + out[k], 0);
  if (drift !== 0) out.media = Math.max(0, out.media + drift);
  return out;
}

// ── Manual rebalancing ──────────────────────────────────────────────────────────

const MIN_SHARE = 0.01;

/**
 * Sets one category's share and redistributes the difference across the
 * remaining UNLOCKED categories proportionally to their current sizes.
 * Locked categories never move. The result always sums to 1.
 */
export function rebalanceShares(
  shares: Shares,
  key: CategoryKey,
  nextShare: number,
  locked: CategoryKey[],
): Shares {
  if (locked.includes(key)) return shares;
  const others = CATEGORY_KEYS.filter((k) => k !== key);
  const unlocked = others.filter((k) => !locked.includes(k));
  if (unlocked.length === 0) return shares;

  const lockedSum = others.filter((k) => locked.includes(k)).reduce((s, k) => s + shares[k], 0);
  const maxNext = 1 - lockedSum - MIN_SHARE * unlocked.length;
  const next = clamp(nextShare, MIN_SHARE, Math.max(MIN_SHARE, maxNext));
  const pool = Math.max(0, 1 - lockedSum - next);
  const prevPool = unlocked.reduce((s, k) => s + shares[k], 0);

  const out = { ...shares, [key]: next };
  // Proportional first pass, with the per-category floor applied.
  for (const k of unlocked) {
    const share = prevPool > 0 ? pool * (shares[k] / prevPool) : pool / unlocked.length;
    out[k] = Math.max(MIN_SHARE, share);
  }

  /*
   * Applying the floor can overshoot the pool, which used to leave the set
   * summing to slightly more than 1. Reclaim the excess from whichever
   * categories still have headroom above the floor, largest first, and only
   * fall back to trimming the dragged category if the floors make the target
   * unreachable. The result sums to exactly 1 by construction.
   */
  let drift = unlocked.reduce((s, k) => s + out[k], 0) - pool;
  if (drift > 0) {
    for (const k of [...unlocked].sort((a, b) => out[b] - out[a])) {
      if (drift <= 1e-12) break;
      const take = Math.min(drift, out[k] - MIN_SHARE);
      out[k] -= take;
      drift -= take;
    }
    if (drift > 1e-12) out[key] = Math.max(MIN_SHARE, out[key] - drift);
  } else if (drift < 0) {
    const sink = unlocked.reduce((a, b) => (out[a] >= out[b] ? a : b));
    out[sink] -= drift;
  }

  return out;
}

/**
 * Integer percentages for display that always total exactly 100. Independent
 * rounding of six shares routinely produces 99 or 101, which reads as a bug.
 */
export function displayPercents(shares: Shares): Record<CategoryKey, number> {
  const out = {} as Record<CategoryKey, number>;
  const floors: number[] = [];
  const remainders: { idx: number; rem: number }[] = [];
  let used = 0;
  CATEGORY_KEYS.forEach((key, idx) => {
    const exact = clamp(shares[key], 0, 1) * 100;
    const floor = Math.floor(exact);
    floors[idx] = floor;
    used += floor;
    remainders.push({ idx, rem: exact - floor });
  });
  remainders.sort((a, b) => b.rem - a.rem);
  let leftover = 100 - used;
  for (const r of remainders) {
    if (leftover <= 0) break;
    floors[r.idx] += 1;
    leftover -= 1;
  }
  CATEGORY_KEYS.forEach((key, idx) => { out[key] = floors[idx]; });
  return out;
}

/**
 * Where an adjusted allocation sits relative to the protected minimum. Media is
 * the only freely adjustable line, so it is judged against the recommendation
 * instead.
 */
export function shareStatus(current: number, recommended: number): "below" | "balanced" | "above" {
  const delta = (current - recommended) * 100;
  if (delta < -ASSUMPTIONS.balancedBandPoints) return "below";
  if (delta > ASSUMPTIONS.balancedBandPoints) return "above";
  return "balanced";
}

/**
 * The protected-allocation rule: X_i >= P_i for every protected category.
 * Media may go to zero, but the calculator then has to recalculate what that
 * media can still reach.
 */
export function protectedFloorShare(
  key: CategoryKey, requirements: Requirements, total: number,
): number {
  if (key === "media" || total <= 0) return 0;
  // The lean end of the range: the floor is what the DISPLAYED scenario must
  // fund, never the full-scope requirement shown beside a smaller allocation.
  return clamp(safeDiv(requirements.floors[key].min, total, 0), 0, 1);
}

// ── Goal-first media estimate ───────────────────────────────────────────────────

/**
 * Media dollars needed to pursue `goalUnits` results, given the user's (or the
 * planning-assumption) unit economics. Returns null when inputs are missing.
 */
export function estimateMediaSpend(answers: CalculatorAnswers, goalUnits: number): number | null {
  if (!answers.objective) return null;
  const obj = objectiveMeta(answers.objective);
  const cost = num(answers.financial.costPerResult);
  if (cost === null || cost <= 0) return null;
  const goal = clamp(goalUnits, ASSUMPTIONS.minGoal, ASSUMPTIONS.maxGoal);

  if (obj.perThousand) {
    // Awareness. A CPM prices IMPRESSIONS, not unique people, and a person
    // usually needs several exposures before a brand registers:
    //   required impressions = desired reach x target frequency
    //   media spend          = impressions / 1,000 x CPM
    const frequency = clamp(
      num(answers.financial.targetFrequency) ?? obj.defaultFrequency ?? 3,
      ASSUMPTIONS.minFrequency,
      ASSUMPTIONS.maxFrequency,
    );
    const impressions = goal * frequency;
    return safeDiv(impressions, 1000) * cost;
  }
  if (obj.usesLeadStep) {
    // goal counts customers/sales; leads sit between media and the goal.
    const conv = num(answers.financial.conversionRate);
    if (conv === null || conv <= 0) return null;
    const requiredLeads = safeDiv(goal, clamp(conv, ASSUMPTIONS.minConversion, ASSUMPTIONS.maxConversion));
    return requiredLeads * cost;
  }
  return goal * cost;
}

// ── Break-even ──────────────────────────────────────────────────────────────────

export function breakEven(
  total: number,
  answers: CalculatorAnswers,
  estimatedResults: number | null,
): BreakEvenResult | null {
  const avgValue = num(answers.financial.avgValue);
  const margin = num(answers.financial.marginPct);
  if (avgValue === null || avgValue <= 0 || margin === null || margin <= 0) return null;

  const gpp = avgValue * clamp(margin, ASSUMPTIONS.minMargin, ASSUMPTIONS.maxMargin);
  if (gpp <= 0) return null;
  const obj = answers.objective ? objectiveMeta(answers.objective) : null;
  // Awareness reach can't be priced per unit sold, so skip break-even there.
  if (obj?.perThousand) return null;

  const breakEvenUnits = Math.ceil(safeDiv(total, gpp, 0));
  if (!Number.isFinite(breakEvenUnits) || breakEvenUnits <= 0) return null;

  // For lead objectives the break-even unit is a converted customer, so translate
  // estimated leads through the conversion rate when we have one.
  let goalUnits = estimatedResults;
  let unitNoun = obj?.unitNoun ?? "customers";
  if (obj && !obj.usesLeadStep && obj.key === "leads") {
    const conv = num(answers.financial.conversionRate);
    goalUnits = goalUnits !== null && conv !== null && conv > 0 ? Math.round(goalUnits * conv) : null;
    unitNoun = "customers";
  }

  const projectedRevenue = goalUnits !== null ? goalUnits * avgValue : num(answers.financial.expectedRevenue);
  const projectedGrossProfit = projectedRevenue !== null ? projectedRevenue * margin : null;

  return {
    grossProfitPerUnit: gpp,
    breakEvenUnits,
    unitNoun,
    goalUnits,
    projectedRevenue,
    projectedGrossProfit,
  };
}

// ── Feasibility ─────────────────────────────────────────────────────────────────
// Reports the available investment against BOTH the lean professional minimum
// and the complete selected scope. Conflating the two is what let an
// insufficient budget look like a funded campaign.
//
//   gap_min  = max(0, I_min  - A)
//   gap_full = max(0, I_full - A)

/** Prices one scope for the answers as given. The two scopes never derive from each other. */
export function scopeRequirements(answers: CalculatorAnswers, scope: ScopeKind): Requirements {
  const assessments = componentAssessments(answers);
  const goalMedia = answers.financial.mode === "goal"
    ? estimateMediaSpend(answers, clamp(num(answers.financial.goalCount) ?? 0, 0, ASSUMPTIONS.maxGoal))
    : null;
  return buildRequirements(answers, assessments, "growth", { goalMedia, scope });
}

const gapRange = (required: Range, available: number): Range => ({
  min: Math.max(0, required.min - available),
  max: Math.max(0, required.max - available),
});

export function feasibility(answers: CalculatorAnswers): FeasibilityResult {
  const minimumViable = scopeRequirements(answers, "lean");
  const completeScope = scopeRequirements(answers, "full");
  const available = answers.financial.mode === "budget"
    ? clamp(num(answers.financial.budgetTotal) ?? 0, 0, ASSUMPTIONS.maxBudget)
    : 0;
  const applies = answers.financial.mode === "budget" && available > 0;

  const pMin = minimumViable.protectedTotal;
  const mMin = minimumViable.media;
  const mediaAvailable = Math.max(0, available - pMin.min - minimumViable.reserve.min);
  const funded = affordableChannels(answers.scope.channels, answers.scope.durationDays, mediaAvailable);

  /*
   * Thresholds use the OPTIMISTIC bound of each range, so a budget is only
   * called short when it is short even at the lean end of the market. The copy
   * then hedges with "may", because the range is real uncertainty, not a quote.
   */
  let status: FeasibilityResult["status"] = "scope-supported";
  if (applies) {
    if (available < pMin.min) status = "preparation-only";
    else if (available < pMin.min + mMin.min) status = "campaign-preparation";
    else if (available < completeScope.total.min) status = "focused-pilot";
    else status = "scope-supported";
  }

  const score = completeScope.total.min > 0
    ? clamp(Math.round(safeDiv(available, completeScope.total.min, 0) * 100), 0, 100)
    : 0;
  const scoreLabel = (FEASIBILITY_SCORE_BANDS.find((b) => score >= b.min)
    ?? FEASIBILITY_SCORE_BANDS[FEASIBILITY_SCORE_BANDS.length - 1]).label;

  return {
    status, applies, available, minimumViable, completeScope,
    minimumFundingGap: gapRange(minimumViable.total, available),
    completeScopeFundingGap: gapRange(completeScope.total, available),
    score, scoreLabel, mediaAvailable,
    supportedChannels: funded.length,
    selectedChannels: Math.max(1, answers.scope.channels.length),
  };
}

// ── Scenario construction ───────────────────────────────────────────────────────
// A scenario is a SCOPE. Its estimate is that scope's real requirement range.
// The budget decides which scope is affordable, never what the work costs.

const midpoint = (r: Range) => (r.min + r.max) / 2;

export function buildScenario(
  answers: CalculatorAnswers,
  key: ScenarioKey,
  /** Feasibility, when the caller already has it. Re-derived otherwise. */
  fit?: FeasibilityResult,
): ScenarioPlan {
  const sMeta = scenarioMeta(key);
  const fin = answers.financial;
  const assessments = componentAssessments(answers);
  const scopeFit = fit ?? feasibility(answers);

  let requirements: Requirements;
  let total: number;
  let totalRange: Range;
  let estimatedResults: number | null = null;
  let isPreparationPhase = false;

  if (fin.mode === "budget" && scopeFit.applies) {
    const available = scopeFit.available;

    if (key === "essential") {
      // The affordable plan. Which plan that IS depends on the status, and a
      // preparation sprint is a different deliverable, not a shrunken campaign.
      isPreparationPhase = scopeFit.status === "preparation-only";
      requirements = scopeFit.minimumViable;
      if (scopeFit.status === "scope-supported") {
        // Nothing is constrained, so this is simply the leaner option, priced
        // at what the lean scope costs rather than at the whole budget.
        totalRange = requirements.total;
        total = roundTotal(midpoint(totalRange));
      } else {
        total = roundTotal(available);
        totalRange = isPreparationPhase
          ? { min: available, max: available }
          : requirements.total;
      }
    } else if (key === "growth") {
      // The selected scope. A budget with headroom simply funds more media.
      requirements = scopeFit.completeScope;
      totalRange = requirements.total;
      total = roundTotal(Math.max(available, midpoint(totalRange)));
    } else {
      /*
       * A broader scope carries its own price and is never clamped to the
       * budget, otherwise a generous budget would collapse Growth and Expansion
       * onto the same number and the ladder would stop meaning anything.
       */
      requirements = buildRequirements(answers, assessments, key, { scope: "full" });
      totalRange = requirements.total;
      const growthTotal = roundTotal(Math.max(available, midpoint(scopeFit.completeScope.total)));
      total = roundTotal(Math.max(midpoint(totalRange), growthTotal * 1.25));
    }
  } else {
    const goal = clamp(num(fin.goalCount) ?? 0, 0, ASSUMPTIONS.maxGoal);
    const scenarioGoal = Math.round(goal * sMeta.goalFactor);
    const goalMedia = estimateMediaSpend(answers, scenarioGoal);
    requirements = buildRequirements(answers, assessments, key, { goalMedia, scope: "full" });
    totalRange = requirements.total;
    total = roundTotal(midpoint(totalRange));
    if (goalMedia !== null && goalMedia > 0) estimatedResults = scenarioGoal;
  }

  /*
   * The reserve sits outside the six allocation categories so P + M + R = I
   * holds exactly, whatever the rounding does.
   */
  const allocatable = roundTotal(Math.max(0, total / (1 + RESERVE.rate)));
  const reserveAmount = Math.max(0, total - allocatable);

  let base: Record<CategoryKey, number>;
  let plannedChannels: ChannelKey[] = requirements.activeChannels;

  if (isPreparationPhase) {
    /*
     * Below the lean minimum there is no campaign to allocate. Scaling every
     * category down would imply the whole scope is still deliverable, which is
     * exactly the misrepresentation this model exists to prevent. A preparation
     * sprint funds only what it can honestly deliver, and media stays at zero.
     */
    base = { strategy: 0, creative: 0, digital: 0, media: 0, management: 0, testing: 0 };
    const share = allocatable / PREPARATION_PHASE.categories.length;
    for (const cat of PREPARATION_PHASE.categories) base[cat] = share;
    // Weight the sprint toward strategy; testing holds a small validation reserve.
    base.strategy = allocatable * 0.8;
    base.testing = allocatable * 0.2;
    plannedChannels = [];
  } else {
    /*
     * Media activation is only responsible once the lean protected minimum AND
     * the minimum practical channel media are both funded. Below that the media
     * line is zero: a few hundred dollars cannot run a channel, and showing it
     * as media would imply an activation that will not happen.
     */
    const mediaActivation = fin.mode !== "budget" || !scopeFit.applies
      || scopeFit.status === "focused-pilot" || scopeFit.status === "scope-supported";

    // Price at the midpoint when the plan can carry it, at the lean minimum when
    // it cannot. Either way the protected lines come first.
    const mid = (r: Range) => (r.min + r.max) / 2;
    const midSum = [requirements.strategy, requirements.creative, requirements.digital,
      requirements.media, requirements.management, requirements.testing]
      .reduce((t, r) => t + mid(r), 0);
    const useMid = allocatable >= midSum;
    const pick = (r: Range) => (useMid ? mid(r) : r.min);

    base = {
      strategy:   pick(requirements.strategy),
      creative:   pick(requirements.creative),
      digital:    pick(requirements.digital),
      media:      mediaActivation ? pick(requirements.media) : 0,
      management: pick(requirements.management),
      testing:    pick(requirements.testing),
    };
    if (!mediaActivation) plannedChannels = [];

    const baseTotal = CATEGORY_KEYS.reduce((t, k) => t + base[k], 0);
    const surplus = allocatable - baseTotal;
    if (surplus > 0) {
      if (mediaActivation) base.media += surplus;
      else {
        // No channel to fund, so deepen the protected work instead of inventing
        // a media line the plan cannot activate.
        const protectedSum = baseTotal;
        if (protectedSum > 0) {
          const factor = (protectedSum + surplus) / protectedSum;
          for (const k of CATEGORY_KEYS) if (k !== "media") base[k] *= factor;
        }
      }
    } else if (surplus < 0 && baseTotal > 0) {
      // Media absorbs a shortfall first; protected work is the last thing cut.
      const shortfall = -surplus;
      if (base.media >= shortfall) base.media -= shortfall;
      else {
        const remaining = shortfall - base.media;
        base.media = 0;
        plannedChannels = [];
        const protectedSum = baseTotal - base.media;
        const scale = protectedSum > 0 ? Math.max(0, (protectedSum - remaining) / protectedSum) : 0;
        for (const k of CATEGORY_KEYS) if (k !== "media") base[k] *= scale;
      }
    }
  }

  const shares = sharesFromAmounts(base);
  const amounts = allocationAmounts(allocatable, shares);
  const supported = affordableChannels(answers.scope.channels, answers.scope.durationDays, amounts.media);
  if (supported.length === 0) plannedChannels = [];
  else if (plannedChannels.length > supported.length) plannedChannels = supported;
  const recommendedChannels = Math.min(plannedChannels.length, sMeta.channelCap);

  return {
    key,
    total,
    totalRange,
    reserveAmount,
    shares,
    amounts,
    requirements,
    isPreparationPhase,
    plannedChannels,
    mediaSpend: amounts.media,
    recommendedChannels,
    supportedChannels: supported.length,
    estimatedResults,
    breakEven: breakEven(total, answers, estimatedResults),
  };
}

// ── Category insights (why each allocation moved) ───────────────────────────────

function categoryInsights(answers: CalculatorAnswers): CategoryInsight[] {
  const byCategory = new Map<CategoryKey, string[]>();
  const add = (key: CategoryKey, clause: string) => {
    const list = byCategory.get(key) ?? [];
    list.push(clause);
    byCategory.set(key, list);
  };

  const ready = readinessScore(answers);
  // Only components that actually apply here explain an allocation, and only
  // when they are not already ready.
  for (const a of ready.assessments) {
    if (a.relevance === "not-required" || stateScore(a.state) >= 1) continue;
    add(readinessItemMeta(a.key).affects, readinessItemMeta(a.key).clause);
  }
  const channels = answers.scope.channels.length;
  if (channels >= 4) {
    add("management", `you selected ${channels} advertising channels`);
    add("creative", "each additional channel needs its own creative formats");
  }
  if (answers.scope.durationDays >= 180) add("testing", "longer campaigns earn back a meaningful optimization reserve");
  if (answers.scope.durationDays <= 45 && answers.scope.timeSensitive) add("management", "a short, time-sensitive window compresses production and launch work");
  if (answers.profile.stage === "new") add("strategy", "a new business benefits from firmer positioning before spending on reach");

  if (ready.score >= 85) add("media", "your foundation is largely in place, so more budget can go to distribution");

  return CATEGORY_KEYS.map((key) => ({ key, influences: byCategory.get(key) ?? [] }));
}

// ── Budget-balance notes ────────────────────────────────────────────────────────

/**
 * Structural observations about the CURRENT allocation (which may have been
 * hand-adjusted). Helpful language, not alarms; these are planning prompts.
 */
export function balanceNotes(
  answers: CalculatorAnswers,
  plan: ScenarioPlan,
  currentShares?: Shares,
): BalanceNote[] {
  const shares = currentShares ?? plan.shares;
  const amounts = currentShares ? allocationAmounts(plan.total, currentShares) : plan.amounts;
  const notes: BalanceNote[] = [];
  const ready = readinessScore(answers);
  // "Gap" means an applicable component that is not fully ready.
  const gapKeys = new Set([...ready.gaps.essential, ...ready.gaps.recommended]);
  const gapCreative = ["visualIdentity", "photography", "video", "graphics", "adCopy"]
    .filter((k) => gapKeys.has(k as ReadinessKey)).length;
  const relevanceOf = (key: ReadinessKey) =>
    ready.assessments.find((a) => a.key === key)?.relevance ?? "not-required";

  if (shares.media > 0.55 && (gapCreative >= 2 || gapKeys.has("message"))) {
    notes.push({
      id: "media-heavy", tone: "attention",
      text: `Your current allocation places ${Math.round(shares.media * 100)}% into paid media, but your answers indicate the campaign creative still needs development. Consider strengthening the foundation before increasing media spend.`,
    });
  }
  if (gapKeys.has("tracking") && relevanceOf("tracking") === "essential") {
    notes.push({
      id: "tracking", tone: "attention",
      text: "Conversion tracking isn't ready yet. Without it, media spend can't be evaluated or improved. Your digital-experience allocation reserves room to set it up first.",
    });
  }
  if (gapKeys.has("landingPage") && relevanceOf("landingPage") === "essential") {
    notes.push({
      id: "landing", tone: "attention",
      text: "Your answers indicate the landing page still needs work. Traffic converts at the destination, so this is worth funding before scaling media.",
    });
  }
  const selected = answers.scope.channels.length;
  if (selected > plan.supportedChannels) {
    notes.push({
      id: "channels", tone: "attention",
      text: `You selected ${selected} channels, but the media budget in this scenario comfortably supports about ${plan.supportedChannels}. Fewer channels with real budgets usually beat many channels with thin ones.`,
    });
  }
  if (shares.testing < 0.05) {
    notes.push({
      id: "testing", tone: "info",
      text: "Testing sits below 5% of the plan. A small reserve for experiments is usually what turns a decent campaign into a good one by the second month.",
    });
  }
  if (answers.financial.mode === "goal" && plan.estimatedResults !== null) {
    const required = estimateMediaSpend(answers, plan.estimatedResults);
    if (required !== null && amounts.media < required * 0.85) {
      notes.push({
        id: "goal-gap", tone: "attention",
        text: `Reaching this scenario's goal is estimated to need about ${formatMoney(roundTotal(required))} in media, but the current allocation assigns ${formatMoney(amounts.media)}. Either the goal, the assumptions, or the media share needs another look.`,
      });
    }
  }
  if (answers.scope.durationDays <= 45 && answers.scope.timeSensitive && gapCreative >= 3) {
    notes.push({
      id: "timeline", tone: "info",
      text: "Several creative assets still need production inside a short, fixed window. Building lead time into the plan, or simplifying the launch creative, will protect the schedule.",
    });
  }

  // Realism checks: catch answers that contradict each other before money moves.
  const audienceMax = audienceBandMeta(answers.scope.audience).max;
  const isAwareness = answers.objective === "awareness";
  const goal = answers.financial.mode === "goal" ? (num(answers.financial.goalCount) ?? 0) : 0;
  if (isAwareness && goal > 0 && audienceMax !== null && goal > audienceMax) {
    notes.push({
      id: "reach-vs-audience", tone: "attention", critical: true,
      text: `Your desired reach (${goal.toLocaleString()} people) is larger than the audience size you selected earlier (${audienceBandMeta(answers.scope.audience).label.toLowerCase()}). Review your audience estimate or expand the campaign's geographic market.`,
    });
  }
  if (answers.profile.reach === "local" && answers.scope.audience === "over-1m") {
    notes.push({
      id: "local-vs-scale", tone: "attention", critical: true,
      text: "You described a local market with an audience over 1 million people. That combination is unusual; either the audience estimate includes people outside your service area, or the market reach is broader than local.",
    });
  }
  if (answers.scope.durationDays <= 30 && (answers.scope.audience === "over-1m" || (isAwareness && goal >= 500_000))) {
    notes.push({
      id: "duration-vs-scale", tone: "info",
      text: "Reaching an audience this large inside 30 days concentrates the entire media budget into a very short window. A longer flight usually buys the same reach at a healthier pace, with room to learn.",
    });
  }

  // Attention first, then info; keep the list scannable.
  notes.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "attention" ? -1 : 1));
  return notes.slice(0, 6);
}

// ── Plain-language explanations ─────────────────────────────────────────────────

/** One sentence on how a scenario's total was derived. Shown as "Why this amount?". */
export function scenarioRationale(answers: CalculatorAnswers, plan: ScenarioPlan): string {
  const sMeta = scenarioMeta(plan.key);
  const fin = answers.financial;

  if (fin.mode === "budget") {
    // Scenarios are priced from their scope, so the total does not always equal
    // the stated budget. Describing it by budgetFactor alone contradicted the
    // allocation table whenever the two diverged, so the sentence is built from
    // plan.total and states the difference plainly.
    const budget = num(fin.budgetTotal) ?? 0;
    const total = plan.total;
    const delta = total - budget;
    const withinRounding = Math.abs(delta) <= Math.max(50, budget * 0.02);

    if (budget <= 0 || withinRounding) {
      return `${sMeta.label} allocates ${formatMoney(total)}, rounded for planning.`;
    }
    if (delta > 0) {
      return `${sMeta.label} prices this scope at ${formatMoney(total)}, about ${formatMoney(delta)} above the ${formatMoney(budget)} you stated. That is what the scope costs rather than a suggestion to spend more; the scenarios below show what a smaller one looks like.`;
    }
    return `${sMeta.label} prices this scope at ${formatMoney(total)}, leaving about ${formatMoney(-delta)} of your stated ${formatMoney(budget)} budget uncommitted while the campaign proves itself.`;
  }

  const obj = answers.objective ? objectiveMeta(answers.objective) : null;
  if (!obj || plan.estimatedResults === null) {
    return `${sMeta.label} is sized from your goal and cost assumptions.`;
  }
  const cost = num(fin.costPerResult) ?? obj.defaultCostPerResult;
  if (obj.perThousand) {
    const frequency = clamp(num(fin.targetFrequency) ?? obj.defaultFrequency ?? 3, ASSUMPTIONS.minFrequency, ASSUMPTIONS.maxFrequency);
    const impressions = plan.estimatedResults * frequency;
    return `${sMeta.label} pursues about ${plan.estimatedResults.toLocaleString()} people at a frequency of ${frequency}, or roughly ${impressions.toLocaleString()} impressions at a ${formatMoney(cost)} CPM. That prices media at about ${formatMoney(plan.amounts.media)}, and the full total funds the strategy, creative, and management around it.`;
  }
  const unit = obj.usesLeadStep ? "lead" : obj.unitSingular;
  return `${sMeta.label} pursues about ${plan.estimatedResults.toLocaleString()} ${obj.unitNoun} at an assumed ${formatMoney(cost)} per ${unit}. That prices media at about ${formatMoney(plan.amounts.media)}, and the full total funds the strategy, creative, and management around it.`;
}

/**
 * Short paragraph tying the recommendation to the user's own answers, so the
 * plan reads as a response to them rather than arbitrary percentages.
 */
export function recommendationSummary(answers: CalculatorAnswers, result: CalculationResult): string {
  const ready = result.readiness;
  const channels = answers.scope.channels.length;
  const days = answers.scope.durationDays;
  const essentialGaps = ready.gaps.essential.length;

  const foundation =
    essentialGaps >= 5 ? "still needs most of the pieces it depends on"
    : essentialGaps >= 2 ? "still needs a few key pieces built"
    : essentialGaps === 1 ? "is nearly there, with one piece left to sort out"
    : "already has the pieces it needs";

  const scopeBits: string[] = [];
  scopeBits.push(`targets ${channels} advertising channel${channels === 1 ? "" : "s"}`);
  if (answers.objective === "awareness" && answers.financial.mode === "goal" && num(answers.financial.goalCount)) {
    scopeBits.push(`aims to reach about ${(num(answers.financial.goalCount) ?? 0).toLocaleString()} people`);
  } else if (answers.scope.audience !== "unknown") {
    scopeBits.push(`speaks to an audience of ${audienceBandMeta(answers.scope.audience).label.toLowerCase()}`);
  }
  scopeBits.push(`runs over ${days >= 60 ? `${Math.round(days / 30)} months` : `${days} days`}`);

  const consequence = ready.score < 65
    ? "So we have set aside a real share of the investment for assets, tracking, testing, and running the campaign, before any of it goes to ads. That order matters more than most people expect."
    : "Because the groundwork is largely done, more of the investment can go toward reaching people, while still funding testing and someone to actively run it.";

  return `Your campaign ${foundation}, ${scopeBits.join(", ")}. ${consequence}`;
}

/**
 * Names the levers behind the number, so a large total reads as a set of
 * planning decisions rather than a fixed price.
 */
export function planLevers(answers: CalculatorAnswers, result: CalculationResult): string {
  const drivers: string[] = [];
  const isAwarenessGoal = answers.objective === "awareness" && answers.financial.mode === "goal";
  const goal = num(answers.financial.goalCount) ?? 0;

  if (isAwarenessGoal && goal > 0) drivers.push("the scale of the audience you want to reach");
  else if (answers.scope.audience === "over-1m" || answers.scope.audience === "100k-1m") drivers.push("the size of the audience");
  if (result.readiness.gaps.essential.length >= 2) drivers.push("the fact that essential campaign components still need to be created");
  if (answers.scope.channels.length >= 3) drivers.push("the number of channels selected");

  const levers: string[] = [];
  if (isAwarenessGoal && goal > 0) levers.push("reducing the reach or frequency");
  if (answers.scope.channels.length >= 2) levers.push("narrowing the channel mix");
  if (result.readiness.gaps.essential.length >= 1 || result.readiness.needsReview >= 1) levers.push("using existing campaign assets");
  if (levers.length === 0) levers.push("adjusting the scope");

  // Drivers are all true at once ("and"); levers are alternatives ("or").
  const driverText = drivers.length > 0
    ? `The number comes from ${joinList(drivers, "and")}.`
    : "The number comes from the scope you described.";
  return `${driverText} ${capitalize(joinList(levers, "or"))} would change it, and any of those is a reasonable choice to make.`;
}

function joinList(items: string[], conjunction: "and" | "or" = "and"): string {
  if (items.length === 0) return "";
  if (items.length === 1) return items[0];
  // A pair normally reads "A and B", but when an item already contains its own
  // conjunction ("the reach or frequency") the comma keeps the split clear.
  if (items.length === 2) {
    const needsComma = items.some((i) => / (and|or) /.test(i));
    return `${items[0]}${needsComma ? "," : ""} ${conjunction} ${items[1]}`;
  }
  return `${items.slice(0, -1).join(", ")}, ${conjunction} ${items[items.length - 1]}`;
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Results copy that separates confirmed requirements from possible needs, so a
 * recommended-but-unconfirmed asset never reads as a mandatory purchase.
 */
export function readinessNarrative(result: ReadinessResult): string {
  const bandMeta = READINESS_BANDS.find((b) => b.band === result.band);
  const label = (k: ReadinessKey) => readinessItemMeta(k).label.toLowerCase();

  const parts: string[] = [bandMeta?.summary ?? ""];

  if (result.gaps.essential.length > 0) {
    const names = result.gaps.essential.slice(0, 4).map(label);
    const more = result.gaps.essential.length - names.length;
    // Fold the overflow count into the list so it gets one conjunction, not two.
    const items = more > 0 ? [...names, `${more} more`] : names;
    parts.push(`Based on your answers, ${joinList(items)} need attention before launch.`);
  }
  if (result.gaps.recommended.length > 0) {
    const names = result.gaps.recommended.slice(0, 3).map(label);
    parts.push(
      `${capitalize(joinList(names))} ${names.length === 1 ? "is" : "are"} recommended because of the channels selected, but the exact requirements should be confirmed during campaign planning.`,
    );
  }
  if (result.gaps.essential.length === 0 && result.gaps.recommended.length === 0) {
    parts.push("Nothing essential is outstanding, so the plan leans toward distribution and optimization.");
  }
  return parts.filter(Boolean).join(" ");
}

// ── Full calculation ────────────────────────────────────────────────────────────

export function calculate(answers: CalculatorAnswers): CalculationResult {
  const readiness = readinessScore(answers);
  const fit = feasibility(answers);
  const budgetConstrained = fit.applies && fit.status !== "scope-supported";

  const scenarios = {
    essential: buildScenario(answers, "essential", fit),
    growth:    buildScenario(answers, "growth", fit),
    expansion: buildScenario(answers, "expansion", fit),
  };

  // [ASSUMPTION] Growth is the default recommendation; Essential wins for small
  // stated budgets, where splitting further would spread the plan too thin, and
  // always wins when the budget cannot fund the selected scope.
  let recommendedScenario: ScenarioKey = "growth";
  if (answers.financial.mode === "budget") {
    const budget = num(answers.financial.budgetTotal) ?? 0;
    if (budgetConstrained) recommendedScenario = "essential";
    else if (budget > 0 && budget < ASSUMPTIONS.essentialBudgetCutoff) recommendedScenario = "essential";
  }

  // Contradictions are judged against the recommendation itself. While one is
  // open the UI withholds the "Recommended" badge: endorsing a plan built on an
  // assumption we can already see is wrong would cost the tool its credibility.
  const contradictions = balanceNotes(answers, scenarios[recommendedScenario]).filter((n) => n.critical);

  return {
    readiness, feasibility: fit, scenarios, recommendedScenario,
    insights: categoryInsights(answers), contradictions, budgetConstrained,
  };
}

// ── Feasibility copy ────────────────────────────────────────────────────────────

/** Headline and explanation for the budget-and-scope status. */
export function feasibilityNarrative(answers: CalculatorAnswers, fit: FeasibilityResult): {
  headline: string;
  detail:   string;
} {
  const months = Math.round(campaignMonths(answers.scope.durationDays));
  const duration = months >= 2 ? `${months} months` : `${answers.scope.durationDays} days`;
  const channels = fit.selectedChannels;
  const lean = fit.minimumViable;
  const full = fit.completeScope;

  if (!fit.applies) {
    return {
      headline: "Here is what your goal would take.",
      detail: `You told us the outcome you want, so we worked backwards from it. The full scope you selected estimates at ${formatRange(full.total)}, of which ${formatRange(full.protectedTotal)} is the protected campaign investment that makes the media worth buying.`,
    };
  }

  if (fit.status === "scope-supported") {
    return {
      headline: "Good news: your investment covers the scope you selected.",
      detail: `It supports the estimated ${formatRange(full.total)} for ${channels} channel${channels === 1 ? "" : "s"} over ${duration}. We would still walk through the details with you before anything goes live, because a plan on paper and a plan in market are not quite the same thing.`,
    };
  }
  if (fit.status === "focused-pilot") {
    return {
      headline: "You can start with a focused, one-channel campaign.",
      detail: `A lean professional campaign runs around ${formatRange(lean.total)}, while the full scope you selected is closer to ${formatRange(full.total)}. Starting focused is a perfectly good way in, and the plan below sets out exactly what it includes, what it reuses, and what waits for later.`,
    };
  }
  if (fit.status === "campaign-preparation") {
    return {
      headline: "You can build the foundation now and activate media next.",
      detail: `Your investment can cover the groundwork, but what is left does not yet reach the ${formatRange(lean.media)} a single channel needs over ${duration} to run properly. Splitting the work into two phases is a sensible way to do this well rather than thinly.`,
    };
  }
  return {
    headline: "Let's start with preparation.",
    detail: `Your ${formatMoney(fit.available)} sits below the ${formatRange(lean.total)} a campaign needs to run responsibly, and knowing that now is genuinely useful. It can fund a focused strategy and setup sprint, which is a strong first step. To be clear about what that means: this phase does not include running ads or delivering a complete campaign. For reference, the full scope you selected estimates at ${formatRange(full.total)}.`,
  };
}

export interface FeasibilityPath {
  id:    string;
  title: string;
  text:  string;
}

/** The practical ways forward when the investment cannot fund the selected scope. */
export function feasibilityPaths(answers: CalculatorAnswers, fit: FeasibilityResult): FeasibilityPath[] {
  if (!fit.applies || fit.status === "scope-supported") return [];
  const lean = fit.minimumViable;
  const full = fit.completeScope;
  const cheapest = lean.channelMediaFloors.slice().sort((a, b) => a.amount - b.amount)[0];

  return [
    {
      id: "preparation",
      title: "Start with a strategy sprint",
      text: `We would use the ${formatMoney(fit.available)} to define your objective and audience, recommend the one channel worth starting on, set the core message direction, and build a basic activation plan. Running ads is not part of this phase.`,
    },
    {
      id: "pilot",
      title: "Focus on one channel",
      text: `If you can reuse your existing brand identity, website, and tracking, a lean campaign on a single channel${cheapest ? ` (${channelLabel(cheapest.channel)}, about ${formatMoney(cheapest.amount)} of media)` : ""} comes in around ${formatRange(lean.total)}. Fewer things done properly usually beats more things done thinly.`,
    },
    {
      id: "increase",
      title: "Build up to the full scope",
      text: `The ${fit.selectedChannels}-channel campaign you first described estimates at ${formatRange(full.total)}, of which ${formatRange(full.protectedTotal)} is the work that makes the media worth buying. Worth keeping in view as a target, even if it is not this phase.`,
    },
  ];
}

// ── Shareable text summary ──────────────────────────────────────────────────────

export function buildTextSummary(
  answers: CalculatorAnswers,
  plan: ScenarioPlan,
  currentShares: Shares,
  readiness: ReadinessResult,
): string {
  const amounts = allocationAmounts(plan.total, currentShares);
  const pcts = displayPercents(currentShares);
  const lines: string[] = [];
  lines.push("CAMPAIGN INVESTMENT PLAN (planning estimate)");
  lines.push(`Scenario: ${scenarioMeta(plan.key).label}`);
  lines.push(`Total investment: ${formatMoney(plan.total)}`);
  lines.push("");
  for (const key of CATEGORY_KEYS) {
    lines.push(`${categoryMeta(key).label}: ${formatMoney(amounts[key])} (${pcts[key]}%)`);
  }
  lines.push("");
  lines.push(`Your starting point: ${readiness.score}/100`);
  if (plan.breakEven) {
    lines.push(`Break-even: about ${plan.breakEven.breakEvenUnits.toLocaleString()} ${plan.breakEven.unitNoun}`);
  }
  lines.push("");
  lines.push("Estimates depend on the assumptions entered and do not guarantee campaign performance.");
  lines.push("Built with the LV Branding Campaign Investment Calculator · lvbranding.com");
  return lines.join("\n");
}
