// ── Campaign Investment Calculator: configuration ──────────────────────────────
// Every number in this file is a PLANNING ASSUMPTION, not a market guarantee.
// LV Branding should review and refine these before public launch; the engine in
// engine.ts only consumes them, so tuning happens here without touching math.

import type {
  AudienceBand, AudienceFocus, BusinessStage, CategoryKey, ChannelKey,
  CurrencyCode, MarketReach, ObjectiveKey, ReadinessBand, ReadinessKey,
  ScenarioKey,
} from "./types";

// ── Currency ────────────────────────────────────────────────────────────────────
// Structured so more currencies can be added later: add an entry here and the
// profile step's currency select picks it up. Nothing else changes.

export const CURRENCIES: Record<CurrencyCode, { label: string; locale: string }> = {
  USD: { label: "USD (US Dollar)", locale: "en-US" },
};

export function formatMoney(amount: number, currency: CurrencyCode = "USD", opts?: { cents?: boolean }): string {
  if (!Number.isFinite(amount)) return "–";
  const { locale } = CURRENCIES[currency] ?? CURRENCIES.USD;
  try {
    return new Intl.NumberFormat(locale, {
      style: "currency",
      currency,
      minimumFractionDigits: opts?.cents ? 2 : 0,
      maximumFractionDigits: opts?.cents ? 2 : 0,
    }).format(amount);
  } catch {
    return `$${Math.round(amount).toLocaleString()}`;
  }
}

// ── Allocation categories ───────────────────────────────────────────────────────
// Order here IS the donut ring order. The colour assignment was validated for
// colour-vision-deficiency separation between ring neighbours (including the
// wrap-around pair) on both light and dark surfaces; reorder only if revalidated.

export interface CategoryMeta {
  key:        CategoryKey;
  label:      string;
  short:      string;
  colorLight: string;
  colorDark:  string;
  why:        string;
  covers:     string;
}

export const CATEGORIES: CategoryMeta[] = [
  {
    key: "strategy", label: "Strategy & planning", short: "Strategy",
    colorLight: "#1baf7a", colorDark: "#199e70",
    why: "Positioning, audience definition, and the campaign plan itself. This is what makes every later dollar point in the same direction.",
    covers: "Campaign strategy, audience research, messaging architecture, channel planning, and measurement planning.",
  },
  {
    key: "creative", label: "Branding & creative", short: "Creative",
    colorLight: "#eb6834", colorDark: "#d95926",
    why: "The message and the assets that carry it. Media placement amplifies whatever exists; strong creative is what gets amplified.",
    covers: "Concept development, campaign visuals, photography, video, ad graphics, and advertising copy across your selected channels.",
  },
  {
    key: "digital", label: "Digital experience", short: "Digital",
    colorLight: "#2a78d6", colorDark: "#3987e5",
    why: "Where clicks land. A campaign that pays for traffic into a page that can't convert loses money quietly.",
    covers: "Landing pages, lead-capture or checkout flow improvements, conversion tracking, and analytics setup.",
  },
  {
    key: "media", label: "Paid media", short: "Media",
    colorLight: "#cb2039", colorDark: "#e0455c",
    why: "The distribution budget: what platforms charge to put your message in front of the audience you chose.",
    covers: "Ad spend across your selected channels, including audience testing budgets inside each platform.",
  },
  {
    key: "management", label: "Campaign management", short: "Management",
    colorLight: "#4a3aa7", colorDark: "#9085e9",
    why: "Someone has to run it. Campaigns that launch and are never touched again underperform ones that are actively managed.",
    covers: "Campaign setup, monitoring, bid and budget adjustments, reporting, and coordination across channels.",
  },
  {
    key: "testing", label: "Testing & contingency", short: "Testing",
    colorLight: "#eda100", colorDark: "#c98500",
    why: "A reserve for learning. First assumptions are rarely the best ones. This is the budget that lets the campaign improve mid-flight.",
    covers: "Creative and audience A/B tests, landing-page experiments, and a buffer for costs that arrive mid-campaign.",
  },
];

export const CATEGORY_KEYS = CATEGORIES.map((c) => c.key);
export const categoryMeta = (key: CategoryKey): CategoryMeta =>
  CATEGORIES.find((c) => c.key === key) as CategoryMeta;

