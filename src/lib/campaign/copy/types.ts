// ── Campaign calculator copy contract ───────────────────────────────────────────
// Every user-facing word in the calculator is declared here once and implemented
// per language. The shape does the enforcement: because the maps are keyed by
// the same unions the engine uses (`CategoryKey`, `ReadinessKey`, and so on), a
// missing Spanish entry is a TypeScript error, not an English word leaking onto
// a Spanish page.
//
// Prose that the engine composes at runtime is declared as a FUNCTION, not a
// string with placeholders. Spanish needs that freedom: gender agreement and
// pluralisation move with the data, and no amount of `{count} canales` gets
// "1 canal" right. Each language writes its own sentence.

import type {
  AudienceBand, AudienceFocus, BusinessStage, CategoryKey, ChannelKey,
  DestinationKey, MarketReach, ObjectiveKey, ReadinessBand, ReadinessGroupKey,
  ReadinessKey, ReadinessState, ScenarioKey, ComponentRelevance, Range,
} from "../types";
import type { FeasibilityStatus } from "../config";

export type Lang = "en" | "es";

/** Options rendered as a list of choices. */
export interface Choice<K extends string> { key: K; label: string; hint?: string }

export interface CalcCopy {
  lang: Lang;

  /** BCP-47 tag for Intl number and date formatting. */
  locale: string;

  meta: {
    pageTitle:       string;
    pageDescription: string;
    /** Shown in the app header and on the report masthead. */
    productName:     string;
    tagline:         string;
    slogan:          string;
    site:            string;
  };

  intro: {
    heading:     string;
    body:        string;
    emphasis:    string;
    cta:         string;
    reassurance: string;
    resumeLead:  string;
    resumeLink:  string;
  };

  nav: {
    back:        string;
    next:        string;
    seeResults:  string;
    startOver:   string;
    startOverConfirmTitle: string;
    startOverConfirmBody:  string;
    startOverConfirm:      string;
    cancel:      string;
    stepOf:      (current: number, total: number) => string;
  };

  steps: {
    labels: string[];
    profile: {
      heading: string; blurb: string;
      audienceFocus: string; stage: string; reach: string;
      industry: string; industryPlaceholder: string; currency: string;
    };
    objective: { heading: string; blurb: string };
    scope: {
      heading: string; blurb: string;
      duration: string; customDuration: string; days: string;
      channels: string; channelsHint: string;
      audience: string; audienceHint: string; timing: string; durationDays: string;
      timeSensitive: string; timeSensitiveHint: string;
    };
    destination: { heading: string; blurb: string };
    readiness: {
      heading: string; blurb: string;
      relevanceNote: string;
      notApplicable: string;
    };
    financial: {
      heading: string; blurb: string;
      modeBudget: string; modeGoal: string;
      budgetTotal: string; goalCount: string;
      avgValue: string; conversionRate: string; costPerResult: string;
      targetFrequency: string; marginPct: string; expectedRevenue: string;
      assumptionBadge: string;
      optional: string;
    };
    review: { heading: string; blurb: string; edit: string };
  };

  /** Validation messages, keyed by the code `validateStep` returns. */
  errors: Record<string, string>;

  results: {
    heading: string;
    blurb: string;
    recommended: string;
    whyThisAmount: string;
    whySuggest: string;
    protectedInvestment: string;
    mediaDistribution: string;
    campaignReserve: string;
    allocationTitle: string;
    adjustAllocation: string;
    resetAllocation: string;
    lockCategory: string;
    unlockCategory: string;
    categoryMinimum: string;
    tableView: string;
    print: string;
    copySummary: string;
    copied: string;
    adjustAnswers: string;
    totalInvestment: string;
    campaignAllocation: string;
    amount: string;
    share: string;
    category: string;
    /** Scenario card copy, which varies with what the budget can actually fund. */
    preparationPhase:  string;
    focusedPilot:      string;
    prepSprintTagline: string;
    noMediaActivation: string;
    reducedScope:      (channels: number) => string;
    scopeChannels:     (tagline: string, channels: number) => string;
    prepOnlyNote:      string;
    reducedScopeNote:  (selected: number) => string;
    extraNeeded:       (amount: string) => string;
    /** Allocation-slider footnotes. */
    mediaAdjustable:   string;
    floorDeferred:     (amount: string) => string;
    floorPartial:      (amount: string) => string;
    floorPlain:        (amount: string) => string;
    floorProtected:    string;
    currentPhaseAllocation: string;
    protectedBlurb:      string;
    belowMinimumBlurb:   (leanRange: string) => string;
    mediaBlurb:          string;
    reserveBlurb:        string;
    identity: (parts: { protectedAmount: string; media: string; reserve: string; total: string; funded: boolean }) => string;
  };

  cards: {
    startingPoint:     string;
    budgetCanDo:       string;
    phaseScope:        string;
    worthChecking:     string;
    breakEven:         string;
    allocationDetail:  string;
    otherScenarios:    string;
    assumptions:       string;
    disclaimerHeading: string;
  };

