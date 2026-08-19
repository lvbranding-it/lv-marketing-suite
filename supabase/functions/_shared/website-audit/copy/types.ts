import type {
  AuditDimension,
  BusinessType,
  CheckOutcome,
  ConversionAction,
  EvidenceType,
  OpportunityRoute,
  ReviewRecency,
  RuleId,
  ScoreBand,
  TernaryAnswer,
  WebsitePurpose,
} from "../types.ts";

export interface Choice<T extends string> {
  value: T;
  label: string;
  hint?: string;
}

export interface AuditCopy {
  meta: {
    title: string;
    description: string;
    productName: string;
    shortName: string;
    mobileName: string;
    descriptor: string;
  };
  common: {
    language: string;
    english: string;
    spanish: string;
    back: string;
    continue: string;
    startOver: string;
    cancel: string;
    optional: string;
    website: string;
    close: string;
    yes: string;
    no: string;
  };
  landing: {
    eyebrow: string;
    heading: string;
    emphasis: string;
    body: string;
    urlLabel: string;
    urlPlaceholder: string;
    cta: string;
    workingCta: string;
    reassurance: string;
    acceptTerms: string;
    termsRequired: string;
    termsLead: string;
    terms: string;
    termsBody: string;
    privacy: string;
    sampleLead: string;
    sampleCta: string;
    representative: string;
    representativeBody: string;
    evidence: string;
    evidenceBody: string;
    useful: string;
    usefulBody: string;
    dimensionEyebrow: string;
    dimensionHeading: string;
    dimensionBody: string;
    steps: { number: string; title: string; body: string }[];
    stepsHeading: string;
    badges: string[];
  };
  context: {
    progress: string;
    heading: string;
    body: string;
    businessType: string;
    audience: string;
    audienceHint: string;
    audiencePlaceholder: string;
    purpose: string;
    conversionAction: string;
    differentiation: string;
    differentiationHint: string;
    expectedResults: string;
    expectedResultsHint: string;
    lastReviewed: string;
    required: string;
    submit: string;
    businessTypes: Choice<BusinessType>[];
    purposes: Choice<WebsitePurpose>[];
    conversionActions: Choice<ConversionAction>[];
    ternary: Choice<TernaryAnswer>[];
    reviewRecency: Choice<ReviewRecency>[];
  };
  analyzing: {
    eyebrow: string;
    heading: string;
    body: string;
    stages: string[];
    patience: string;
    failedHeading: string;
    failedBody: string;
    tryAgain: string;
    sampleInstead: string;
  };
  results: {
    sampleBanner: string;
    sampleBannerBody: string;
    eyebrow: string;
    reportFor: string;
    auditedOn: string;
    pagesAnalyzed: (count: number) => string;
    pageLanguage: string;
    pagePreview: string;
    pagePreviewNote: string;
    pageScreenshotNote: string;
    pageScreenshotAlt: string;
    englishPage: string;
    spanishPage: string;
    unknownPage: string;
    opportunityScore: string;
    outOf: string;
    coverage: string;
    coverageShort: string;
    coverageBody: string;
    diagnosis: Record<ScoreBand, string>;
    dimensionHeading: string;
    dimensionBody: string;
    working: string;
    friction: string;
    noStrength: string;
    noFriction: string;
    nextAction: string;
    protectDimension: string;
    priorityEyebrow: string;
    priorityHeading: string;
    priorityBody: string;
    priorityHeadingClear: string;
    priorityBodyClear: string;
    fixNow: string;
    fixNowHint: string;
    planNext: string;
    planNextHint: string;
    protect: string;
    protectHint: string;
    fullFindings: string;
    fullFindingsBody: string;
    findingsCount: (count: number) => string;
    notMeasured: string;
    pageScope: string;
    analyzed: string;
    labUnavailable: string;
    pageScopeIncomplete: string;
    aiDisclaimer: string;
    runAnother: string;
    sampleCtaHeading: string;
    sampleCtaBody: string;
    sampleCtaAction: string;
  };
  dimensions: Record<AuditDimension, { label: string; short: string; description: string }>;
  bands: Record<ScoreBand, { label: string; meaning: string }>;
  evidence: Record<EvidenceType, { label: string; description: string }>;
  outcomes: Record<CheckOutcome, string>;
  rules: Record<RuleId, {
    title: string;
    pass: string;
    partial: string;
    fail: string;
    notMeasured: string;
    recommendation: string;
  }>;
  routes: Record<OpportunityRoute, {
    label: string;
    heading: string;
    body: string;
    action: string;
  }>;
  lead: {
    supporting: string;
    openForm: string;
    heading: string;
    body: string;
    name: string;
    email: string;
    company: string;
    pathway: string;
    timeline: string;
    context: string;
    contextPlaceholder: string;
    consent: string;
    disclosure: string;
    submit: string;
    submitting: string;
    successHeading: string;
    successBody: string;
    error: string;
    required: string;
    invalidEmail: string;
    timelines: Choice<"now" | "one-three" | "three-six" | "exploring">[];
  };
  errors: {
    urlRequired: string;
    urlInvalid: string;
    urlPublicOnly: string;
    contextRequired: string;
    auditUnavailable: string;
    rateLimited: string;
    siteUnreachable: string;
    siteTimeout: string;
    unsupportedContent: string;
    unhealthyResponse: string;
    responseTooLarge: string;
    redirectFailed: string;
    resultMissing: string;
    resultExpired: string;
    resultVersionUnsupported: string;
    resultUnavailable: string;
    retryResult: string;
  };
  footer: string;
}