/**
 * Planning ranges (percentage points on a 100 scale).
 * `base` seeds the recommendation before answer-driven adjustments;
 * `hard` bounds what any recommendation may reach after adjustments.
 * These are starting ranges to refine, not universal rules.
 */
export const ALLOCATION_RANGES: Record<CategoryKey, { base: [number, number]; hard: [number, number] }> = {
  strategy:   { base: [8, 15],  hard: [6, 20] },
  creative:   { base: [15, 30], hard: [12, 34] },
  digital:    { base: [5, 20],  hard: [4, 24] },
  media:      { base: [30, 55], hard: [25, 60] },
  management: { base: [10, 20], hard: [8, 24] },
  testing:    { base: [5, 10],  hard: [4, 14] },
};

// ── Readiness ───────────────────────────────────────────────────────────────────
// Weights sum to 100. `affects` is the category whose recommendation grows when
// the item is missing; `points` is how many percentage points it adds (before
// normalisation). `clause` feeds the explanation copy: planning language, not
// judgment of the business.

export interface ReadinessItemMeta {
  key:     ReadinessKey;
  label:   string;
  weight:  number;
  affects: CategoryKey;
  points:  number;
  clause:  string;
}

export const READINESS_ITEMS: ReadinessItemMeta[] = [
  { key: "positioning",    label: "Clear brand positioning",            weight: 14, affects: "strategy", points: 3.0, clause: "brand positioning still needs to be defined" },
  { key: "message",        label: "Defined campaign message",           weight: 12, affects: "strategy", points: 2.0, clause: "the campaign message still needs development" },
  { key: "visualIdentity", label: "Professional visual identity",       weight: 10, affects: "creative", points: 1.8, clause: "visual identity work is still needed" },
  { key: "photography",    label: "Photography ready to use",           weight: 8,  affects: "creative", points: 1.6, clause: "photography still needs to be produced" },
  { key: "video",          label: "Video ready to use",                 weight: 8,  affects: "creative", points: 1.6, clause: "video still needs to be produced" },
  { key: "graphics",       label: "Campaign graphics",                  weight: 8,  affects: "creative", points: 1.6, clause: "campaign graphics still need to be designed" },
  { key: "adCopy",         label: "Advertising copy",                   weight: 8,  affects: "creative", points: 1.4, clause: "advertising copy still needs to be written" },
  { key: "landingPage",    label: "Optimized landing page",             weight: 12, affects: "digital",  points: 4.0, clause: "the landing page still needs work" },
  { key: "captureFlow",    label: "Lead-capture form or checkout flow", weight: 9,  affects: "digital",  points: 2.0, clause: "the lead-capture or purchase flow still needs work" },
  { key: "tracking",       label: "Conversion tracking & analytics",    weight: 11, affects: "digital",  points: 2.0, clause: "conversion tracking is not in place yet" },
];

export const READINESS_BANDS: { min: number; band: ReadinessBand; label: string; summary: string }[] = [
  { min: 85, band: "scale",      label: "Scale ready",        summary: "Your campaign foundation is in place. Most of your investment can go toward distribution and optimization." },
  { min: 65, band: "ready",      label: "Campaign ready",     summary: "The essentials exist. A modest foundation allocation keeps things sharp while media carries the plan." },
  { min: 40, band: "partial",    label: "Partially prepared", summary: "Some foundation pieces exist and some don't. Your plan reserves investment for the missing components before scaling media." },
  { min: 0,  band: "foundation", label: "Foundation required", summary: "Most campaign components still need development. Funding the message first will make every media dollar work harder." },
];

// ── Objectives ──────────────────────────────────────────────────────────────────
// Default unit economics are EDITABLE PLANNING ASSUMPTIONS surfaced to the user
// as such, never presented as benchmarks or promised performance.

export interface ObjectiveMeta {
  key:          ObjectiveKey;
  label:        string;
  /** What the goal counts. */
  unitNoun:     string;
  unitSingular: string;
  /** Goal is customers reached through a lead step (goal ÷ conversion = leads). */
  usesLeadStep: boolean;
  /**
   * Awareness: the cost input is a CPM (per 1,000 impressions) and media spend
   * includes frequency: impressions = reach x frequency, media = impressions / 1,000 x CPM.
   */
  perThousand:  boolean;
  /** Overrides the auto-built "Desired {unitNoun}" goal label when set. */
  goalLabel?:   string;
  costLabel:    string;
  defaultCostPerResult: number;
  defaultConversion:    number; // decimal
  /** Awareness only: default average exposures per person. A planning assumption. */
  defaultFrequency?:    number;
}

