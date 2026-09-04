/** Stable, language-independent audit contract shared by the browser and Edge Function. */
export const AUDIT_VERSION = "lv-website-opportunity-v1" as const;

export const DIMENSIONS = [
  "experience",
  "positioning",
  "search",
  "aiReadiness",
  "technical",
] as const;

export const RULE_IDS = [
  "experience.mobileViewport",
  "experience.headingStructure",
  "experience.linkClarity",
  "experience.imageAlternatives",
  "experience.controlNames",
  "experience.accessibilityLab",
  "positioning.offerClarity",
  "positioning.audienceRelevance",
  "positioning.primaryCta",
  "positioning.differentiation",
  "positioning.trustEvidence",
  "positioning.conversionPath",
  "positioning.expectedResults",
  "search.indexability",
  "search.title",
  "search.description",
  "search.canonical",
  "search.primaryHeading",
  "search.internalLinks",
  "search.imageText",
  "search.structuredData",
  "search.pageDiscovery",
  "search.seoLab",
  "ai.entityLanguage",
  "ai.serviceLanguage",
  "ai.answerStructure",
  "ai.evidenceAuthorship",
  "ai.machineReadableOrganization",
  "ai.crawlableContent",
  "technical.https",
  "technical.responseHealth",
  "technical.rendering",
  "technical.mobilePerformance",
  "technical.coreWebVitals",
  "technical.bestPracticesLab",
] as const;

export type AuditDimension = (typeof DIMENSIONS)[number];
export type RuleId = (typeof RULE_IDS)[number];
export type AuditLanguage = "en" | "es";
export type DetectedLanguage = AuditLanguage | "unknown";
export type EvidenceType = "verified" | "inferred" | "selfReported" | "needsReview";
export type CheckOutcome = "pass" | "partial" | "fail" | "notMeasured";
export type ScoreBand = "strong" | "friction" | "constrained" | "rebuild";
export type AuditPhase = "landing" | "context" | "analyzing" | "results";

export type BusinessType =
  | "professional-services"
  | "local-business"
  | "ecommerce"
  | "nonprofit"
  | "b2b"
  | "platform"
  | "other";

export type WebsitePurpose =
  | "generate-leads"
  | "sell"
  | "book"
  | "educate"
  | "partners"
  | "support";

export type ConversionAction =
  | "contact"
  | "request-quote"
  | "book"
  | "buy"
  | "sign-up"
  | "use-tool"
  | "call"
  | "other";

export type TernaryAnswer = "yes" | "no" | "unsure";
export type ReviewRecency = "six-months" | "one-year" | "two-years" | "unknown";

export interface AuditAnswers {
  businessType: BusinessType | null;
  audience: string;
  purpose: WebsitePurpose | null;
  conversionAction: ConversionAction | null;
  differentiation: TernaryAnswer | null;
  expectedResults: TernaryAnswer | null;
  lastReviewed: ReviewRecency | null;
}

export interface PageSignals {
  url: string;
  finalUrl: string;
  pageType: "submitted" | "home" | "service" | "about" | "contact" | "resource" | "other";
  status: number;
  contentType: string;
  title: string;
  titleLength: number;
  description: string;
  descriptionLength: number;
  canonical: string | null;
  robots: string | null;
  htmlLang: string | null;
  hasViewport: boolean;
  h1Count: number;
  h1Text: string;
  headings: { level: number; text: string }[];
  headingSkips: number;
  wordCount: number;
  sectionCount: number;
  linkCount: number;
  internalLinkCount: number;
  unclearLinkCount: number;
  brokenAnchorCount: number;
  imageCount: number;
  imagesWithAlt: number;
  controlCount: number;
  namedControlCount: number;
  formCount: number;
  jsonLdCount: number;
  jsonLdValidCount: number;
  schemaTypes: string[];
  hasOrganizationSchema: boolean;
  hasServiceSchema: boolean;
  hasAuthorSignal: boolean;
  hasAddressSignal: boolean;
  hasContactSignal: boolean;
  hasCtaSignal: boolean;
  ctaLabels: string[];
  /** CTA labels backed by a non-inert link or a native form submission control. */
  actionableCtaLabels: string[];
  ctaTargets: { label: string; destination: string; kind: "link" | "form" }[];
  hasTrustSignal: boolean;
  hasServiceLanguage: boolean;
  hasEntityLanguage: boolean;
  hasAudienceLanguage: boolean;
  directAnswerCount: number;
  visibleContentLength: number;
}

