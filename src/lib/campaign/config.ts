// ── Campaign Investment Calculator: configuration ──────────────────────────────
// Every number in this file is a PLANNING ASSUMPTION, not a market guarantee.
// LV Branding should review and refine these before public launch; the engine in
// engine.ts only consumes them, so tuning happens here without touching math.

import type {
  AudienceBand, AudienceFocus, BusinessStage, CategoryKey, ChannelKey,
  ComponentRelevance, CurrencyCode, DestinationKey, MarketReach, ObjectiveKey,
  ReadinessBand, ReadinessGroupKey, ReadinessKey, ReadinessState, ScenarioKey,
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

/** Public estimates are ranges; a single number would be false precision. */
export function formatRange(r: { min: number; max: number }, currency: CurrencyCode = "USD"): string {
  const lo = Math.round(r.min);
  const hi = Math.round(r.max);
  if (hi <= lo) return formatMoney(lo, currency);
  return `${formatMoney(lo, currency)} to ${formatMoney(hi, currency)}`;
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
    key: "testing", label: "Testing and optimization", short: "Testing",
    colorLight: "#eda100", colorDark: "#c98500",
    why: "A reserve for learning. First assumptions are rarely the best ones. This is the budget that lets the campaign improve mid-flight.",
    covers: "Creative variations, audience and channel testing, landing-page experiments, controlled optimization, and measurement analysis.",
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
// Components are grouped by function, and how much each one matters is COMPUTED
// per campaign (see engine.ts `componentAssessments`) rather than assumed. A
// component that doesn't apply is excluded from the score entirely, so a Google
// Search campaign is never marked down for lacking video.
//
// `affects` is the allocation category that grows when a component is not ready;
// `points` is the percentage points it contributes at a full gap and full
// relevance (scaled down for recommended/optional). `clause` feeds explanation copy.

export interface ReadinessItemMeta {
  key:     ReadinessKey;
  group:   ReadinessGroupKey;
  label:   string;
  affects: CategoryKey;
  points:  number;
  clause:  string;
}

export const READINESS_GROUPS: { key: ReadinessGroupKey; label: string; blurb: string }[] = [
  { key: "foundation",  label: "Campaign foundation",         blurb: "The strategy everything else is built on." },
  { key: "creative",    label: "Creative assets",             blurb: "What your selected channels need to show." },
  { key: "destination", label: "Campaign destination",        blurb: "Where the campaign sends people." },
  { key: "measurement", label: "Measurement and optimization", blurb: "How you will know whether it worked." },
];

export const READINESS_ITEMS: ReadinessItemMeta[] = [
  // Campaign foundation
  { key: "positioning",    group: "foundation",  label: "Clear audience and positioning",    affects: "strategy", points: 3.0, clause: "audience and positioning still need to be defined" },
  { key: "objectiveOffer", group: "foundation",  label: "Defined campaign objective and desired audience response", affects: "strategy", points: 2.0, clause: "the campaign objective and desired response still need to be defined" },
  { key: "message",        group: "foundation",  label: "Campaign message",                  affects: "strategy", points: 2.0, clause: "the campaign message still needs development" },
  { key: "channelStrategy", group: "foundation", label: "Channel strategy",                  affects: "strategy", points: 1.4, clause: "the channel strategy still needs to be defined" },
  { key: "campaignPlan",   group: "foundation",  label: "Campaign plan",                     affects: "strategy", points: 1.6, clause: "the campaign plan still needs to be built" },
  { key: "visualIdentity", group: "foundation",  label: "Brand identity and visual direction", affects: "creative", points: 2.0, clause: "visual direction still needs work" },
  // Creative assets
  { key: "photography",    group: "creative",    label: "Photography",                       affects: "creative", points: 1.6, clause: "photography still needs to be produced" },
  { key: "video",          group: "creative",    label: "Video",                             affects: "creative", points: 2.0, clause: "video still needs to be produced" },
  { key: "graphics",       group: "creative",    label: "Campaign graphics",                 affects: "creative", points: 1.6, clause: "campaign graphics still need to be designed" },
  { key: "adCopy",         group: "creative",    label: "Advertising copy",                  affects: "creative", points: 1.4, clause: "advertising copy still needs to be written" },
  // Campaign destination
  { key: "landingPage",    group: "destination", label: "Landing page",                      affects: "digital",  points: 3.0, clause: "the landing page still needs work" },
  { key: "leadForm",       group: "destination", label: "Lead form",                         affects: "digital",  points: 1.6, clause: "the lead form still needs work" },
  { key: "checkoutFlow",   group: "destination", label: "Ecommerce or checkout flow",        affects: "digital",  points: 2.0, clause: "the checkout flow still needs work" },
  { key: "eventPage",      group: "destination", label: "Event registration page",           affects: "digital",  points: 1.6, clause: "the registration page still needs work" },
  // Measurement and optimization
  { key: "tracking",       group: "measurement", label: "Conversion tracking",               affects: "digital",  points: 1.8, clause: "conversion tracking is not in place yet" },
  { key: "analytics",      group: "measurement", label: "Analytics",                         affects: "digital",  points: 1.2, clause: "analytics still need to be set up" },
  { key: "pixels",         group: "measurement", label: "Advertising platform tracking or pixels", affects: "digital", points: 1.0, clause: "platform tracking still needs to be installed" },
  { key: "successMetrics", group: "measurement", label: "Defined success metrics",           affects: "strategy", points: 1.0, clause: "success metrics still need to be agreed" },
];

export const readinessItemMeta = (key: ReadinessKey): ReadinessItemMeta =>
  READINESS_ITEMS.find((i) => i.key === key) as ReadinessItemMeta;

/** How ready one component is. `score` is the fraction of its weight it earns. */
export const READINESS_STATES: { key: ReadinessState; label: string; short: string; score: number }[] = [
  { key: "ready",  label: "Ready to use",            short: "Ready",       score: 1 },
  { key: "review", label: "Exists, but needs review", short: "Needs review", score: 0.5 },
  { key: "create", label: "Needs to be created",     short: "To create",   score: 0 },
  { key: "unsure", label: "Not sure",                short: "Not sure",    score: 0.25 },
];

export const readinessStateMeta = (key: ReadinessState) =>
  READINESS_STATES.find((s) => s.key === key) as (typeof READINESS_STATES)[number];

/** Score weight per relevance tier. `not-required` is excluded from the score. */
export const RELEVANCE_WEIGHTS: Record<ComponentRelevance, number> = {
  essential: 3, recommended: 2, optional: 1, "not-required": 0,
};

/** How strongly a gap in this component pushes budget toward its category. */
export const RELEVANCE_GAP_MULTIPLIER: Record<ComponentRelevance, number> = {
  essential: 1, recommended: 0.6, optional: 0.25, "not-required": 0,
};

export const RELEVANCE_LABELS: Record<ComponentRelevance, string> = {
  essential:      "Essential for this plan",
  recommended:    "Recommended",
  optional:       "Optional",
  "not-required": "Not required",
};

// Channel capability sets. These drive which creative assets a campaign actually
// needs, so the checklist responds to the channel mix instead of asking for
// everything. [ASSUMPTION]
export const CHANNELS_REQUIRING_VIDEO: ChannelKey[] = ["youtube", "tiktok"];
export const CHANNELS_FAVOURING_VIDEO: ChannelKey[] = ["meta-facebook", "instagram", "programmatic"];
/**
 * Anywhere video can run at all. If none of the selected channels appear here,
 * video is excluded from the plan rather than merely deprioritised: a text-only
 * Search campaign should not be marked down for having no video.
 */
export const CHANNELS_SUPPORTING_VIDEO: ChannelKey[] =
  ["youtube", "tiktok", "meta-facebook", "instagram", "programmatic", "google-display", "linkedin"];
export const CHANNELS_REQUIRING_IMAGERY: ChannelKey[] =
  ["google-display", "meta-facebook", "instagram", "programmatic", "tiktok"];
/** Channels that can host a lead form natively, without a landing page. */
export const CHANNELS_WITH_NATIVE_FORMS: ChannelKey[] =
  ["meta-facebook", "instagram", "linkedin", "tiktok"];

// ── Feasibility ─────────────────────────────────────────────────────────────────
// Readiness asks whether the materials exist. Feasibility asks whether the money,
// time, channels, and reach actually line up. They are different questions, and a
// budget can be allocated intelligently while still being far too small.
//
// EVERY NUMBER BELOW IS A PLANNING ASSUMPTION. They are deliberately conservative
// floors, not quotes, and LV Branding should replace them with real production
// ranges before launch.

/*
 * ── Market calibration ────────────────────────────────────────────────────────
 * Costs are built from EFFORT (hours) x a blended rate, plus explicit
 * pass-through amounts for third-party spend. Everything is a RANGE, because the
 * underlying market inputs are ranges and publishing a single number would be
 * false precision.
 *
 * Two scopes are costed INDEPENDENTLY (never one discounted from the other):
 *   J_full  every applicable component, at full scope
 *   J_min   the lean, professionally responsible one-channel campaign
 *
 * Calibration source: LV Branding's own historical hours, vendor costs,
 * utilization, overhead, and target margin should replace these before launch.
 * The starting figures come from published market references (Clutch, 4A's,
 * AgencyAnalytics, Unbounce) and are PLANNING ASSUMPTIONS, not quotes.
 */

export interface Range { min: number; max: number }

export const rangeOf = (min: number, max: number): Range => ({ min, max });
export const addRange = (a: Range, b: Range): Range => ({ min: a.min + b.min, max: a.max + b.max });
export const scaleRange = (r: Range, f: number): Range => ({ min: r.min * f, max: r.max * f });
export const maxRange = (a: Range, b: Range): Range =>
  ({ min: Math.max(a.min, b.min), max: Math.max(a.max, b.max) });
export const emptyRange = (): Range => ({ min: 0, max: 0 });

/** Blended hourly rate for specialist digital-marketing work. [ASSUMPTION] */
export const BLENDED_RATE: Range = { min: 100, max: 149 };

/**
 * Bundling and integration factor (beta). Campaign tasks overlap: positioning
 * informs messaging, messaging informs copy, channel strategy sits inside
 * campaign planning, analytics and conversion tracking share implementation.
 * Summing every component at full standalone cost over-counts the work.
 * NEVER applied to media or third-party pass-through.
 */
export const BUNDLING: Range = { min: 0.65, max: 0.85 };

/** Base campaign setup and project cost, charged once. [ASSUMPTION] */
export const BASE_SETUP_COST: Range = { min: 400, max: 900 };

export interface ComponentEffort {
  /** Hours at full scope. */
  fullHours: number;
  /**
   * Hours inside the lean minimum viable campaign. 0 means the component is
   * NOT in J_min at all: the lean scope assumes it already exists or is
   * deferred to a separate phase.
   */
  leanHours: number;
  /** Readiness factor when the component exists but needs review (0.25 to 0.5). */
  review: number;
  /** Third-party spend, which bundling must never reduce. */
  passThrough?: Range;
  /**
   * Major custom development is exempt from bundling: it does not share effort
   * with strategy or creative work.
   */
  bundlingExempt?: boolean;
}

export const COMPONENT_EFFORT: Record<ReadinessKey, ComponentEffort> = {
  // Strategy and planning
  positioning:     { fullHours: 18, leanHours: 2, review: 0.40 },
  objectiveOffer:  { fullHours:  7, leanHours: 1, review: 0.30 },
  message:         { fullHours: 11, leanHours: 2, review: 0.40 },
  channelStrategy: { fullHours:  8, leanHours: 0, review: 0.35 },
  campaignPlan:    { fullHours: 10, leanHours: 2, review: 0.30 },
  successMetrics:  { fullHours:  4, leanHours: 1, review: 0.30 },
  // Branding and creative. Lean scope reuses existing identity and runs no
  // custom photo or video production; those are separate scope additions.
  visualIdentity:  { fullHours: 24, leanHours: 0, review: 0.25 },
  photography:     { fullHours:  6, leanHours: 0, review: 0.45, passThrough: { min:  800, max: 2_500 } },
  video:           { fullHours: 10, leanHours: 0, review: 0.45, passThrough: { min: 1_500, max: 6_000 } },
  graphics:        { fullHours:  9, leanHours: 4, review: 0.40 },
  adCopy:          { fullHours:  6, leanHours: 3, review: 0.50 },
  // Digital experience. Lean scope assumes a working website or store already
  // exists and only basic tracking is configured.
  landingPage:     { fullHours: 20, leanHours: 0, review: 0.40, bundlingExempt: true },
  leadForm:        { fullHours:  7, leanHours: 0, review: 0.35 },
  checkoutFlow:    { fullHours: 24, leanHours: 0, review: 0.35, bundlingExempt: true },
  eventPage:       { fullHours: 12, leanHours: 0, review: 0.35 },
  tracking:        { fullHours:  9, leanHours: 3, review: 0.40 },
  analytics:       { fullHours:  6, leanHours: 2, review: 0.35 },
  pixels:          { fullHours:  4, leanHours: 1, review: 0.35 },
};

/** Components the lean minimum viable campaign actually includes (J_min). */
export const LEAN_SCOPE_COMPONENTS: ReadinessKey[] =
  (Object.keys(COMPONENT_EFFORT) as ReadinessKey[]).filter((k) => COMPONENT_EFFORT[k].leanHours > 0);

/**
 * Absolute operational floors per protected category (F_k) for a lean,
 * one-channel, 30-day campaign that reuses existing business infrastructure.
 * A category minimum is max(F_k, bundled effort cost), so the floor holds even
 * when the effort maths lands lower. [ASSUMPTION]
 */
export const LEAN_CATEGORY_FLOORS: Record<CategoryKey, Range> = {
  strategy:   { min: 500, max: 1_000 },
  creative:   { min: 600, max: 1_500 },
  digital:    { min: 500, max: 1_500 },
  management: { min: 500, max: 1_000 },
  testing:    { min: 150, max:   400 },
  media:      { min: 500, max: 1_500 },
};

/** What the lean scope assumes, shown to the user so the exclusions are explicit. */
export const LEAN_SCOPE_ASSUMPTIONS: string[] = [
  "One advertising channel",
  "One campaign objective",
  "One primary audience",
  "One campaign concept",
  "Limited copy and graphics",
  "Existing brand identity",
  "Existing website or ecommerce system",
  "Basic tracking setup",
  "No custom photography production",
  "No custom video production",
  "No new ecommerce development",
  "Basic campaign management and reporting",
];

/** Work that sits outside the lean minimum and is quoted separately. */
export const SEPARATE_SCOPE_ADDITIONS: string[] = [
  "Custom video production",
  "Custom photography production",
  "Brand identity development",
  "New landing-page or ecommerce development",
  "Advanced integrations",
  "Additional channels",
  "Additional creative formats and variations",
];

/** Readiness factors. `review` is per component; see COMPONENT_EFFORT. */
export const READINESS_COST_FACTORS = {
  ready:  0,
  create: 1,
  /** "Not sure" carries discovery effort plus an uncertainty reserve. */
  unsureBase: 0.25,
  discoveryReserve: 0.15,
} as const;

/**
 * Strategy scales with how complicated the campaign is to plan:
 * F_scope = 1 + F_channels + F_market + F_duration + F_audience. Applied to the
 * full scope only; the lean scope is one channel by definition. [ASSUMPTION]
 */
export const SCOPE_FACTORS = {
  perExtraChannel: 0.06,
  maxChannels:     0.30,
  market: { local: 0, regional: 0.05, national: 0.12, international: 0.20 } as Record<MarketReach, number>,
  per30Days:       0.02,
  maxDuration:     0.15,
  audience: {
    unknown: 0, "under-10k": 0, "10k-100k": 0.03, "100k-1m": 0.08, "over-1m": 0.15,
  } as Record<AudienceBand, number>,
} as const;

/** Practical monthly media minimum per channel. Platforms differ. [ASSUMPTION] */
export const CHANNEL_MEDIA_MINIMUM: Record<ChannelKey, number> = {
  "google-search":  700,
  "google-display": 500,
  youtube:          900,
  "meta-facebook":  600,
  instagram:        600,
  linkedin:       1_200,
  tiktok:           700,
  programmatic:   1_500,
  email:            300,
  other:            600,
};

/**
 * Adapting one concept into a channel's formats. The concept itself is charged
 * once, not re-invented per channel. [ASSUMPTION]
 */
export const CHANNEL_ADAPTATION_COST: Record<ChannelKey, number> = {
  "google-search":  250,
  "google-display": 550,
  youtube:          900,
  "meta-facebook":  500,
  instagram:        500,
  linkedin:         450,
  tiktok:           750,
  programmatic:     600,
  email:            350,
  other:            450,
};

export const CREATIVE = {
  /** The campaign concept, charged once when any creative work is outstanding. */
  conceptCost: 1_800,
  /** Each additional creative variation beyond the first. */
  perVariationCost: 320,
} as const;

/** G_min = max(G_base, r_G × M_required) + G_complexity. [ASSUMPTION] */
export const MANAGEMENT = {
  base:         1_200,
  rate:          0.18,
  perChannel:      250,
  perVariation:    120,
  perDay:            6,
  reporting:       400,
} as const;

/** T_min = max(T_base, r_T × (B_min + D_min + M_required)). [ASSUMPTION] */
export const TESTING = {
  base:  800,
  rate: 0.08,
} as const;

/** R = r_R × (S + B + D + M + G). Set `rate: 0` to remove the reserve. */
export const RESERVE = {
  rate: 0.05,
} as const;

/**
 * Feasibility statuses come from the detailed budget rules, not from the score.
 * The score is a separate 0-100 read on how close the budget is to the
 * requirement, and its thresholds are configurable.
 */
export type FeasibilityStatus =
  | "preparation-only" | "campaign-preparation" | "focused-pilot" | "scope-supported";

export const FEASIBILITY_BANDS: {
  status: FeasibilityStatus; label: string; short: string;
}[] = [
  {
    status: "scope-supported", label: "Selected scope supported",
    short: "The available investment supports the estimated complete-scope requirements, subject to professional review.",
  },
  {
    status: "focused-pilot", label: "Focused pilot",
    short: "A reduced one-channel campaign may be feasible. The plan lists what is included, excluded, reused, and deferred.",
  },
  {
    status: "campaign-preparation", label: "Campaign preparation",
    short: "The minimum campaign foundation may be supported, but the remaining investment does not meet the minimum practical media requirement.",
  },
  {
    status: "preparation-only", label: "Preparation phase only",
    short: "The available investment is below the lean professional minimum for responsible campaign activation. It can fund a defined strategy or preparation sprint, not a complete campaign.",
  },
];

export const feasibilityBand = (status: FeasibilityStatus) =>
  FEASIBILITY_BANDS.find((b) => b.status === status) as (typeof FEASIBILITY_BANDS)[number];

/**
 * What a preparation-only phase can honestly deliver. Media activation and
 * complete campaign delivery are explicitly excluded.
 */
export const PREPARATION_PHASE = {
  title: "Strategy and setup sprint",
  inclusions: [
    "Campaign objective and audience definition",
    "One-channel recommendation",
    "Core message direction",
    "Basic activation plan",
  ],
  /** Categories a preparation sprint actually funds. */
  categories: ["strategy", "testing"] as CategoryKey[],
} as const;

/** F_budget = min(100, A / I_full × 100). Thresholds are configurable. */
export const FEASIBILITY_SCORE_BANDS: { min: number; label: string }[] = [
  { min: 100, label: "Complete scope supported" },
  { min:  80, label: "Workable with adjustments" },
  { min:  50, label: "Focused pilot" },
  { min:   0, label: "Preparation or scope revision required" },
];

/** Ways to reduce cost responsibly, offered instead of cutting a protected line. */
export const SCOPE_LEVERS: string[] = [
  "Use existing assets",
  "Remove video",
  "Reduce creative variations",
  "Remove channels",
  "Shorten the campaign",
  "Simplify the destination",
  "Separate foundation and activation into phases",
];

// ── Campaign destination ────────────────────────────────────────────────────────

export const DESTINATIONS: { key: DestinationKey; label: string }[] = [
  { key: "landing-page",       label: "Visit a landing page" },
  { key: "lead-form",          label: "Complete a lead form" },
  { key: "buy-online",         label: "Buy online" },
  { key: "physical-location",  label: "Visit a physical location" },
  { key: "event-registration", label: "Register for an event" },
  { key: "call-message",       label: "Call or message the business" },
  { key: "none",               label: "No direct action; this is an awareness campaign" },
];

/**
 * Which destination components matter, per destination answer. Anything absent
 * from a row is treated as `not-required` and excluded from the score. [ASSUMPTION]
 */
export const DESTINATION_RULES:
  Record<DestinationKey, Partial<Record<ReadinessKey, ComponentRelevance>>> = {
  "landing-page":       { landingPage: "essential",   leadForm: "optional" },
  "lead-form":          { leadForm: "essential",      landingPage: "recommended" },
  "buy-online":         { checkoutFlow: "essential",  landingPage: "recommended", leadForm: "optional" },
  "physical-location":  { landingPage: "recommended", leadForm: "optional" },
  "event-registration": { eventPage: "essential",     landingPage: "recommended", leadForm: "optional" },
  "call-message":       { landingPage: "recommended", leadForm: "optional" },
  "none":               { landingPage: "optional" },
};

export const READINESS_BANDS: { min: number; band: ReadinessBand; label: string; summary: string }[] = [
  { min: 85, band: "scale",      label: "Scale ready",        summary: "Your campaign foundation is in place. Most of your investment can go toward distribution and optimization." },
  { min: 65, band: "ready",      label: "Campaign ready",     summary: "The essentials exist. A modest foundation allocation keeps things sharp while media carries the plan." },
  { min: 40, band: "partial",    label: "Partially prepared", summary: "Some pieces are ready and some are not. Your plan reserves investment for the components that still need attention before scaling media." },
  { min: 0,  band: "foundation", label: "Foundation required", summary: "The components this campaign depends on still need development. Funding the message first will make every media dollar work harder." },
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
  /** Creative variations this scenario plans for. Drives cost and management. */
  creativeVariations: number;
  biases:       Partial<Record<CategoryKey, number>>;
}

export const SCENARIOS: ScenarioMeta[] = [
  {
    key: "essential", label: "Essential", tagline: "A focused start",
    description: "A focused campaign with the minimum viable strategic and creative foundation: fewer channels, a lean creative set, and a smaller testing reserve.",
    limitations: "Best for validating a campaign or working within a tight budget. Reach is deliberately limited, and there is less room to test alternatives if the first approach underperforms.",
    budgetFactor: 0.8, goalFactor: 0.7, channelCap: 2, creativeVariations: 2,
    biases: { testing: -1.5, creative: -2, management: -1 },
  },
  {
    key: "growth", label: "Growth", tagline: "The balanced plan",
    description: "A balanced investment with stronger creative coverage, meaningful testing, and room for ongoing optimization across a focused channel mix.",
    limitations: "Designed for sustained campaigns. It assumes you can commit to the full duration and act on what testing reveals.",
    budgetFactor: 1.0, goalFactor: 1.0, channelCap: 4, creativeVariations: 4,
    biases: {},
  },
  {
    key: "expansion", label: "Expansion", tagline: "Broader reach",
    description: "A broader campaign with more reach, additional creative variations, deeper testing, and greater scaling potential where the channel mix justifies it.",
    limitations: "The larger footprint needs active management and a genuine appetite for iteration; scale amplifies whatever is working and whatever isn't.",
    budgetFactor: 1.25, goalFactor: 1.35, channelCap: 8, creativeVariations: 7,
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