export const OBJECTIVES: ObjectiveMeta[] = [
  { key: "awareness", label: "Brand awareness",            unitNoun: "people reached", unitSingular: "person reached", usesLeadStep: false, perThousand: true,  goalLabel: "Desired audience reach", costLabel: "Estimated cost per 1,000 impressions (CPM)", defaultCostPerResult: 15, defaultConversion: 0.02, defaultFrequency: 3 },
  { key: "leads",     label: "Lead generation",            unitNoun: "leads",          unitSingular: "lead",           usesLeadStep: false, perThousand: false, costLabel: "Estimated cost per lead",                 defaultCostPerResult: 45, defaultConversion: 0.15 },
  { key: "sales",     label: "Online sales",               unitNoun: "sales",          unitSingular: "sale",           usesLeadStep: true,  perThousand: false, costLabel: "Estimated cost per lead",                 defaultCostPerResult: 35, defaultConversion: 0.12 },
  { key: "visits",    label: "Store visits",               unitNoun: "visits",         unitSingular: "visit",          usesLeadStep: false, perThousand: false, costLabel: "Estimated cost per visit",                defaultCostPerResult: 9,  defaultConversion: 0.2 },
  { key: "event",     label: "Event attendance",           unitNoun: "registrations",  unitSingular: "registration",   usesLeadStep: false, perThousand: false, costLabel: "Estimated cost per registration",         defaultCostPerResult: 25, defaultConversion: 0.5 },
  { key: "launch",    label: "Product or business launch", unitNoun: "customers",      unitSingular: "customer",       usesLeadStep: true,  perThousand: false, costLabel: "Estimated cost per lead",                 defaultCostPerResult: 50, defaultConversion: 0.1 },
  { key: "retention", label: "Customer retention",         unitNoun: "returning customers", unitSingular: "returning customer", usesLeadStep: false, perThousand: false, costLabel: "Estimated cost per returning customer", defaultCostPerResult: 30, defaultConversion: 0.3 },
];

export const objectiveMeta = (key: ObjectiveKey): ObjectiveMeta =>
  OBJECTIVES.find((o) => o.key === key) as ObjectiveMeta;

// ── Channels ────────────────────────────────────────────────────────────────────

export const CHANNELS: { key: ChannelKey; label: string }[] = [
  { key: "google-search",  label: "Google Search" },
  { key: "google-display", label: "Google Display" },
  { key: "youtube",        label: "YouTube" },
  { key: "meta-facebook",  label: "Meta (Facebook)" },
  { key: "instagram",      label: "Instagram" },
  { key: "linkedin",       label: "LinkedIn" },
  { key: "tiktok",         label: "TikTok" },
  { key: "programmatic",   label: "Programmatic" },
  { key: "email",          label: "Email" },
  { key: "other",          label: "Other" },
];

// ── Scenarios ───────────────────────────────────────────────────────────────────
// Scenarios change SCOPE, not just scale: reach factor, channel count, and
// allocation biases all differ. Biases are percentage points applied before
// normalisation, so a positive testing bias genuinely grows that category
// relative to the others rather than multiplying everything equally.

export interface ScenarioMeta {
  key:          ScenarioKey;
  label:        string;
  tagline:      string;
  description:  string;
  limitations:  string;
  /** Budget-first: share of the stated budget this scenario plans around. */
  budgetFactor: number;
  /** Goal-first: share of the stated goal this scenario reaches for. */
  goalFactor:   number;
  channelCap:   number;
  biases:       Partial<Record<CategoryKey, number>>;
}

