// ── Campaign Investment Calculator: the requirements model ─────────────────────
// Prices the campaign from the bottom up instead of dividing whatever number the
// user typed, and prices TWO scopes independently:
//
//   I_full = P_full + M_full + R_full     every applicable component (J_full)
//   I_min  = P_min  + M_min  + R_min      the lean one-channel campaign (J_min)
//
//   P = S_min + B_min + D_min + G_min + T_min
//
// J_min is NOT J_full at a discount. It is a genuinely smaller deliverable set:
// one channel, one concept, one format, existing identity and website, basic
// tracking, no custom photo or video. Deriving one from the other by multiplying
// would misrepresent what is actually being delivered.
//
// Component cost is effort x rate, bundled:
//   P_full = B_base + beta x Σ (hours_j x rate x readinessFactor_j) + pass-through
// Bundling reflects genuine overlap (positioning informs messaging informs copy)
// and is NEVER applied to media or third-party spend.
//
// Everything is a RANGE, because the market inputs are ranges.

import {
  BASE_SETUP_COST, BLENDED_RATE, BUNDLING, CHANNEL_ADAPTATION_COST,
  CHANNEL_MEDIA_MINIMUM, CHANNELS, COMPONENT_EFFORT, CREATIVE,
  LEAN_CATEGORY_FLOORS, MANAGEMENT, READINESS_COST_FACTORS, READINESS_ITEMS,
  RESERVE, SCOPE_FACTORS, TESTING, addRange, emptyRange, maxRange, rangeOf,
  scaleRange, scenarioMeta,
} from "./config";
import type {
  CalculatorAnswers, CategoryKey, ChannelKey, ComponentAssessment, Range,
  RequirementLine, Requirements, ScenarioKey, ScopeKind,
} from "./types";

