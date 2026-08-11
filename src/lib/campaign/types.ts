// ── Campaign Investment Calculator: shared types ───────────────────────────────
// All percentages are handled as decimals (0.4 = 40%) everywhere in the engine.
// UI components convert to/from display percentages at the edge only.

/** Who the campaign primarily speaks to. Business model, not industry. */
export type AudienceFocus = "businesses" | "consumers" | "both" | "community";

export type BusinessStage = "new" | "growing" | "established";

export type MarketReach = "local" | "regional" | "national" | "international";

export type ObjectiveKey =
  | "awareness" | "leads" | "sales" | "visits" | "event" | "launch" | "retention";

export type ChannelKey =
  | "google-search" | "google-display" | "youtube" | "meta-facebook" | "instagram"
  | "linkedin" | "tiktok" | "programmatic" | "email" | "other";

export type AudienceBand = "unknown" | "under-10k" | "10k-100k" | "100k-1m" | "over-1m";

export type FinancialMode = "budget" | "goal";

/** Where the campaign sends people, which decides the destination components. */
export type DestinationKey =
  | "landing-page" | "lead-form" | "buy-online" | "physical-location"
  | "event-registration" | "call-message" | "none";

/** The six allocation categories, in donut ring order. */
export type CategoryKey =
  | "strategy" | "creative" | "digital" | "media" | "management" | "testing";

export type ScenarioKey = "essential" | "growth" | "expansion";

// ── Your starting point (readiness) ─────────────────────────────────────────────
// Readiness is not a checklist of things to own. Which components matter depends
// on the objective, the channels, and where the campaign sends people, and
// "we have it" is not the same as "it is ready to use".

export type ReadinessGroupKey = "foundation" | "creative" | "destination" | "measurement";

export type ReadinessKey =
  // Campaign foundation
  | "positioning" | "objectiveOffer" | "message" | "channelStrategy" | "campaignPlan"
  | "visualIdentity"
  // Creative assets
  | "photography" | "video" | "graphics" | "adCopy"
  // Campaign destination
  | "landingPage" | "leadForm" | "checkoutFlow" | "eventPage"
  // Measurement and optimization
  | "tracking" | "analytics" | "pixels" | "successMetrics";

/** How ready one component is. `null` means the user hasn't answered yet. */
export type ReadinessState = "ready" | "review" | "create" | "unsure";

/** How much this component matters for THIS campaign. Computed, never asked. */
export type ComponentRelevance = "essential" | "recommended" | "optional" | "not-required";

export type ReadinessBand = "foundation" | "partial" | "ready" | "scale";

export type CurrencyCode = "USD";

export interface ProfileAnswers {
  audienceFocus: AudienceFocus | null;
  stage:         BusinessStage | null;
  reach:         MarketReach | null;
  industry:      string;
  currency:      CurrencyCode;
}

export interface ScopeAnswers {
  /** Campaign length in days; presets map to 30/60/90/180/365, custom is free. */
  durationDays:   number;
  customDuration: boolean;
  channels:       ChannelKey[];
  audience:       AudienceBand;
  /** true = fixed date (event/launch window); false = always-on. */
  timeSensitive:  boolean;
}

export interface FinancialAnswers {
  mode: FinancialMode;
  /** Budget-first */
  budgetTotal:     number | null;
  expectedRevenue: number | null;
  /** Goal-first */
  goalCount:       number | null;
  /** Shared, optional */
  avgValue:        number | null;
  /** Lead→customer conversion rate as a decimal (0.15 = 15%). */
  conversionRate:  number | null;
  /** Cost per lead / result / acquisition (CPM per 1,000 impressions for awareness). */
  costPerResult:   number | null;
  /**
   * Awareness only: average number of times each person should see the campaign.
   * Required impressions = desired reach x frequency.
   */
  targetFrequency: number | null;
  /** Gross profit margin as a decimal (0.5 = 50%). */
  marginPct:       number | null;
  /** True when the user accepted a planning assumption instead of their own number. */
  assumedConversion:    boolean;
  assumedCostPerResult: boolean;
  assumedFrequency:     boolean;
}

export interface CalculatorAnswers {
  profile:     ProfileAnswers;
  objective:   ObjectiveKey | null;
  scope:       ScopeAnswers;
  /** What people should do after seeing the campaign. Drives destination relevance. */
  destination: DestinationKey | null;
  readiness:   Record<ReadinessKey, ReadinessState | null>;
  financial:   FinancialAnswers;
}

/** Category shares as decimals; a valid set always sums to 1 (±1e-9). */
export type Shares = Record<CategoryKey, number>;

/** One component, with how much it matters here and how ready it is. */
export interface ComponentAssessment {
  key:       ReadinessKey;
  relevance: ComponentRelevance;
  /** Plain-language justification, e.g. "You selected YouTube…". */
  reason?:   string;
  state:     ReadinessState | null;
}

export interface ReadinessResult {
  /** 0–100, weighted by relevance; components that don't apply are excluded. */
  score:          number;
  band:           ReadinessBand;
  assessments:    ComponentAssessment[];
  essentialTotal: number;
  essentialReady: number;
  /** Applicable components sitting at "needs review" or "not sure". */
  needsReview:    number;
  /** Applicable components that are not ready, split by how much they matter. */
  gaps:           { essential: ReadinessKey[]; recommended: ReadinessKey[] };
}