export const SCENARIOS: ScenarioMeta[] = [
  {
    key: "essential", label: "Essential", tagline: "A focused start",
    description: "A focused campaign with the minimum viable strategic and creative foundation: fewer channels, a lean creative set, and a smaller testing reserve.",
    limitations: "Best for validating a campaign or working within a tight budget. Reach is deliberately limited, and there is less room to test alternatives if the first approach underperforms.",
    budgetFactor: 0.8, goalFactor: 0.7, channelCap: 2,
    biases: { testing: -1.5, creative: -2, management: -1 },
  },
  {
    key: "growth", label: "Growth", tagline: "The balanced plan",
    description: "A balanced investment with stronger creative coverage, meaningful testing, and room for ongoing optimization across a focused channel mix.",
    limitations: "Designed for sustained campaigns. It assumes you can commit to the full duration and act on what testing reveals.",
    budgetFactor: 1.0, goalFactor: 1.0, channelCap: 4,
    biases: {},
  },
  {
    key: "expansion", label: "Expansion", tagline: "Broader reach",
    description: "A broader campaign with more reach, additional creative variations, deeper testing, and greater scaling potential where the channel mix justifies it.",
    limitations: "The larger footprint needs active management and a genuine appetite for iteration; scale amplifies whatever is working and whatever isn't.",
    budgetFactor: 1.25, goalFactor: 1.35, channelCap: 8,
    biases: { testing: 1.5, creative: 1.5, management: 1 },
  },
];

export const scenarioMeta = (key: ScenarioKey): ScenarioMeta =>
  SCENARIOS.find((s) => s.key === key) as ScenarioMeta;

// ── Structural assumptions ──────────────────────────────────────────────────────

export const ASSUMPTIONS = {
  /** Below this monthly media spend per channel, a channel can't really learn. */
  minChannelSpendPerMonth: 600,
  /** Input guardrails (validation uses these; engine clamps defensively too). */
  minBudget: 100,
  maxBudget: 100_000_000,
  minGoal: 1,
  maxGoal: 10_000_000,
  minCostPerResult: 0.01,
  maxCostPerResult: 100_000,
  minConversion: 0.001,  // 0.1%
  maxConversion: 1,      // 100%
  minFrequency: 1,
  maxFrequency: 20,
  minMargin: 0.01,
  maxMargin: 0.95,
  /** Essential is recommended instead of Growth below this budget-first total. */
  essentialBudgetCutoff: 5_000,
  /** Deviation (in points) from the recommendation treated as "balanced". */
  balancedBandPoints: 4,
} as const;

// ── Duration presets ────────────────────────────────────────────────────────────

export const DURATION_PRESETS: { days: number; label: string }[] = [
  { days: 30,  label: "30 days" },
  { days: 60,  label: "60 days" },
  { days: 90,  label: "90 days" },
  { days: 180, label: "6 months" },
  { days: 365, label: "12 months" },
];

// ── Option lists for the profile step ───────────────────────────────────────────

export const AUDIENCE_FOCUS_OPTIONS: { key: AudienceFocus; label: string; hint?: string }[] = [
  { key: "businesses", label: "Businesses" },
  { key: "consumers",  label: "Consumers" },
  { key: "both",       label: "Both businesses and consumers" },
  { key: "community",  label: "Donors, members, or communities" },
];

export const BUSINESS_STAGES: { key: BusinessStage; label: string; hint: string }[] = [
  { key: "new",         label: "New or launching", hint: "Building an audience from zero" },
  { key: "growing",     label: "Growing",          hint: "Some traction, ready for more" },
  { key: "established", label: "Established",      hint: "Known brand, defending or expanding" },
];

export const MARKET_REACHES: { key: MarketReach; label: string }[] = [
  { key: "local",         label: "Local" },
  { key: "regional",      label: "Regional" },
  { key: "national",      label: "National" },
  { key: "international", label: "International" },
];

export const INDUSTRIES: string[] = [
  "Professional services",
  "Ecommerce and retail",
  "Events and entertainment",
  "Home services",
  "Hospitality",
  "Healthcare",
  "Nonprofit",
  "Other",
];

/** `max` bounds the realism checks; null means the size is unknown/unbounded. */
export const AUDIENCE_BANDS: { key: AudienceBand; label: string; max: number | null }[] = [
  { key: "unknown",   label: "Not sure",             max: null },
  { key: "under-10k", label: "Under 10,000",         max: 10_000 },
  { key: "10k-100k",  label: "10,000 – 100,000",     max: 100_000 },
  { key: "100k-1m",   label: "100,000 – 1 million",  max: 1_000_000 },
  { key: "over-1m",   label: "Over 1 million",       max: null },
];

export const audienceBandMeta = (key: AudienceBand) =>
  AUDIENCE_BANDS.find((b) => b.key === key) ?? AUDIENCE_BANDS[0];