function clampNum(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function campaignMonths(durationDays: number): number {
  return Math.max(0.5, clampNum(durationDays, 7, 730) / 30);
}

// ── Readiness-cost equation ─────────────────────────────────────────────────────

/** The share of a component's build effort its current readiness still implies. */
export function readinessCostFactor(assessment: ComponentAssessment): number {
  if (assessment.relevance === "not-required") return 0;
  const effort = COMPONENT_EFFORT[assessment.key];
  switch (assessment.state) {
    case "ready":  return READINESS_COST_FACTORS.ready;
    case "review": return effort.review;
    case "unsure": return READINESS_COST_FACTORS.unsureBase + READINESS_COST_FACTORS.discoveryReserve;
    case "create": return READINESS_COST_FACTORS.create;
    // Unanswered is planned as though it still needs to be created.
    default:       return READINESS_COST_FACTORS.create;
  }
}

/**
 * One component's cost range in a given scope. Labour is bundled; pass-through
 * (production, licensing, third-party spend) is not, and neither is major custom
 * development.
 */
export function componentCost(assessment: ComponentAssessment, scope: ScopeKind): Range {
  const effort = COMPONENT_EFFORT[assessment.key];
  const hours = scope === "lean" ? effort.leanHours : effort.fullHours;
  if (hours <= 0) return emptyRange();

  const factor = readinessCostFactor(assessment);
  if (factor <= 0) return emptyRange();

  const labour = rangeOf(hours * BLENDED_RATE.min * factor, hours * BLENDED_RATE.max * factor);
  const bundled = effort.bundlingExempt
    ? labour
    : rangeOf(labour.min * BUNDLING.min, labour.max * BUNDLING.max);

  // Pass-through is real third-party money and is never bundled away. The lean
  // scope runs no custom production, so it carries none.
  const passThrough = effort.passThrough && scope === "full"
    ? scaleRange(effort.passThrough, factor)
    : emptyRange();

  return addRange(bundled, passThrough);
}

// ── Scope factor ────────────────────────────────────────────────────────────────
//   F_scope = 1 + F_channels + F_market + F_duration + F_audience

export function scopeFactor(answers: CalculatorAnswers, channelCount: number): number {
  const channels = Math.max(1, channelCount);
  const fChannels = Math.min(
    SCOPE_FACTORS.maxChannels,
    (channels - 1) * SCOPE_FACTORS.perExtraChannel,
  );
  const fMarket = answers.profile.reach ? SCOPE_FACTORS.market[answers.profile.reach] : 0;
  const fDuration = Math.min(
    SCOPE_FACTORS.maxDuration,
    (campaignMonths(answers.scope.durationDays) - 1) * SCOPE_FACTORS.per30Days,
  );
  const fAudience = SCOPE_FACTORS.audience[answers.scope.audience] ?? 0;
  return 1 + Math.max(0, fChannels) + fMarket + Math.max(0, fDuration) + fAudience;
}

// ── Media ───────────────────────────────────────────────────────────────────────

export function channelMediaFloors(
  channels: ChannelKey[],
  durationDays: number,
): { channel: ChannelKey; amount: number }[] {
  const months = campaignMonths(durationDays);
  const list = channels.length > 0 ? channels : (["google-search"] as ChannelKey[]);
  return list.map((channel) => ({
    channel,
    amount: (CHANNEL_MEDIA_MINIMUM[channel] ?? CHANNEL_MEDIA_MINIMUM.other) * months,
  }));
}

// ── Helpers ─────────────────────────────────────────────────────────────────────

const sumLines = (lines: RequirementLine[]): Range =>
  lines.reduce((t, l) => addRange(t, l.amount), emptyRange());

function linesFor(
  assessments: ComponentAssessment[],
  affects: CategoryKey,
  scope: ScopeKind,
  multiplier = 1,
): RequirementLine[] {
  const out: RequirementLine[] = [];
  for (const item of READINESS_ITEMS) {
    if (item.affects !== affects) continue;
    const assessment = assessments.find((a) => a.key === item.key);
    if (!assessment) continue;
    const cost = scaleRange(componentCost(assessment, scope), multiplier);
    if (cost.max <= 0) continue;
    out.push({ key: item.key, label: item.label, amount: cost });
  }
  return out;
}

/** Applicable components that this scope does NOT deliver, for the deferred list. */
export function deferredComponents(
  assessments: ComponentAssessment[],
  scope: ScopeKind,
): ComponentAssessment[] {
  if (scope === "full") return [];
  return assessments.filter((a) => {
    if (a.relevance === "not-required") return false;
    if (readinessCostFactor(a) <= 0) return false;         // already ready
    return COMPONENT_EFFORT[a.key].leanHours <= 0;          // outside J_min
  });
}

// ── The model ───────────────────────────────────────────────────────────────────

/**
 * Prices one scope. `full` covers every applicable component and every selected
 * channel; `lean` covers only J_min on one channel. They are computed by the
 * same function but from different inputs, never one derived from the other.
 */
export function buildRequirements(
  answers: CalculatorAnswers,
  assessments: ComponentAssessment[],
  scenario: ScenarioKey,
  options?: { channels?: ChannelKey[]; goalMedia?: number | null; scope?: ScopeKind },
): Requirements {
  const scope: ScopeKind = options?.scope ?? "full";
  const sMeta = scenarioMeta(scenario);

  const selected = options?.channels ?? answers.scope.channels;
  const activeChannels: ChannelKey[] = scope === "lean"
    // The lean scope funds exactly one channel: the cheapest that can carry it.
    ? [channelMediaFloors(selected, answers.scope.durationDays)
        .sort((a, b) => a.amount - b.amount)[0]?.channel ?? "google-search"]
    : (selected.length > 0 ? selected : (["google-search"] as ChannelKey[]));

  const variations = scope === "lean" ? 1 : sMeta.creativeVariations;
  const factor = scope === "lean" ? 1 : scopeFactor(answers, activeChannels.length);

  // ── Strategy ──
  const strategyLines = linesFor(assessments, "strategy", scope, factor);
  let strategy = addRange(sumLines(strategyLines), scope === "full" ? BASE_SETUP_COST : emptyRange());
  if (scope === "full" && strategy.max > 0) {
    strategyLines.unshift({ key: "setup", label: "Campaign setup", amount: BASE_SETUP_COST });
  }

  // ── Creative. Concept once, adaptation per channel, variations on top. ──
  const creativeComponentLines = linesFor(assessments, "creative", scope);
  const creativeGapExists = creativeComponentLines.length > 0;
  const adaptationTotal = activeChannels.reduce(
    (t, c) => t + (CHANNEL_ADAPTATION_COST[c] ?? CHANNEL_ADAPTATION_COST.other), 0);
  const variationTotal = Math.max(0, variations - 1) * CREATIVE.perVariationCost;

  const creativeLines: RequirementLine[] = [...creativeComponentLines];
  if (creativeGapExists) {
    const conceptCost = scope === "lean"
      ? scaleRange(rangeOf(CREATIVE.conceptCost, CREATIVE.conceptCost), 0.5)
      : rangeOf(CREATIVE.conceptCost, CREATIVE.conceptCost * 1.4);
    creativeLines.unshift({
      key: "concept", label: "Campaign concept", amount: conceptCost,
      detail: "Charged once, then adapted per channel",
    });
    if (adaptationTotal > 0) {
      creativeLines.push({
        key: "formats", label: "Channel adaptations",
        amount: rangeOf(adaptationTotal * 0.8, adaptationTotal * 1.2),
        detail: `${activeChannels.length} channel${activeChannels.length === 1 ? "" : "s"}`,
      });
    }
    if (variationTotal > 0) {
      creativeLines.push({
        key: "variations", label: "Creative variations",
        amount: rangeOf(variationTotal * 0.8, variationTotal * 1.2),
        detail: `${variations} variations`,
      });
    }
  }
  let creative = sumLines(creativeLines);

  // ── Digital experience ──
  const digitalLines = linesFor(assessments, "digital", scope);
  let digital = sumLines(digitalLines);

  // ── Media ──
  const floors = channelMediaFloors(activeChannels, answers.scope.durationDays);
  const floorTotal = floors.reduce((t, f) => t + f.amount, 0);
  const singleChannelFloor = floors.length > 0 ? Math.min(...floors.map((f) => f.amount)) : 0;
  const goalMedia = scope === "full" ? (options?.goalMedia ?? null) : null;
  const mediaPoint = Math.max(goalMedia ?? 0, floorTotal);
  let media = scope === "lean"
    ? maxRange(LEAN_CATEGORY_FLOORS.media, rangeOf(mediaPoint, mediaPoint))
    : rangeOf(mediaPoint, mediaPoint * 1.35);

  // ── Management: max(G_base, r_G x M) + complexity ──
  const complexity =
    activeChannels.length * MANAGEMENT.perChannel +
    variations * MANAGEMENT.perVariation +
    clampNum(answers.scope.durationDays, 7, 730) * MANAGEMENT.perDay +
    MANAGEMENT.reporting;
  const managementBase = rangeOf(
    Math.max(MANAGEMENT.base, MANAGEMENT.rate * media.min),
    Math.max(MANAGEMENT.base, MANAGEMENT.rate * media.max),
  );
  let management = addRange(
    managementBase,
    scope === "lean" ? scaleRange(rangeOf(complexity, complexity), 0.5) : rangeOf(complexity, complexity * 1.25),
  );
  const managementLines: RequirementLine[] = [
    { key: "run", label: "Campaign operation", amount: managementBase, detail: "Setup, monitoring, and optimization" },
    { key: "complexity", label: "Operational complexity", amount: rangeOf(complexity, complexity), detail: `${activeChannels.length} channels, ${variations} variations, reporting` },
  ];

  // ── Testing: max(T_base, r_T x (B + D + M)) ──
  let testing = rangeOf(
    Math.max(TESTING.base, TESTING.rate * (creative.min + digital.min + media.min)),
    Math.max(TESTING.base, TESTING.rate * (creative.max + digital.max + media.max)),
  );
  const testingLines: RequirementLine[] = [
    { key: "testing", label: "Testing and optimization", amount: testing, detail: scope === "lean" ? "One controlled initial test" : "Creative, audience, and destination experiments" },
  ];

  /*
   * Absolute operational floors. A category minimum is max(F_k, bundled effort),
   * so a lean campaign never prices below what the work actually costs to run,
   * even when every component happens to be ready.
   */
  if (scope === "lean") {
    strategy   = maxRange(LEAN_CATEGORY_FLOORS.strategy, strategy);
    creative   = maxRange(LEAN_CATEGORY_FLOORS.creative, creative);
    digital    = maxRange(LEAN_CATEGORY_FLOORS.digital, digital);
    management = maxRange(LEAN_CATEGORY_FLOORS.management, management);
    testing    = maxRange(LEAN_CATEGORY_FLOORS.testing, testing);
  }

  const protectedTotal = [strategy, creative, digital, management, testing].reduce(addRange, emptyRange());
  const reserve = scaleRange(addRange(protectedTotal, media), RESERVE.rate);
  const total = addRange(addRange(protectedTotal, media), reserve);

  return {
    scope,
    strategy, creative, digital, media, management, testing, reserve,
    protectedTotal, total,
    floors: { strategy, creative, digital, management, testing, media: emptyRange() },
    channelMediaFloors: floors,
    singleChannelFloor,
    goalMedia,
    creativeVariations: variations,
    activeChannels,
    deferred: deferredComponents(assessments, scope),
    breakdown: {
      strategy: strategyLines,
      creative: creativeLines,
      digital: digitalLines,
      management: managementLines,
      testing: testingLines,
    },
    scopeFactor: factor,
  };
}

/** Channel labels, for explaining a reduced media mix. */
export const channelLabel = (key: ChannelKey): string =>
  CHANNELS.find((c) => c.key === key)?.label ?? key;

/**
 * The channels a media allowance can actually fund, cheapest first. Used both to
 * report what a budget supports and to scope a focused pilot.
 */
export function affordableChannels(
  channels: ChannelKey[],
  durationDays: number,
  mediaAvailable: number,
): ChannelKey[] {
  const floors = channelMediaFloors(channels, durationDays)
    .slice()
    .sort((a, b) => a.amount - b.amount);
  const out: ChannelKey[] = [];
  let remaining = mediaAvailable;
  for (const floor of floors) {
    if (remaining < floor.amount) break;
    remaining -= floor.amount;
    out.push(floor.channel);
  }
  return out;
}
