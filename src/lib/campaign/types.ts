// ── Campaign Investment Calculator: shared types ───────────────────────────────
// All percentages are handled as decimals (0.4 = 40%) everywhere in the engine.
// UI components convert to/from display percentages at the edge only.

export type BusinessType =
  | "b2b" | "b2c" | "nonprofit" | "event" | "ecommerce" | "services" | "other";

export type BusinessStage = "new" | "growing" | "established";

export type MarketReach = "local" | "regional" | "national" | "international";

export type ObjectiveKey =
  | "awareness" | "leads" | "sales" | "visits" | "event" | "launch" | "retention";

export type ChannelKey =
  | "google-search" | "google-display" | "youtube" | "meta-facebook" | "instagram"
  | "linkedin" | "tiktok" | "programmatic" | "email" | "other";

export type AudienceBand = "unknown" | "under-10k" | "10k-100k" | "100k-1m" | "over-1m";

export type FinancialMode = "budget" | "goal";

/** The six allocation categories, in donut ring order. */
export type CategoryKey =
  | "strategy" | "creative" | "digital" | "media" | "management" | "testing";

export type ScenarioKey = "essential" | "growth" | "expansion";

export type ReadinessKey =
  | "positioning" | "message" | "visualIdentity" | "photography" | "video"
  | "graphics" | "adCopy" | "landingPage" | "captureFlow" | "tracking";

export type ReadinessBand =
  | "foundation" | "partial" | "ready" | "scale";

export type CurrencyCode = "USD";

export interface ProfileAnswers {
  businessType: BusinessType | null;
  stage:        BusinessStage | null;
  reach:        MarketReach | null;
  industry:     string;
  currency:     CurrencyCode;
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
  /** Cost per lead / result / acquisition (per 1,000 reached for awareness). */
  costPerResult:   number | null;
  /** Gross profit margin as a decimal (0.5 = 50%). */
  marginPct:       number | null;
  /** True when the user accepted a planning assumption instead of their own number. */
  assumedConversion:    boolean;
  assumedCostPerResult: boolean;
}

export interface CalculatorAnswers {
  profile:   ProfileAnswers;
  objective: ObjectiveKey | null;
  scope:     ScopeAnswers;
  readiness: Record<ReadinessKey, boolean>;
  financial: FinancialAnswers;
}

/** Category shares as decimals; a valid set always sums to 1 (±1e-9). */
export type Shares = Record<CategoryKey, number>;

export interface ReadinessResult {
  /** 0–100 */
  score:   number;
  band:    ReadinessBand;
  missing: ReadinessKey[];
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
  /** Total investment for this scenario, rounded for planning. */
  total:       number;
  /** Recommended shares (decimals summing to 1). */
  shares:      Shares;
  /** Dollar amounts per category; always sums exactly to `total`. */
  amounts:     Record<CategoryKey, number>;
  /** Media dollars implied by the goal (goal-first) or the allocation (budget-first). */
  mediaSpend:  number;
  /** Channels this scenario plans around vs. what the media budget can support. */
  recommendedChannels: number;
  supportedChannels:   number;
  /** Estimated results at this scenario's reach; null when inputs don't support it. */
  estimatedResults: number | null;
  breakEven:        BreakEvenResult | null;
}

export interface BalanceNote {
  id:   string;
  tone: "info" | "attention";
  text: string;
}

export interface CategoryInsight {
  key:        CategoryKey;
  /** Answer-driven clauses explaining why this allocation moved. */
  influences: string[];
}

export interface CalculationResult {
  readiness:           ReadinessResult;
  scenarios:           Record<ScenarioKey, ScenarioPlan>;
  recommendedScenario: ScenarioKey;
  insights:            CategoryInsight[];
}
