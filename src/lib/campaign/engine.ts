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
  DESTINATION_RULES, FEASIBILITY_SCORE_BANDS, READINESS_BANDS, RESERVE,
  READINESS_ITEMS, RELEVANCE_GAP_MULTIPLIER, RELEVANCE_WEIGHTS, SCENARIOS,
  audienceBandMeta, categoryMeta, formatMoney, objectiveMeta, readinessItemMeta,
  readinessStateMeta, scenarioMeta,
} from "./config";
import {
  affordableChannels, buildRequirements, campaignMonths, channelLabel,
} from "./requirements";
import type {
  BalanceNote, BreakEvenResult, CalculationResult, CalculatorAnswers,
  CategoryInsight, CategoryKey, ChannelKey, ComponentAssessment,
  ComponentRelevance, FeasibilityResult, ReadinessKey, ReadinessResult,
  ReadinessState, Requirements, ScenarioKey, ScenarioPlan, Shares,
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
  return clamp(safeDiv(requirements.floors[key], total, 0), 0, 1);
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
// Budget-first asks two questions. The requirements model answers the first
// ("what does this campaign actually cost?"); this answers the second ("can the
// available budget do that job, and if not, what can it do?").
//
//   P             = S_min + B_min + D_min + G_min + T_min
//   M_available   = max(0, A - P - R)
//   Funding gap   = I_required - A
//   F_budget      = min(100, A / I_required x 100)

/** The requirements for the scope the user actually selected, at Growth scope. */
export function selectedScopeRequirements(answers: CalculatorAnswers): Requirements {
  const assessments = componentAssessments(answers);
  const goalMedia = answers.financial.mode === "goal"
    ? estimateMediaSpend(answers, clamp(num(answers.financial.goalCount) ?? 0, 0, ASSUMPTIONS.maxGoal))
    : null;
  return buildRequirements(answers, assessments, "growth", { goalMedia });
}

export function feasibility(answers: CalculatorAnswers): FeasibilityResult {
  const requirements = selectedScopeRequirements(answers);
  const budget = answers.financial.mode === "budget"
    ? clamp(num(answers.financial.budgetTotal) ?? 0, 0, ASSUMPTIONS.maxBudget)
    : 0;
  const applies = answers.financial.mode === "budget" && budget > 0;

  const P = requirements.protectedTotal;
  const R = requirements.reserve;
  const mediaAvailable = Math.max(0, budget - P - R);
  const fundingGap = requirements.total - budget;
  const selectedChannels = Math.max(1, answers.scope.channels.length);
  const funded = affordableChannels(answers.scope.channels, answers.scope.durationDays, mediaAvailable);

  const score = requirements.total > 0
    ? clamp(Math.round(safeDiv(budget, requirements.total, 0) * 100), 0, 100)
    : 0;
  const scoreLabel = (FEASIBILITY_SCORE_BANDS.find((b) => score >= b.min)
    ?? FEASIBILITY_SCORE_BANDS[FEASIBILITY_SCORE_BANDS.length - 1]).label;

  // The detailed rules decide the status; the score is a separate read.
  const allChannelFloors = requirements.channelMediaFloors.reduce((t, f) => t + f.amount, 0);
  let status: FeasibilityResult["status"] = "supported";
  if (applies) {
    if (budget < P) status = "foundation-only";
    else if (budget < P + requirements.singleChannelFloor) status = "preparation";
    else if (budget < P + allChannelFloors) status = "pilot";
    else status = "supported";
  }

  return {
    status, applies, budget, score, scoreLabel, requirements,
    mediaAvailable, fundingGap,
    supportedChannels: funded.length,
    selectedChannels,
  };
}

// ── Scenario construction ───────────────────────────────────────────────────────
// A scenario is a SCOPE, and its total is that scope's real requirement. The
// budget no longer decides the plan; it decides which scope is affordable.

export function buildScenario(
  answers: CalculatorAnswers,
  key: ScenarioKey,
  /** Feasibility, when the caller already has it. Re-derived otherwise. */
  fit?: FeasibilityResult,
): ScenarioPlan {
  const sMeta = scenarioMeta(key);
  const fin = answers.financial;
  const assessments = componentAssessments(answers);
  const selectedChannels = answers.scope.channels;

  let requirements: Requirements;
  let total: number;
  let estimatedResults: number | null = null;
  let plannedChannels: ChannelKey[] = selectedChannels.length > 0 ? selectedChannels : ["google-search"];

  if (fin.mode === "budget") {
    const budget = clamp(num(fin.budgetTotal) ?? 0, 0, ASSUMPTIONS.maxBudget);
    const scopeFit = fit ?? feasibility(answers);
    const constrained = scopeFit.applies && scopeFit.status !== "supported";

    if (constrained && key === "essential") {
      /*
       * The focused pilot is a genuine reduction in scope, not a smaller number:
       * cost the protected requirements first, then fund only the channels the
       * remainder can actually carry. Two passes, because the protected total
       * itself depends on the channel count through creative adaptations and
       * management complexity.
       */
      let channels = plannedChannels;
      for (let pass = 0; pass < 2; pass++) {
        const draft = buildRequirements(answers, assessments, key, { channels });
        const available = Math.max(0, budget - draft.protectedTotal - draft.reserve);
        const affordable = affordableChannels(plannedChannels, answers.scope.durationDays, available);
        channels = affordable.length > 0 ? affordable : plannedChannels.slice(0, 1);
      }
      plannedChannels = channels;
      requirements = buildRequirements(answers, assessments, key, { channels });
      // Spend the whole budget: withholding a fraction of an insufficient budget
      // helps nobody, and promising more than the budget would be dishonest.
      total = roundTotal(budget);
    } else if (constrained) {
      // Show what the selected scope genuinely costs, not a budget multiple.
      requirements = buildRequirements(answers, assessments, key);
      total = roundTotal(requirements.total);
    } else {
      // The budget covers the requirement, so any surplus buys more reach.
      requirements = buildRequirements(answers, assessments, key);
      total = roundTotal(Math.max(requirements.total, budget * sMeta.budgetFactor));
    }
  } else {
    const goal = clamp(num(fin.goalCount) ?? 0, 0, ASSUMPTIONS.maxGoal);
    const scenarioGoal = Math.round(goal * sMeta.goalFactor);
    const goalMedia = estimateMediaSpend(answers, scenarioGoal);
    requirements = buildRequirements(answers, assessments, key, { goalMedia });
    total = roundTotal(requirements.total);
    if (goalMedia !== null && goalMedia > 0) estimatedResults = scenarioGoal;
  }

  /*
   * The reserve sits OUTSIDE the six allocation categories, so the presentation
   * can hold to I = P + M + R. Since R = r_R x (P + M), the reserve inside any
   * total is total x r_R / (1 + r_R), which keeps the three displayed figures
   * adding up exactly whatever the total turns out to be.
   */
  const allocatable = roundTotal(Math.max(0, total / (1 + RESERVE.rate)));
  // Defined as the remainder rather than recomputed, so P + M + R equals the
  // total exactly no matter how the allocation rounding lands.
  const reserveAmount = Math.max(0, total - allocatable);

  // Amounts start at the protected minimums. Anything left over flows to media,
  // the line that buys more reach.
  const base: Record<CategoryKey, number> = {
    strategy:   requirements.strategy,
    creative:   requirements.creative,
    digital:    requirements.digital,
    media:      requirements.media,
    management: requirements.management,
    testing:    requirements.testing,
  };
  const baseTotal = CATEGORY_KEYS.reduce((t, k) => t + base[k], 0);
  const surplus = allocatable - baseTotal;
  if (surplus > 0) {
    base.media += surplus;
  } else if (surplus < 0 && baseTotal > 0) {
    // Budget below the requirement: media absorbs the shortfall first, because
    // the protected lines are the work the campaign depends on. Only once media
    // is exhausted do the protected lines scale, and the feasibility panel then
    // says plainly that the foundation itself is underfunded.
    const shortfall = -surplus;
    if (base.media >= shortfall) {
      base.media -= shortfall;
    } else {
      const remaining = shortfall - base.media;
      base.media = 0;
      const protectedTotal = baseTotal - requirements.media;
      const scale = protectedTotal > 0 ? Math.max(0, (protectedTotal - remaining) / protectedTotal) : 0;
      for (const k of CATEGORY_KEYS) if (k !== "media") base[k] *= scale;
    }
  }

  const shares = sharesFromAmounts(base);
  const amounts = allocationAmounts(allocatable, shares);
  const supported = affordableChannels(selectedChannels, answers.scope.durationDays, amounts.media);
  // Never claim a channel the media line cannot actually fund.
  if (supported.length === 0) plannedChannels = [];
  else if (plannedChannels.length > supported.length) plannedChannels = supported;
  const recommendedChannels = Math.min(plannedChannels.length, sMeta.channelCap);

  return {
    key,
    total,
    reserveAmount,
    shares,
    amounts,
    requirements,
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
    const budget = num(fin.budgetTotal) ?? 0;
    const pct = Math.round(sMeta.budgetFactor * 100);
    if (pct === 100) return `${sMeta.label} allocates your full stated budget of ${formatMoney(budget)}, rounded for planning.`;
    if (pct < 100) return `${sMeta.label} plans around ${pct}% of your stated ${formatMoney(budget)} budget, holding the rest in reserve while the campaign proves itself.`;
    return `${sMeta.label} models stretching about ${pct - 100}% beyond your stated budget, for when the campaign earns a bigger footprint.`;
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
    essentialGaps >= 5 ? "still needs most of the components it depends on"
    : essentialGaps >= 2 ? "still needs several essential components developed"
    : essentialGaps === 1 ? "is close to ready, with one essential component left"
    : "has the components it needs in place";

  const scopeBits: string[] = [];
  scopeBits.push(`targets ${channels} advertising channel${channels === 1 ? "" : "s"}`);
  if (answers.objective === "awareness" && answers.financial.mode === "goal" && num(answers.financial.goalCount)) {
    scopeBits.push(`aims to reach about ${(num(answers.financial.goalCount) ?? 0).toLocaleString()} people`);
  } else if (answers.scope.audience !== "unknown") {
    scopeBits.push(`speaks to an audience of ${audienceBandMeta(answers.scope.audience).label.toLowerCase()}`);
  }
  scopeBits.push(`runs over ${days >= 60 ? `${Math.round(days / 30)} months` : `${days} days`}`);

  const consequence = ready.score < 65
    ? "For that reason, a meaningful portion of the investment is reserved for assets, digital infrastructure, testing, and campaign management before media is activated."
    : "With the foundation largely in place, more of the investment can flow to paid media while keeping testing and active management funded.";

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
    ? `This scenario reflects ${joinList(drivers, "and")}.`
    : "This scenario reflects the scope you described.";
  return `${driverText} ${capitalize(joinList(levers, "or"))} would change the recommendation.`;
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
  const budgetConstrained = fit.applies && fit.status !== "supported";

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
  const req = fit.requirements;

  if (!fit.applies) {
    return {
      headline: "Scope and budget are sized from your goal.",
      detail: `In goal-first mode the investment is derived from what you want to achieve. This scope prices at about ${formatMoney(req.total)}: ${formatMoney(req.protectedTotal)} of protected campaign investment plus ${formatMoney(req.media)} of media.`,
    };
  }

  if (fit.status === "supported") {
    return {
      headline: "Scope supported.",
      detail: `The available investment can support the protected campaign requirements (${formatMoney(req.protectedTotal)}) and the selected media mix across ${channels} channel${channels === 1 ? "" : "s"} over ${duration}.`,
    };
  }
  if (fit.status === "pilot") {
    return {
      headline: "Focused pilot.",
      detail: `Your budget can support a reduced channel mix, but not every channel originally selected. After the ${formatMoney(req.protectedTotal)} of protected campaign requirements, about ${formatMoney(fit.mediaAvailable)} remains for media, which funds ${fit.supportedChannels} of your ${channels} selected channel${channels === 1 ? "" : "s"} over ${duration}.`,
    };
  }
  if (fit.status === "preparation") {
    return {
      headline: "Campaign preparation.",
      detail: `The campaign foundation can be developed, but the remaining budget does not support responsible media activation. The protected requirements come to ${formatMoney(req.protectedTotal)}, and the cheapest single channel needs about ${formatMoney(req.singleChannelFloor)} of media over ${duration}.`,
    };
  }
  return {
    headline: "Foundation phase only.",
    detail: `Your available investment does not currently fund all essential campaign requirements and media activation. The protected campaign investment alone is about ${formatMoney(req.protectedTotal)}, against a stated budget of ${formatMoney(fit.budget)}. Delivering the full selected scope is closer to ${formatMoney(req.total)}.`,
  };
}

export interface FeasibilityPath {
  id:    string;
  title: string;
  text:  string;
}

/** The three practical ways forward when the budget cannot fund the scope. */
export function feasibilityPaths(answers: CalculatorAnswers, fit: FeasibilityResult): FeasibilityPath[] {
  if (!fit.applies || fit.status === "supported") return [];
  const req = fit.requirements;
  const cheapest = req.channelMediaFloors.slice().sort((a, b) => a.amount - b.amount)[0];

  return [
    {
      id: "pilot",
      title: "Focused pilot",
      text: `Use the available ${formatMoney(fit.budget)} to prepare one campaign destination, one primary creative format, basic measurement, and one advertising channel${cheapest ? ` (${channelLabel(cheapest.channel)} needs about ${formatMoney(cheapest.amount)} of media over the campaign)` : ""}.`,
    },
    {
      id: "foundation",
      title: "Build the foundation first",
      text: `Allocate this phase to positioning, messaging, essential creative, and campaign infrastructure. The protected campaign investment is about ${formatMoney(req.protectedTotal)}. Activate paid media in a future phase.`,
    },
    {
      id: "increase",
      title: "Increase the investment",
      text: `Maintain the ${fit.selectedChannels}-channel scope by increasing the available budget to about ${formatMoney(req.total)} once the required campaign components are defined.`,
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
  lines.push(`Campaign readiness: ${readiness.score}/100`);
  if (plan.breakEven) {
    lines.push(`Break-even: about ${plan.breakEven.breakEvenUnits.toLocaleString()} ${plan.breakEven.unitNoun}`);
  }
  lines.push("");
  lines.push("Estimates depend on the assumptions entered and do not guarantee campaign performance.");
  lines.push("Built with the LV Branding Campaign Investment Calculator · lvbranding.com");
  return lines.join("\n");
}