export interface BreakEvenResult {
  grossProfitPerUnit:   number;
  breakEvenUnits:       number;
  /** The unit being counted (customers, sales, registrations…). */
  unitNoun:             string;
  goalUnits:            number | null;
  projectedRevenue:     number | null;
  projectedGrossProfit: number | null;
}

export interface ScenarioPlan {
  key:         ScenarioKey;
  /** The single figure this plan allocates against (the budget when known). */
  total:       number;
  /** The estimate range for this scope; what the public result should show. */
  totalRange:  Range;
  /** The campaign reserve carried inside `total`, held outside `amounts`. */
  reserveAmount: number;
  /** Recommended shares (decimals summing to 1). */
  shares:      Shares;
  /** Dollar amounts per category; always sums exactly to `total`. */
  amounts:     Record<CategoryKey, number>;
  /** The bottom-up requirement this scenario's scope implies (a range). */
  requirements: Requirements;
  /** True when this plan is a preparation sprint, not a campaign. */
  isPreparationPhase: boolean;
  /** Channels this scenario is actually costed against. */
  plannedChannels: ChannelKey[];
  /** Media dollars implied by the goal (goal-first) or the allocation (budget-first). */
  mediaSpend:  number;
  /** Channels this scenario plans around vs. what the media budget can support. */
  recommendedChannels: number;
  supportedChannels:   number;
  /** Estimated results at this scenario's reach; null when inputs don't support it. */
  estimatedResults: number | null;
  breakEven:        BreakEvenResult | null;
}

/** Which scope is being priced. `lean` is J_min, `full` is J_full. */
export type ScopeKind = "lean" | "full";

/** Market inputs are ranges, so estimates are ranges. */
export interface Range { min: number; max: number }

/** One line of the requirements build-up, for display and for the report. */
export interface RequirementLine {
  key:    string;
  label:  string;
  amount: Range;
  detail?: string;
}

/**
 * The campaign priced from the bottom up for ONE scope:
 *   I = P + M + R,  P = S + B + D + G + T
 * The lean and full scopes are built independently; neither is derived from the
 * other by a discount factor.
 */
export interface Requirements {
  scope:      ScopeKind;
  strategy:   Range;   // S_min
  creative:   Range;   // B_min
  digital:    Range;   // D_min
  media:      Range;   // M
  management: Range;   // G_min
  testing:    Range;   // T_min
  reserve:    Range;   // R
  /** S + B + D + G + T. Excludes media and reserve. */
  protectedTotal: Range;
  /** P + M + R */
  total: Range;
  /** Protected floor per allocation category for THIS scope. */
  floors: Record<CategoryKey, Range>;
  channelMediaFloors: { channel: ChannelKey; amount: number }[];
  singleChannelFloor: number;
  goalMedia: number | null;
  creativeVariations: number;
  /** Channels this scope actually funds. */
  activeChannels: ChannelKey[];
  /** Applicable components this scope does not deliver. */
  deferred: ComponentAssessment[];
  breakdown: {
    strategy:   RequirementLine[];
    creative:   RequirementLine[];
    digital:    RequirementLine[];
    management: RequirementLine[];
    testing:    RequirementLine[];
  };
  scopeFactor: number;
}

/**
 * Whether the money, time, channels, and reach line up. Reports the client's
 * available investment against BOTH the lean professional minimum and the
 * complete selected scope, because conflating the two is what made an
 * insufficient budget look sufficient.
 */
export interface FeasibilityResult {
  status: "preparation-only" | "campaign-preparation" | "focused-pilot" | "scope-supported";
  /** Only meaningful in budget-first mode; goal-first sizes to the goal instead. */
  applies: boolean;
  /** A: the stated available investment, or 0 in goal-first mode. */
  available: number;
  /** I_min: the lean, professionally responsible one-channel campaign. */
  minimumViable: Requirements;
  /** I_full: everything originally selected. */
  completeScope: Requirements;
  /** max(0, I_min - A) */
  minimumFundingGap: Range;
  /** max(0, I_full - A) */
  completeScopeFundingGap: Range;
  /** F_budget = min(100, A / I_full x 100), on the optimistic bound. */
  score: number;
  scoreLabel: string;
  /** Investment left for media once the lean protected minimum is funded. */
  mediaAvailable: number;
  /** Channels the remaining media budget can actually fund. */
  supportedChannels: number;
  selectedChannels: number;
}

export interface BalanceNote {
  id:   string;
  tone: "info" | "attention";
  text: string;
  /**
   * A contradiction serious enough that recommending a plan would be misleading.
   * Suppresses the "Recommended" badge until the user resolves it.
   */
  critical?: boolean;
}

export interface CategoryInsight {
  key:        CategoryKey;
  /** Answer-driven clauses explaining why this allocation moved. */
  influences: string[];
}

export interface CalculationResult {
  readiness:           ReadinessResult;
  feasibility:         FeasibilityResult;
  scenarios:           Record<ScenarioKey, ScenarioPlan>;
  recommendedScenario: ScenarioKey;
  insights:            CategoryInsight[];
  /** Critical contradictions in the answers; non-empty suppresses the recommendation. */
  contradictions:      BalanceNote[];
  /**
   * True when the stated budget cannot support the selected scope. The Essential
   * scenario is then presented as a reduced-scope Focused Pilot rather than an
   * ordinary recommendation.
   */
  budgetConstrained:   boolean;
}