  /** Axis labels under the two meters. Four each, low to high. */
  meters: { readiness: string[]; feasibility: string[] };

  /** Static prose blocks that carry no interpolation. */
  prose: {
    startingPointFooter:   string;
    readinessMeterNote:    string;
    feasibilityFooter:     string;
    allocationFooter:      string;
    breakEvenFooter:       string;
    scenariosFooter:       string;
    assumptionsFooter:     string;
    nothingWorthChecking:  string;
    preparationCaveat:     string;
    quotedSeparately:      string;
    deferredFromPhase:     string;
    waysForward:           string;
    disclaimer:            string;
    disclaimerPrepared:    string;
    privacy:               string;
    howEstimatesWork:      string;
    howEstimatesBody:      string[];
  };

  /** Sentences the engine composes. Each language writes its own grammar. */
  phrases: {
    essentialsReady:   (ready: number, total: number) => string;
    componentsToReview:(n: number) => string;
    channelCount:      (n: number) => string;
    dayCount:          (n: number) => string;
    monthCount:        (n: number) => string;
    channelsSupported: (supported: number, selected: number) => string;
    feasibilityScore:  (score: number, label: string) => string;
    readinessScore:    (score: number, band: string) => string;
    planShown:         (scenario: string, total: string) => string;
    scenarioShownHere: string;
    heldSeparately:    string;
    notAnswered:       string;
    notNeeded:         string;
    planningAssumption:string;
    perPerson:         (n: number) => string;
    resultsGoal:       (n: number) => string;
    goalFirst:         (n: number) => string;
    alwaysOn:          string;
    fixedDate:         string;
  };

  /** Keyed metadata: the model lives in config.ts, the words live here. */
  categories:   Record<CategoryKey, { label: string; short: string; why: string; covers: string }>;
  objectives:   Record<ObjectiveKey, { label: string; hint: string; unitNoun: string; unitSingular: string }>;
  scenarios:    Record<ScenarioKey, { label: string; tagline: string; description: string; limitations: string }>;
  channels:     Record<ChannelKey, string>;
  destinations: Record<DestinationKey, string>;
  readinessItems:  Record<ReadinessKey, { label: string; hint: string }>;
  readinessGroups: Record<ReadinessGroupKey, { label: string; blurb: string }>;
  readinessStates: Record<ReadinessState, { label: string; short: string }>;
  readinessBands:  Record<ReadinessBand, { label: string; summary: string }>;
  relevance:       Record<ComponentRelevance, string>;
  feasibilityBands: Record<FeasibilityStatus, { label: string; short: string }>;
  feasibilityScoreLabels: string[];
  audienceFocus: Choice<AudienceFocus>[];
  stages:        Choice<BusinessStage>[];
  reaches:       Choice<MarketReach>[];
  audienceBands: Record<AudienceBand, string>;
  industries:    string[];
  durationPresets: Record<number, string>;

  /** Lists rendered verbatim. */
  lists: {
    leanScopeAssumptions:   string[];
    separateScopeAdditions: string[];
    scopeLevers:            string[];
    preparationInclusions:  string[];
    preparationTitle:       string;
  };

  /** The consultation CTA and its lead payload. */
  cta: {
    byStatus: Record<FeasibilityStatus, { heading: string; body: string; action: string }>;
    intents:  { key: string; label: string; hint: string }[];
    name: string; email: string; phone: string; optional: string;
    intentQuestion: string;
    disclosure: string;
    plusLine: string;
    submitting: string;
    reassurance: string;
    errorName: string; errorEmail: string; errorEmailInvalid: string;
    submitFailed: string;
    successHeading: (firstName: string) => string;
    successEmailed: (email: string) => string;
    successNotEmailed: string;
    successFollowUp: string;
    successUnchanged: string;
    download: string;
  };

  /** Labels used in the plan brief sent to the CRM and both emails. */
  brief: {
    planStatus: string; available: string; leanMinimum: string; completeScope: string;
    gapMinimum: string; gapComplete: string; planShown: string; startingPoint: string;
    essentialsNotReady: string; alsoMissing: string; channelsVsFunding: string;
    flagged: string;
    noMediaActivation: string;
    mediaSuffix: (amount: string) => string;
    channelsVsFundingValue: (selected: number, supported: number) => string;
  };

  report: {
    planningEstimate: string;
    notAQuote:        string;
    pageOf:           (page: number, total: number) => string;
    channelsLine:     (channels: string) => string;
    contradictionsTitle: string;
    figures: Record<string, string>;
    tableHeaders: {
      component: string; mattersHere: string; whereYouAre: string;
      scenario: string; estimatedRange: string; whatItChanges: string;
    };
  };

  /** Formats a range like "$6,000 to $9,000". */
  formatRange: (r: Range, formatMoney: (n: number) => string) => string;
}
