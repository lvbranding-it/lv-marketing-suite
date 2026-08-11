// ── Campaign Investment Calculator: the requirements model ─────────────────────
// Prices the campaign from the bottom up instead of dividing whatever number the
// user typed. Every figure here follows from real component costs, the channel
// mix, and the campaign's scope.
//
//   I_required = S_min + B_min + D_min + M_required + G_min + T_min + R
//   P          = S_min + B_min + D_min + G_min + T_min        (protected)
//   I_required = P + M_required + R
//
// Paid media buys distribution. The protected campaign investment creates,
// operates, measures, and improves what is being distributed.
//
// Every constant lives in config.ts and is a PLANNING ASSUMPTION.

import {
  CHANNEL_ADAPTATION_COST, CHANNEL_MEDIA_MINIMUM, CHANNELS, COMPONENT_COSTS,
  CREATIVE, MANAGEMENT, READINESS_COST_FACTORS, READINESS_ITEMS, RESERVE,
  SCOPE_FACTORS, TESTING, scenarioMeta,
} from "./config";
import type {
  CalculatorAnswers, CategoryKey, ChannelKey, ComponentAssessment,
  RequirementLine, Requirements, ScenarioKey,
} from "./types";

function clampNum(value: number, min: number, max: number): number {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function campaignMonths(durationDays: number): number {
  return Math.max(0.5, clampNum(durationDays, 7, 730) / 30);
}

// ── 1. Readiness-cost equation ──────────────────────────────────────────────────
//   C_j = BaseCost_j x ReadinessFactor_j x ScopeFactor_j
// (the scope factor is applied per category, in the sections below)

/** The share of a component's build cost its current readiness still implies. */
export function readinessCostFactor(assessment: ComponentAssessment): number {
  if (assessment.relevance === "not-required") return 0;
  const meta = COMPONENT_COSTS[assessment.key];
  switch (assessment.state) {
    case "ready":  return READINESS_COST_FACTORS.ready;
    case "review": return meta.review;
    case "unsure": return READINESS_COST_FACTORS.unsureBase + READINESS_COST_FACTORS.discoveryReserve;
    case "create": return READINESS_COST_FACTORS.create;
    // Unanswered is planned as though it still needs to be created.
    default:       return READINESS_COST_FACTORS.create;
  }
}

export function componentCost(assessment: ComponentAssessment): number {
  return COMPONENT_COSTS[assessment.key].base * readinessCostFactor(assessment);
}

// ── 2. Scope factor ─────────────────────────────────────────────────────────────
//   F_scope = 1 + F_channels + F_market + F_duration + F_audience

export function scopeFactor(answers: CalculatorAnswers): number {
  const channels = Math.max(1, answers.scope.channels.length);
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

// ── Helpers ─────────────────────────────────────────────────────────────────────

function linesFor(
  assessments: ComponentAssessment[],
  affects: CategoryKey,
  multiplier = 1,
): RequirementLine[] {
  const out: RequirementLine[] = [];
  for (const item of READINESS_ITEMS) {
    if (item.affects !== affects) continue;
    const assessment = assessments.find((a) => a.key === item.key);
    if (!assessment) continue;
    const amount = componentCost(assessment) * multiplier;
    if (amount <= 0) continue;
    out.push({ key: item.key, label: item.label, amount });
  }
  return out;
}

const sum = (lines: RequirementLine[]) => lines.reduce((t, l) => t + l.amount, 0);

// ── 5. Paid-media requirement ───────────────────────────────────────────────────
//   M_required = max(M_goal, Σ_c M_min,c)

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

// ── The model ───────────────────────────────────────────────────────────────────

/**
 * Prices one scenario's scope. `channelOverride` lets a constrained plan be
 * costed against fewer channels than the user selected, which is what makes a
 * focused pilot a real reduction in scope rather than a smaller number.
 */
export function buildRequirements(
  answers: CalculatorAnswers,
  assessments: ComponentAssessment[],
  scenario: ScenarioKey,
  options?: { channels?: ChannelKey[]; goalMedia?: number | null },
): Requirements {
  const sMeta = scenarioMeta(scenario);
  const channels = options?.channels ?? answers.scope.channels;
  const activeChannels = channels.length > 0 ? channels : (["google-search"] as ChannelKey[]);
  const variations = sMeta.creativeVariations;
  const factor = scopeFactor(answers);

  // ── 2. Strategy and planning minimum ──
  //   S_min = Σ (StrategyCost_j x ReadinessFactor_j) x F_scope
  const strategyLines = linesFor(assessments, "strategy", factor);
  const strategy = sum(strategyLines);

  // ── 3. Branding and creative minimum ──
  //   B_min = C_concept + C_copy + C_production + C_formats + C_variations
  // The concept is charged once. Extra channels add adaptation, not a new concept.
  const creativeComponentLines = linesFor(assessments, "creative");
  const creativeGapExists = creativeComponentLines.length > 0;
  const adaptationCost = activeChannels.reduce(
    (t, c) => t + (CHANNEL_ADAPTATION_COST[c] ?? CHANNEL_ADAPTATION_COST.other), 0);
  const variationCost = Math.max(0, variations - 1) * CREATIVE.perVariationCost;

  const creativeLines: RequirementLine[] = [...creativeComponentLines];
  if (creativeGapExists) {
    creativeLines.unshift({
      key: "concept", label: "Campaign concept", amount: CREATIVE.conceptCost,
      detail: "Charged once, then adapted per channel",
    });
    creativeLines.push({
      key: "formats", label: "Channel adaptations", amount: adaptationCost,
      detail: `${activeChannels.length} channel${activeChannels.length === 1 ? "" : "s"}`,
    });
    if (variationCost > 0) {
      creativeLines.push({
        key: "variations", label: "Creative variations", amount: variationCost,
        detail: `${variations} variations`,
      });
    }
  }
  const creative = sum(creativeLines);

  // ── 4. Digital-experience minimum ──
  //   D_min = C_destination + C_conversion + C_analytics + C_platformTracking
  const digitalLines = linesFor(assessments, "digital");
  const digital = sum(digitalLines);

  // ── 5. Paid media ──
  const floors = channelMediaFloors(activeChannels, answers.scope.durationDays);
  const floorTotal = floors.reduce((t, f) => t + f.amount, 0);
  const singleChannelFloor = floors.length > 0 ? Math.min(...floors.map((f) => f.amount)) : 0;
  const goalMedia = options?.goalMedia ?? null;
  const media = Math.max(goalMedia ?? 0, floorTotal);

  // ── 6. Campaign management ──
  //   G_min = max(G_base, r_G x M_required) + G_complexity
  const complexity =
    activeChannels.length * MANAGEMENT.perChannel +
    variations * MANAGEMENT.perVariation +
    clampNum(answers.scope.durationDays, 7, 730) * MANAGEMENT.perDay +
    MANAGEMENT.reporting;
  const managementBase = Math.max(MANAGEMENT.base, MANAGEMENT.rate * media);
  const management = managementBase + complexity;
  const managementLines: RequirementLine[] = [
    { key: "run", label: "Campaign operation", amount: managementBase, detail: "Setup, monitoring, and optimization" },
    { key: "complexity", label: "Operational complexity", amount: complexity, detail: `${activeChannels.length} channels, ${variations} variations, reporting` },
  ];

  // ── 7. Testing and optimization ──
  //   T_min = max(T_base, r_T x (B_min + D_min + M_required))
  const testing = Math.max(TESTING.base, TESTING.rate * (creative + digital + media));
  const testingLines: RequirementLine[] = [
    { key: "testing", label: "Testing and optimization", amount: testing, detail: "Creative, audience, and destination experiments" },
  ];

  // ── 8. Optional reserve ──
  //   R = r_R x (S + B + D + M + G)
  const reserve = RESERVE.rate * (strategy + creative + digital + media + management);

  const protectedTotal = strategy + creative + digital + management + testing;

  return {
    strategy, creative, digital, media, management, testing, reserve,
    protectedTotal,
    total: protectedTotal + media + reserve,
    floors: {
      strategy, creative, digital, management, testing,
      media: 0, // media is the adjustable line
    },
    channelMediaFloors: floors,
    singleChannelFloor,
    goalMedia,
    creativeVariations: variations,
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