export interface LabSignals {
  measured: boolean;
  performanceScore: number | null;
  accessibilityScore: number | null;
  bestPracticesScore: number | null;
  seoScore: number | null;
  lcpMs: number | null;
  cls: number | null;
  tbtMs: number | null;
  screenshotDataUrl?: string | null;
  source: "pagespeed" | "none";
}

export interface AuditObservation {
  auditId: string;
  /** Anonymous bearer used only to read or append events to this audit. */
  accessToken?: string;
  requestedUrl: string;
  finalUrl: string;
  normalizedDomain: string;
  createdAt: string;
  detectedLanguage: DetectedLanguage;
  pages: PageSignals[];
  lab: LabSignals;
  /**
   * True while the lab measurement is still running in the background.
   *
   * PageSpeed needs 25 to 40 seconds on a real site, which is longer than a
   * visitor should wait for a report that is already complete without it. The
   * audit returns as soon as the HTML analysis is done and fills the lab in
   * afterwards; the client polls while this is true.
   */
  labPending?: boolean;
  warnings: string[];
  /** Includes the submitted page; used to distinguish sparse navigation from fetch failures. */
  discoveredPageCount?: number;
  failedPageCount?: number;
  cached?: boolean;
  sample?: boolean;
  answers?: AuditAnswers;
  provenance?: {
    source: "live-crawl" | "demo-fixture";
    crawlerVersion: string;
    rulesetVersion: string;
  };
}

export interface AuditCheck {
  ruleId: RuleId;
  dimension: AuditDimension;
  outcome: CheckOutcome;
  evidenceType: EvidenceType;
  earnedPoints: number;
  maxPoints: number;
  severity: 1 | 2 | 3 | 4;
  businessImpact: 1 | 2 | 3 | 4;
  effort: 1 | 2 | 3 | 4;
  priority: number;
  evidenceValue?: string | number | boolean | null;
  pageUrl?: string;
}

export interface DimensionScore {
  key: AuditDimension;
  score: number;
  band: ScoreBand;
  measuredPoints: number;
  availablePoints: number;
  totalPoints: number;
  coverage: number;
  checks: AuditCheck[];
}

export interface PriorityPlan {
  fixNow: AuditCheck | null;
  planNext: AuditCheck | null;
  protect: AuditCheck | null;
}

export type OpportunityRoute = "improve" | "ux" | "redesign" | "platform";

export interface AuditReport {
  version: typeof AUDIT_VERSION;
  auditId: string;
  accessToken?: string;
  url: string;
  domain: string;
  createdAt: string;
  detectedLanguage: DetectedLanguage;
  pages: PageSignals[];
  lab: LabSignals;
  /** True while the lab measurement is still running; see Observation.labPending. */
  labPending?: boolean;
  warnings: string[];
  sample: boolean;
  overallScore: number;
  band: ScoreBand;
  coverage: number;
  dimensions: Record<AuditDimension, DimensionScore>;
  checks: AuditCheck[];
  priorityPlan: PriorityPlan;
  opportunityRoute: OpportunityRoute;
}

export interface PersistedAuditState {
  phase: AuditPhase;
  url: string;
  answers: AuditAnswers;
  auditId?: string;
  observation?: AuditObservation;
}

export const emptyAuditAnswers = (): AuditAnswers => ({
  businessType: null,
  audience: "",
  purpose: null,
  conversionAction: null,
  differentiation: null,
  expectedResults: null,
  lastReviewed: null,
});
