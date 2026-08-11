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
import { narrativesFor, type Lang } from "./copy";
import { copyFor } from "./copy/resolve";
import { channelLabelOf, destinationLabelOf, readinessClause } from "./localized";
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

function channelNames(keys: ChannelKey[], selected: ChannelKey[], lang: Lang = "en"): string {
  const hits = keys.filter((k) => selected.includes(k)).map((k) => channelLabelOf(k, lang));
  return narrativesFor(lang).reasons.joinChannels(hits);
}

/**
 * Decides how much each component matters for THIS campaign, from the objective,
 * the channel mix, and where the campaign sends people. Components that don't
 * apply come back as `not-required` and are excluded from the score entirely.
 * All the thresholds behind this live in config.ts. [ASSUMPTION]
 */
export function componentAssessments(answers: CalculatorAnswers, lang: Lang = "en"): ComponentAssessment[] {
  const r = narrativesFor(lang).reasons;
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
      ? { relevance: "essential", reason: r.channelStrategyMulti(channels.length) }
      : { relevance: "recommended", reason: r.channelStrategySingle },
    campaignPlan:   { relevance: "essential" },
    visualIdentity: visualChannels
      ? { relevance: "essential", reason: r.visualIdentityVisual }
      : { relevance: "recommended", reason: r.visualIdentityText },

    // ── Creative assets: driven by the channels selected ──
    video: has(CHANNELS_REQUIRING_VIDEO)
      ? { relevance: "essential", reason: r.videoRequired(channelNames(CHANNELS_REQUIRING_VIDEO, channels, lang)) }
      : has(CHANNELS_FAVOURING_VIDEO)
        ? { relevance: "recommended", reason: r.videoFavoured(channelNames(CHANNELS_FAVOURING_VIDEO, channels, lang)) }
        : has(CHANNELS_SUPPORTING_VIDEO)
          ? { relevance: "optional", reason: r.videoOptional }
          : { relevance: "not-required", reason: r.videoNotRequired },
    photography: has(CHANNELS_REQUIRING_IMAGERY)
      ? { relevance: "recommended", reason: r.photographyImagery(channelNames(CHANNELS_REQUIRING_IMAGERY, channels, lang)) }
      : { relevance: "optional" },
    graphics: has(CHANNELS_REQUIRING_IMAGERY)
      ? { relevance: "essential", reason: r.graphicsImagery(channelNames(CHANNELS_REQUIRING_IMAGERY, channels, lang)) }
      : { relevance: "optional", reason: r.graphicsTextBased },
    adCopy: { relevance: "essential", reason: r.adCopyAlways },

    // ── Campaign destination: driven by what people should do next ──
    landingPage:  { relevance: "not-required" },
    leadForm:     { relevance: "not-required" },
    checkoutFlow: { relevance: "not-required" },
    eventPage:    { relevance: "not-required" },

    // ── Measurement: performance campaigns need it; awareness benefits from it ──
    analytics:      { relevance: "essential" },
    successMetrics: { relevance: "essential" },
    tracking: destination && destination !== "none"
      ? { relevance: "essential", reason: r.trackingAction }
      : { relevance: "recommended", reason: r.trackingAwareness },
    pixels: destination && destination !== "none"
      ? { relevance: "essential", reason: r.pixelsAction }
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
        reason: r.nativeForms(channelNames(CHANNELS_WITH_NATIVE_FORMS, channels, lang)),
      };
    }
    const destLabel = destinationLabelOf(destination, lang)?.toLowerCase();
    for (const key of ["landingPage", "leadForm", "checkoutFlow", "eventPage"] as ReadinessKey[]) {
      if (out[key].relevance !== "not-required" && !out[key].reason && destLabel) {
        out[key] = { ...out[key], reason: r.destinationChosen(destLabel) };
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
export function readinessScore(answers: CalculatorAnswers, lang: Lang = "en"): ReadinessResult {
  const assessments = componentAssessments(answers, lang);

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
export function scopeRequirements(answers: CalculatorAnswers, scope: ScopeKind, lang: Lang = "en"): Requirements {
  const assessments = componentAssessments(answers, lang);
  const goalMedia = answers.financial.mode === "goal"
    ? estimateMediaSpend(answers, clamp(num(answers.financial.goalCount) ?? 0, 0, ASSUMPTIONS.maxGoal))
    : null;
  return buildRequirements(answers, assessments, "growth", { goalMedia, scope });
}

const gapRange = (required: Range, available: number): Range => ({
  min: Math.max(0, required.min - available),
  max: Math.max(0, required.max - available),
});

export function feasibility(answers: CalculatorAnswers, lang: Lang = "en"): FeasibilityResult {
  const minimumViable = scopeRequirements(answers, "lean", lang);
  const completeScope = scopeRequirements(answers, "full", lang);
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
  // The band is chosen from the model; only its wording comes from the language.
  const bandIndex = Math.max(0, FEASIBILITY_SCORE_BANDS.findIndex((b) => score >= b.min));
  const scoreLabel = copyFor(lang).feasibilityScoreLabels[bandIndex]
    ?? FEASIBILITY_SCORE_BANDS[bandIndex].label;

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
  lang: Lang = "en",
): ScenarioPlan {
  const sMeta = scenarioMeta(key);
  const fin = answers.financial;
  const assessments = componentAssessments(answers, lang);
  const scopeFit = fit ?? feasibility(answers, lang);

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

function categoryInsights(answers: CalculatorAnswers, lang: Lang = "en"): CategoryInsight[] {
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
    add(readinessItemMeta(a.key).affects, readinessClause(a.key, lang));
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
  lang: Lang = "en",
): BalanceNote[] {
  // Which notes fire is logic and stays here; how they are worded belongs to
  // the language, so the text comes from the narrative layer.
  const t = narrativesFor(lang).balance;
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
      text: t.mediaHeavy(Math.round(shares.media * 100)),
    });
  }
  if (gapKeys.has("tracking") && relevanceOf("tracking") === "essential") {
    notes.push({
      id: "tracking", tone: "attention",
      text: t.tracking,
    });
  }
  if (gapKeys.has("landingPage") && relevanceOf("landingPage") === "essential") {
    notes.push({
      id: "landing", tone: "attention",
      text: t.landing,
    });
  }
  const selected = answers.scope.channels.length;
  if (selected > plan.supportedChannels) {
    notes.push({
      id: "channels", tone: "attention",
      text: t.channels(selected, plan.supportedChannels),
    });
  }
  if (shares.testing < 0.05) {
    notes.push({
      id: "testing", tone: "info",
      text: t.testing,
    });
  }
  if (answers.financial.mode === "goal" && plan.estimatedResults !== null) {
    const required = estimateMediaSpend(answers, plan.estimatedResults);
    if (required !== null && amounts.media < required * 0.85) {
      notes.push({
        id: "goal-gap", tone: "attention",
        text: t.goalGap(formatMoney(roundTotal(required)), formatMoney(amounts.media)),
      });
    }
  }
  if (answers.scope.durationDays <= 45 && answers.scope.timeSensitive && gapCreative >= 3) {
    notes.push({
      id: "timeline", tone: "info",
      text: t.timeline,
    });
  }

  // Realism checks: catch answers that contradict each other before money moves.
  const audienceMax = audienceBandMeta(answers.scope.audience).max;
  const isAwareness = answers.objective === "awareness";
  const goal = answers.financial.mode === "goal" ? (num(answers.financial.goalCount) ?? 0) : 0;
  if (isAwareness && goal > 0 && audienceMax !== null && goal > audienceMax) {
    notes.push({
      id: "reach-vs-audience", tone: "attention", critical: true,
      text: t.reachVsAudience(goal, audienceBandMeta(answers.scope.audience).label),
    });
  }
  if (answers.profile.reach === "local" && answers.scope.audience === "over-1m") {
    notes.push({
      id: "local-vs-scale", tone: "attention", critical: true,
      text: t.localVsScale,
    });
  }
  if (answers.scope.durationDays <= 30 && (answers.scope.audience === "over-1m" || (isAwareness && goal >= 500_000))) {
    notes.push({
      id: "duration-vs-scale", tone: "info",
      text: t.durationVsScale,
    });
  }

  // Attention first, then info; keep the list scannable.
  notes.sort((a, b) => (a.tone === b.tone ? 0 : a.tone === "attention" ? -1 : 1));
  return notes.slice(0, 6);
}

// ── Plain-language explanations ─────────────────────────────────────────────────

/** One sentence on how a scenario's total was derived. Shown as "Why this amount?". */
export function scenarioRationale(
  answers: CalculatorAnswers, plan: ScenarioPlan, lang: Lang = "en",
): string {
  return narrativesFor(lang).scenarioRationale(answers, plan);
}

/**
 * Short paragraph tying the recommendation to the user's own answers, so the
 * plan reads as a response to them rather than arbitrary percentages.
 */
export function recommendationSummary(
  answers: CalculatorAnswers, result: CalculationResult, lang: Lang = "en",
): string {
  return narrativesFor(lang).recommendationSummary(answers, result);
}

/**
 * Names the levers behind the number, so a large total reads as a set of
 * planning decisions rather than a fixed price.
 */
export function planLevers(
  answers: CalculatorAnswers, result: CalculationResult, lang: Lang = "en",
): string {
  return narrativesFor(lang).planLevers(answers, result);
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
export function readinessNarrative(
  result: ReadinessResult, lang: Lang = "en",
): string {
  return narrativesFor(lang).readiness(result);
}

// ── Full calculation ────────────────────────────────────────────────────────────

export function calculate(answers: CalculatorAnswers, lang: Lang = "en"): CalculationResult {
  const readiness = readinessScore(answers);
  const fit = feasibility(answers, lang);
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
  const contradictions = balanceNotes(answers, scenarios[recommendedScenario], undefined, lang).filter((n) => n.critical);

  return {
    readiness, feasibility: fit, scenarios, recommendedScenario,
    insights: categoryInsights(answers, lang), contradictions, budgetConstrained,
  };
}

// ── Feasibility copy ────────────────────────────────────────────────────────────

/** Headline and explanation for the budget-and-scope status. */
export function feasibilityNarrative(
  answers: CalculatorAnswers,
  fit: FeasibilityResult,
  lang: Lang = "en",
): { headline: string; detail: string } {
  return narrativesFor(lang).feasibility(answers, fit);
}

export interface FeasibilityPath {
  id:    string;
  title: string;
  text:  string;
}

/** The practical ways forward when the investment cannot fund the selected scope. */
export function feasibilityPaths(
  answers: CalculatorAnswers,
  fit: FeasibilityResult,
  lang: Lang = "en",
): FeasibilityPath[] {
  return narrativesFor(lang).paths(answers, fit);
}

// ── Shareable text summary ──────────────────────────────────────────────────────

export function buildTextSummary(
  answers: CalculatorAnswers,
  plan: ScenarioPlan,
  currentShares: Shares,
  readiness: ReadinessResult,
  lang: Lang = "en",
): string {
  const n = narrativesFor(lang).summary;
  const amounts = allocationAmounts(plan.total, currentShares);
  const pcts = displayPercents(currentShares);
  const lines: string[] = [];
  lines.push(n.title);
  lines.push(`${scenarioMeta(plan.key).label}`);
  lines.push(`${n.total}: ${formatMoney(plan.total)}`);
  lines.push("");
  for (const key of CATEGORY_KEYS) {
    lines.push(`${categoryMeta(key).label}: ${formatMoney(amounts[key])} (${pcts[key]}%)`);
  }
  lines.push("");
  lines.push(`${n.startingPoint}: ${readiness.score}/100`);
  if (plan.breakEven) {
    lines.push(`Break-even: about ${plan.breakEven.breakEvenUnits.toLocaleString()} ${plan.breakEven.unitNoun}`);
  }
  lines.push("");
  lines.push(n.disclaimer);
  lines.push("Built with the LV Branding Campaign Investment Calculator · lvbranding.com");
  return lines.join("\n");
}
