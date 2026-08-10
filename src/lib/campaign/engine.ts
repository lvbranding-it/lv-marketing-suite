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
  ALLOCATION_RANGES, ASSUMPTIONS, CATEGORY_KEYS, READINESS_BANDS, READINESS_ITEMS,
  SCENARIOS, audienceBandMeta, categoryMeta, formatMoney, objectiveMeta, scenarioMeta,
} from "./config";
import type {
  BalanceNote, BreakEvenResult, CalculationResult, CalculatorAnswers,
  CategoryInsight, CategoryKey, ReadinessKey, ReadinessResult, ScenarioKey,
  ScenarioPlan, Shares,
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

export function readinessScore(readiness: Record<ReadinessKey, boolean>): ReadinessResult {
  let score = 0;
  const missing: ReadinessKey[] = [];
  for (const item of READINESS_ITEMS) {
    if (readiness[item.key]) score += item.weight;
    else missing.push(item.key);
  }
  score = clamp(Math.round(score), 0, 100);
  const bandEntry = READINESS_BANDS.find((b) => score >= b.min) ?? READINESS_BANDS[READINESS_BANDS.length - 1];
  return { score, band: bandEntry.band, missing };
}

// ── Recommended allocation shares ───────────────────────────────────────────────

/**
 * Builds the recommended share of each category as a decimal set summing to 1.
 * Starts from the midpoints of the configured planning ranges, then applies
 * answer-driven adjustments (in percentage points), clamps to hard bounds, and
 * normalises. The adjustments are the "adaptive ranges" behaviour: missing
 * foundations pull budget toward strategy/creative/digital; a complete
 * foundation releases budget toward media.
 */
export function recommendedShares(answers: CalculatorAnswers, scenario: ScenarioKey): Shares {
  const points: Record<CategoryKey, number> = {
    strategy: 0, creative: 0, digital: 0, media: 0, management: 0, testing: 0,
  };

  // Base: midpoint of each planning range.
  for (const key of CATEGORY_KEYS) {
    const [lo, hi] = ALLOCATION_RANGES[key].base;
    points[key] = (lo + hi) / 2;
  }

  // Readiness adjustments: each missing item grows its category. [ASSUMPTION]
  for (const item of READINESS_ITEMS) {
    if (!answers.readiness[item.key]) points[item.affects] += item.points;
  }
  // Missing tracking also grows the testing reserve slightly: measuring is the
  // precondition for learning. [ASSUMPTION]
  if (!answers.readiness.tracking) points.testing += 1;

  const ready = readinessScore(answers.readiness);
  // A complete foundation shifts weight toward distribution. [ASSUMPTION]
  if (ready.score >= 85) points.media += 4;
  else if (ready.score >= 65) points.media += 2;

  // Scope adjustments. [ASSUMPTION]
  const channels = answers.scope.channels.length;
  if (channels >= 4) { points.management += 2; points.creative += 1.5; }
  if (channels >= 6) { points.management += 1.5; }

  const days = clamp(answers.scope.durationDays || 30, 7, 730);
  if (days >= 180) { points.testing += 1.5; points.management += 1; }
  if (days <= 45 && answers.scope.timeSensitive) { points.management += 2; points.creative += 1.5; }

  if (answers.profile.stage === "new") points.strategy += 2;
  if (answers.profile.stage === "established" && ready.score >= 65) points.media += 1;

  // Scenario biases change scope emphasis, not overall scale. [ASSUMPTION]
  const sMeta = scenarioMeta(scenario);
  for (const key of CATEGORY_KEYS) {
    points[key] += sMeta.biases[key] ?? 0;
  }

  // Clamp to hard bounds, then normalise to 1. A second clamp+normalise pass
  // settles values that the first normalisation pushed past a bound.
  for (let pass = 0; pass < 2; pass++) {
    for (const key of CATEGORY_KEYS) {
      const [lo, hi] = ALLOCATION_RANGES[key].hard;
      points[key] = clamp(points[key], lo, hi);
    }
    const sum = CATEGORY_KEYS.reduce((s, k) => s + points[k], 0);
    for (const key of CATEGORY_KEYS) points[key] = safeDiv(points[key] * 100, sum, 100 / 6);
  }

  const shares = {} as Shares;
  let acc = 0;
  for (const key of CATEGORY_KEYS) { shares[key] = points[key] / 100; acc += shares[key]; }
  // Absorb float drift into media (the largest category).
  shares.media += 1 - acc;
  return shares;
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
  const unlockedOthers = others.filter((k) => !locked.includes(k));
  if (unlockedOthers.length === 0) return shares;

  const lockedSum = others.filter((k) => locked.includes(k)).reduce((s, k) => s + shares[k], 0);
  const maxNext = 1 - lockedSum - MIN_SHARE * unlockedOthers.length;
  const next = clamp(nextShare, MIN_SHARE, Math.max(MIN_SHARE, maxNext));

  const pool = 1 - lockedSum - next;
  const prevPool = unlockedOthers.reduce((s, k) => s + shares[k], 0);

  const out = { ...shares, [key]: next };
  if (prevPool <= 0) {
    for (const k of unlockedOthers) out[k] = pool / unlockedOthers.length;
  } else {
    for (const k of unlockedOthers) out[k] = Math.max(MIN_SHARE, pool * safeDiv(shares[k], prevPool, 1 / unlockedOthers.length));
  }
  // Absorb clamping drift into the largest unlocked "other" so the sum is exact.
  const sum = CATEGORY_KEYS.reduce((s, k) => s + out[k], 0);
  const sink = unlockedOthers.reduce((a, b) => (out[a] >= out[b] ? a : b));
  out[sink] = Math.max(MIN_SHARE, out[sink] + (1 - sum));
  return out;
}

/**
 * Integer percentages for display that always total exactly 100; independent
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

/** Below / balanced / above the recommendation for this user. */
export function shareStatus(current: number, recommended: number): "below" | "balanced" | "above" {
  const delta = (current - recommended) * 100;
  if (delta < -ASSUMPTIONS.balancedBandPoints) return "below";
  if (delta > ASSUMPTIONS.balancedBandPoints) return "above";
  return "balanced";
}

/** Suggested display range for a category, centred on the adaptive recommendation. */
export function suggestedRange(key: CategoryKey, recommended: number): [number, number] {
  const [lo, hi] = ALLOCATION_RANGES[key].base;
  const half = (hi - lo) / 2;
  const [hardLo, hardHi] = ALLOCATION_RANGES[key].hard;
  const centre = recommended * 100;
  return [
    Math.round(clamp(centre - half, hardLo, hardHi)),
    Math.round(clamp(centre + half, hardLo, hardHi)),
  ];
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

// ── Scenario construction ───────────────────────────────────────────────────────

function channelsSupportedBy(mediaAmount: number, durationDays: number): number {
  const months = Math.max(0.5, clamp(durationDays, 7, 730) / 30);
  // [ASSUMPTION] a channel needs a minimum monthly spend to learn at all.
  return Math.max(1, Math.floor(safeDiv(mediaAmount, ASSUMPTIONS.minChannelSpendPerMonth * months, 1)));
}

export function buildScenario(answers: CalculatorAnswers, key: ScenarioKey): ScenarioPlan {
  const sMeta = scenarioMeta(key);
  const shares = recommendedShares(answers, key);
  const fin = answers.financial;

  let total = 0;
  let estimatedResults: number | null = null;

  if (fin.mode === "budget") {
    const budget = clamp(num(fin.budgetTotal) ?? 0, 0, ASSUMPTIONS.maxBudget);
    total = roundTotal(budget * sMeta.budgetFactor);
    // Budget mode collects no unit costs, so results are not estimated here.
  } else {
    const goal = clamp(num(fin.goalCount) ?? 0, 0, ASSUMPTIONS.maxGoal);
    const scenarioGoal = Math.round(goal * sMeta.goalFactor);
    const media = estimateMediaSpend(answers, scenarioGoal);
    if (media !== null && media > 0) {
      total = roundTotal(safeDiv(media, shares.media, media * 2.5));
      estimatedResults = scenarioGoal;
    }
  }

  const amounts = allocationAmounts(total, shares);
  const mediaSpend = amounts.media;
  const supportedChannels = channelsSupportedBy(mediaSpend, answers.scope.durationDays);
  const selected = Math.max(1, answers.scope.channels.length);
  const recommendedChannels = Math.max(1, Math.min(selected, sMeta.channelCap, supportedChannels));

  return {
    key,
    total,
    shares,
    amounts,
    mediaSpend,
    recommendedChannels,
    supportedChannels,
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

  for (const item of READINESS_ITEMS) {
    if (!answers.readiness[item.key]) add(item.affects, item.clause);
  }
  const channels = answers.scope.channels.length;
  if (channels >= 4) {
    add("management", `you selected ${channels} advertising channels`);
    add("creative", "each additional channel needs its own creative formats");
  }
  if (answers.scope.durationDays >= 180) add("testing", "longer campaigns earn back a meaningful optimization reserve");
  if (answers.scope.durationDays <= 45 && answers.scope.timeSensitive) add("management", "a short, time-sensitive window compresses production and launch work");
  if (answers.profile.stage === "new") add("strategy", "a new business benefits from firmer positioning before spending on reach");

  const ready = readinessScore(answers.readiness);
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
  const missing = readinessScore(answers.readiness).missing;
  const missingCreative = missing.filter((k) =>
    k === "visualIdentity" || k === "photography" || k === "video" || k === "graphics" || k === "adCopy").length;

  if (shares.media > 0.55 && (missingCreative >= 2 || missing.includes("message"))) {
    notes.push({
      id: "media-heavy", tone: "attention",
      text: `Your current allocation places ${Math.round(shares.media * 100)}% into paid media, but your answers indicate the campaign creative still needs development. Consider strengthening the foundation before increasing media spend.`,
    });
  }
  if (missing.includes("tracking")) {
    notes.push({
      id: "tracking", tone: "attention",
      text: "Conversion tracking isn't in place yet. Without it, media spend can't be evaluated or improved. Your digital-experience allocation reserves room to set it up first.",
    });
  }
  if (missing.includes("landingPage")) {
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
  if (answers.scope.durationDays <= 45 && answers.scope.timeSensitive && missingCreative >= 3) {
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
      id: "reach-vs-audience", tone: "attention",
      text: `Your desired reach (${goal.toLocaleString()} people) is larger than the audience size you selected earlier (${audienceBandMeta(answers.scope.audience).label.toLowerCase()}). Review your audience estimate or expand the campaign's geographic market.`,
    });
  }
  if (answers.profile.reach === "local" && answers.scope.audience === "over-1m") {
    notes.push({
      id: "local-vs-scale", tone: "attention",
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

  const foundation =
    ready.missing.length >= 6 ? "still needs most of its strategic and creative foundation"
    : ready.missing.length >= 2 ? "still needs several campaign components developed"
    : ready.missing.length === 1 ? "is close to campaign-ready, with one component left to develop"
    : "has its foundation in place";

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

// ── Full calculation ────────────────────────────────────────────────────────────

export function calculate(answers: CalculatorAnswers): CalculationResult {
  const readiness = readinessScore(answers.readiness);
  const scenarios = {
    essential: buildScenario(answers, "essential"),
    growth:    buildScenario(answers, "growth"),
    expansion: buildScenario(answers, "expansion"),
  };

  // [ASSUMPTION] Growth is the default recommendation; Essential wins for small
  // stated budgets, where splitting further would spread the plan too thin.
  let recommendedScenario: ScenarioKey = "growth";
  if (answers.financial.mode === "budget") {
    const budget = num(answers.financial.budgetTotal) ?? 0;
    if (budget > 0 && budget < ASSUMPTIONS.essentialBudgetCutoff) recommendedScenario = "essential";
  }

  return { readiness, scenarios, recommendedScenario, insights: categoryInsights(answers) };
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
