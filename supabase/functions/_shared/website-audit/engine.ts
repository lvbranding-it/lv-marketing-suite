import {
  AUDIT_VERSION,
  DIMENSIONS,
  type AuditAnswers,
  type AuditCheck,
  type AuditDimension,
  type AuditObservation,
  type AuditReport,
  type CheckOutcome,
  type DimensionScore,
  type EvidenceType,
  type OpportunityRoute,
  type PageSignals,
  type PriorityPlan,
  type RuleId,
  type ScoreBand,
} from "./types.ts";
import { matchesSiteSignal } from "./heuristics.ts";

export const DIMENSION_WEIGHTS: Record<AuditDimension, number> = {
  experience: 0.25,
  positioning: 0.25,
  search: 0.2,
  aiReadiness: 0.15,
  technical: 0.15,
};

const CONFIDENCE: Record<EvidenceType, number> = {
  verified: 1,
  inferred: 0.6,
  selfReported: 0.85,
  needsReview: 0,
};

const clamp = (n: number, min = 0, max = 100) => Math.min(max, Math.max(min, n));
const round = (n: number) => Math.round(n);

export function scoreBand(score: number): ScoreBand {
  if (score >= 85) return "strong";
  if (score >= 70) return "friction";
  if (score >= 50) return "constrained";
  return "rebuild";
}

function makeCheck(input: {
  ruleId: RuleId;
  dimension: AuditDimension;
  outcome: CheckOutcome;
  evidenceType: EvidenceType;
  maxPoints: number;
  earnedRatio?: number;
  severity: 1 | 2 | 3 | 4;
  businessImpact: 1 | 2 | 3 | 4;
  effort: 1 | 2 | 3 | 4;
  evidenceValue?: AuditCheck["evidenceValue"];
  pageUrl?: string;
}): AuditCheck {
  const ratio = input.outcome === "notMeasured"
    ? 0
    : input.earnedRatio ?? (input.outcome === "pass" ? 1 : input.outcome === "partial" ? 0.5 : 0);
  return {
    ruleId: input.ruleId,
    dimension: input.dimension,
    outcome: input.outcome,
    evidenceType: input.evidenceType,
    earnedPoints: input.maxPoints * clamp(ratio, 0, 1),
    maxPoints: input.maxPoints,
    severity: input.severity,
    businessImpact: input.businessImpact,
    effort: input.effort,
    priority: Number((input.severity * input.businessImpact * CONFIDENCE[input.evidenceType] / input.effort).toFixed(2)),
    evidenceValue: input.evidenceValue,
    pageUrl: input.pageUrl,
  };
}

function outcomeForRatio(ratio: number, passAt: number, partialAt: number): CheckOutcome {
  if (ratio >= passAt) return "pass";
  if (ratio >= partialAt) return "partial";
  return "fail";
}

function aggregatePages(pages: PageSignals[]) {
  const total = pages.length || 1;
  const sum = (get: (page: PageSignals) => number) => pages.reduce((value, page) => value + get(page), 0);
  const ratio = (test: (page: PageSignals) => boolean) => pages.filter(test).length / total;
  return { total, sum, ratio };
}

const targetTerms: Record<NonNullable<AuditAnswers["conversionAction"]>, RegExp> = {
  contact: /contact|talk|connect|message|cont[aá]ct|habla|mensaje/i,
  "request-quote": /quote|estimate|proposal|pricing|cotiza|presupuesto|propuesta|precio/i,
  book: /book|schedule|reserve|appointment|agenda|reserva|cita/i,
  buy: /buy|shop|purchase|order|comprar|tienda|pedido/i,
  "sign-up": /sign up|register|join|start|reg[ií]str|inscr[ií]b|unir|empezar/i,
  "use-tool": /launch|open|use|portal|dashboard|tool|abrir|usar|portal|herramienta/i,
  call: /call|phone|llama|tel[eé]fono/i,
  other: /./,
};

function targetSupportsAction(target: PageSignals["ctaTargets"][number], action: NonNullable<AuditAnswers["conversionAction"]>): boolean {
  if (action === "other") return false;
  let destination: URL;
  try { destination = new URL(target.destination); } catch { return false; }
  const route = `${destination.pathname} ${destination.search} ${destination.hash}`.toLowerCase();
  if (target.kind === "form" && ["contact", "request-quote", "book", "sign-up"].includes(action)) return true;
  if (action === "contact") return /^(mailto:|tel:)$/.test(destination.protocol) || /contact|contacto|message|mensaje|inquir|consulta/.test(route);
  if (action === "call") return destination.protocol === "tel:" || /contact|contacto|phone|telefono|tel[eé]fono|call|llama/.test(route);
  if (action === "request-quote") return /quote|estimate|proposal|pricing|cotiza|presupuesto|propuesta|precio/.test(route);
  if (action === "book") return /book|schedule|reserve|appointment|calendar|agenda|reserva|cita/.test(route);
  if (action === "buy") return /buy|shop|purchase|order|cart|checkout|comprar|tienda|pedido|carrito|pago/.test(route);
  if (action === "sign-up") return /sign.?up|register|join|start|trial|account|registro|inscri|unir|empezar|cuenta/.test(route);
  if (action === "use-tool") return /app|portal|dashboard|tool|login|launch|workspace|plataforma|herramienta|iniciar-sesion/.test(route);
  return false;
}

function ctaMatchesAnswer(page: PageSignals, action: AuditAnswers["conversionAction"], actionable = false): boolean {
  if (!action || action === "other") return false;
  if (actionable) {
    return (page.ctaTargets ?? []).some((target) => targetTerms[action].test(target.label) && targetSupportsAction(target, action));
  }
  return page.ctaLabels.some((label) => targetTerms[action].test(label));
}

function isValidCanonical(value: string | null): boolean {
  if (!value) return false;
  try {
    const canonical = new URL(value);
    return /^https?:$/.test(canonical.protocol) && !canonical.username && !canonical.password;
  } catch { return false; }
}

const AUDIENCE_STOPWORDS = new Set([
  "about", "and", "at", "con", "de", "del", "el", "for", "from", "las", "los", "para", "that", "the", "their", "una", "with",
]);

function terms(value: string): string[] {
  const normalized = value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return [...new Set(normalized.match(/[a-z0-9]+/g) ?? [])]
    .filter((term) => term.length >= 4 && !AUDIENCE_STOPWORDS.has(term));
}

function matchesSubmittedAudience(page: PageSignals, audience: string): boolean {
  const expected = terms(audience);
  if (expected.length === 0) return false;
  const pageTerms = new Set(terms([
    page.title,
    page.description,
    page.h1Text,
    ...page.headings.map((heading) => heading.text),
  ].join(" ")));
  const matches = expected.filter((term) => pageTerms.has(term)).length;
  return matches >= Math.min(2, expected.length);
}

export function hasNoIndexDirective(value: string | null): boolean {
  return Boolean(value && /(?:^|[\s,;:])(?:noindex|none)(?=$|[\s,;])/i.test(value));
}

function buildChecks(observation: AuditObservation, answers: AuditAnswers): AuditCheck[] {
  const pages = observation.pages;
  const primary = pages[0];
  if (!primary) throw new Error("An audit observation requires at least one analyzed page.");
  const home = pages.find((page) => page.pageType === "home") ?? primary;
  const a = aggregatePages(pages);
  const checks: AuditCheck[] = [];
  const add = (input: Parameters<typeof makeCheck>[0]) => checks.push(makeCheck(input));

  // Experience & usability
  const viewportRatio = a.ratio((p) => p.hasViewport);
  add({ ruleId: "experience.mobileViewport", dimension: "experience", outcome: outcomeForRatio(viewportRatio, 1, 0.6), evidenceType: "verified", maxPoints: 18, earnedRatio: viewportRatio, severity: 4, businessImpact: 4, effort: 1, evidenceValue: `${round(viewportRatio * 100)}%` });

  const headingQuality = a.ratio((p) => p.h1Count === 1 && p.headingSkips === 0);
  add({ ruleId: "experience.headingStructure", dimension: "experience", outcome: outcomeForRatio(headingQuality, 0.8, 0.4), evidenceType: "verified", maxPoints: 18, earnedRatio: headingQuality, severity: 3, businessImpact: 3, effort: 2, evidenceValue: `${round(headingQuality * 100)}%` });

  const links = a.sum((p) => p.linkCount);
  const unclearLinks = a.sum((p) => p.unclearLinkCount + p.brokenAnchorCount);
  const linkClarity = links === 0 ? 0 : clamp(1 - unclearLinks / links, 0, 1);
  add({ ruleId: "experience.linkClarity", dimension: "experience", outcome: links === 0 ? "fail" : outcomeForRatio(linkClarity, 0.94, 0.8), evidenceType: "verified", maxPoints: 17, earnedRatio: linkClarity, severity: 2, businessImpact: 3, effort: 2, evidenceValue: unclearLinks });

  const images = a.sum((p) => p.imageCount);
  const imagesWithAlt = a.sum((p) => p.imagesWithAlt);
  const altRatio = images === 0 ? null : imagesWithAlt / images;
  add({ ruleId: "experience.imageAlternatives", dimension: "experience", outcome: altRatio === null ? "notMeasured" : outcomeForRatio(altRatio, 0.95, 0.7), evidenceType: altRatio === null ? "needsReview" : "verified", maxPoints: 14, earnedRatio: altRatio ?? 0, severity: 2, businessImpact: 2, effort: 2, evidenceValue: images === 0 ? null : `${imagesWithAlt}/${images}` });

  const controls = a.sum((p) => p.controlCount);
  const namedControls = a.sum((p) => p.namedControlCount);
  const controlsRatio = controls === 0 ? null : namedControls / controls;
  add({ ruleId: "experience.controlNames", dimension: "experience", outcome: controlsRatio === null ? "notMeasured" : outcomeForRatio(controlsRatio, 1, 0.75), evidenceType: controlsRatio === null ? "needsReview" : "verified", maxPoints: 18, earnedRatio: controlsRatio ?? 0, severity: 3, businessImpact: 3, effort: 2, evidenceValue: controlsRatio === null ? null : `${namedControls}/${controls}` });

  const accessibility = observation.lab.accessibilityScore;
  add({ ruleId: "experience.accessibilityLab", dimension: "experience", outcome: accessibility === null ? "notMeasured" : accessibility >= 90 ? "pass" : accessibility >= 70 ? "partial" : "fail", evidenceType: accessibility === null ? "needsReview" : "verified", maxPoints: 15, earnedRatio: accessibility === null ? 0 : accessibility / 100, severity: 3, businessImpact: 3, effort: 3, evidenceValue: accessibility });

  // Positioning & conversion
  const headlineNamesOffer = matchesSiteSignal(home.h1Text, observation.detectedLanguage, "service") ||
    matchesSiteSignal(home.h1Text, observation.detectedLanguage, "entity");
  const offerClear = home.h1Count === 1 && home.h1Text.length >= 12 && home.h1Text.length <= 100 && headlineNamesOffer;
  add({ ruleId: "positioning.offerClarity", dimension: "positioning", outcome: offerClear ? "pass" : home.h1Count === 1 && home.h1Text.length > 0 ? "partial" : "fail", evidenceType: "inferred", maxPoints: 20, earnedRatio: offerClear ? 1 : home.h1Text ? 0.5 : 0, severity: 4, businessImpact: 4, effort: 2, evidenceValue: home.h1Text || null, pageUrl: home.finalUrl });

  const audienceSignal = Boolean(answers.audience.trim()) && home.hasAudienceLanguage && matchesSubmittedAudience(home, answers.audience);
  const genericAudienceSignal = home.hasAudienceLanguage || home.hasEntityLanguage;
  add({ ruleId: "positioning.audienceRelevance", dimension: "positioning", outcome: audienceSignal ? "pass" : genericAudienceSignal ? "partial" : "fail", evidenceType: "inferred", maxPoints: 14, earnedRatio: audienceSignal ? 1 : genericAudienceSignal ? 0.5 : 0, severity: 3, businessImpact: 4, effort: 2, evidenceValue: answers.audience.trim() || null, pageUrl: home.finalUrl });

  const actionIsKnown = Boolean(answers.conversionAction && answers.conversionAction !== "other");
  const visibleCtaMatch = ctaMatchesAnswer(home, answers.conversionAction);
  const actionableCtaMatch = ctaMatchesAnswer(home, answers.conversionAction, true);
  add({ ruleId: "positioning.primaryCta", dimension: "positioning", outcome: !actionIsKnown ? "notMeasured" : actionableCtaMatch ? "pass" : visibleCtaMatch || home.hasCtaSignal ? "partial" : "fail", evidenceType: !actionIsKnown ? "needsReview" : "inferred", maxPoints: 18, earnedRatio: actionableCtaMatch ? 1 : visibleCtaMatch || home.hasCtaSignal ? 0.55 : 0, severity: 4, businessImpact: 4, effort: 1, evidenceValue: home.ctaLabels.slice(0, 3).join(" · ") || null, pageUrl: home.finalUrl });

  const difference = answers.differentiation;
  add({ ruleId: "positioning.differentiation", dimension: "positioning", outcome: difference === null || difference === "unsure" ? "notMeasured" : difference === "yes" ? "pass" : "fail", evidenceType: difference === null || difference === "unsure" ? "needsReview" : "selfReported", maxPoints: 14, severity: 3, businessImpact: 4, effort: 3, evidenceValue: difference });

  const trustRatio = a.ratio((p) => p.hasTrustSignal);
  add({ ruleId: "positioning.trustEvidence", dimension: "positioning", outcome: outcomeForRatio(trustRatio, 0.5, 0.2), evidenceType: "inferred", maxPoints: 14, earnedRatio: trustRatio, severity: 3, businessImpact: 4, effort: 3, evidenceValue: `${pages.filter((p) => p.hasTrustSignal).length}/${pages.length}` });

  const healthyPages = pages.filter((page) => page.status >= 200 && page.status < 400);
  const actionPath = answers.conversionAction
    ? healthyPages.some((page) => ctaMatchesAnswer(page, answers.conversionAction, true)) ||
      ((answers.conversionAction === "contact" || answers.conversionAction === "call") &&
        healthyPages.some((page) => page.pageType === "contact" && (page.formCount > 0 || page.hasContactSignal)))
    : false;
  const hasConversionPath = actionPath;
  add({ ruleId: "positioning.conversionPath", dimension: "positioning", outcome: !actionIsKnown ? "notMeasured" : hasConversionPath ? "pass" : home.hasCtaSignal ? "partial" : "fail", evidenceType: !actionIsKnown ? "needsReview" : "inferred", maxPoints: 12, earnedRatio: hasConversionPath ? 1 : home.hasCtaSignal ? 0.5 : 0, severity: 4, businessImpact: 4, effort: 2, evidenceValue: hasConversionPath });

  const expected = answers.expectedResults;
  const recentlyReviewed = answers.lastReviewed === "six-months" || answers.lastReviewed === "one-year";
  add({ ruleId: "positioning.expectedResults", dimension: "positioning", outcome: expected === null || expected === "unsure" ? "notMeasured" : expected === "yes" ? "pass" : "fail", evidenceType: expected === null || expected === "unsure" ? "needsReview" : "selfReported", maxPoints: 8, severity: expected === "no" && recentlyReviewed ? 4 : 3, businessImpact: 4, effort: 3, evidenceValue: expected ? `${expected}/${answers.lastReviewed ?? "unknown"}` : null });

  // Search discoverability
  const indexable = !hasNoIndexDirective(primary.robots);
  add({ ruleId: "search.indexability", dimension: "search", outcome: indexable ? "pass" : "fail", evidenceType: "verified", maxPoints: 16, severity: 4, businessImpact: 4, effort: 1, evidenceValue: primary.robots || "index" });

  const titleQuality = primary.titleLength >= 20 && primary.titleLength <= 65;
  add({ ruleId: "search.title", dimension: "search", outcome: titleQuality ? "pass" : primary.titleLength > 0 ? "partial" : "fail", evidenceType: "verified", maxPoints: 15, earnedRatio: titleQuality ? 1 : primary.titleLength ? 0.45 : 0, severity: 3, businessImpact: 4, effort: 1, evidenceValue: primary.titleLength, pageUrl: primary.finalUrl });

  const descriptionQuality = primary.descriptionLength >= 70 && primary.descriptionLength <= 170;
  add({ ruleId: "search.description", dimension: "search", outcome: descriptionQuality ? "pass" : primary.descriptionLength > 0 ? "partial" : "fail", evidenceType: "verified", maxPoints: 11, earnedRatio: descriptionQuality ? 1 : primary.descriptionLength ? 0.45 : 0, severity: 2, businessImpact: 3, effort: 1, evidenceValue: primary.descriptionLength, pageUrl: primary.finalUrl });

  add({ ruleId: "search.canonical", dimension: "search", outcome: isValidCanonical(primary.canonical) ? "pass" : "fail", evidenceType: "verified", maxPoints: 9, severity: 2, businessImpact: 3, effort: 1, evidenceValue: primary.canonical, pageUrl: primary.finalUrl });

  add({ ruleId: "search.primaryHeading", dimension: "search", outcome: primary.h1Count === 1 ? "pass" : primary.h1Count > 1 ? "partial" : "fail", evidenceType: "verified", maxPoints: 11, earnedRatio: primary.h1Count === 1 ? 1 : primary.h1Count > 1 ? 0.45 : 0, severity: 3, businessImpact: 3, effort: 1, evidenceValue: primary.h1Count, pageUrl: primary.finalUrl });

  const internalLinkQuality = primary.internalLinkCount >= 5 ? 1 : primary.internalLinkCount >= 2 ? 0.55 : 0;
  add({ ruleId: "search.internalLinks", dimension: "search", outcome: internalLinkQuality === 1 ? "pass" : internalLinkQuality > 0 ? "partial" : "fail", evidenceType: "verified", maxPoints: 11, earnedRatio: internalLinkQuality, severity: 2, businessImpact: 3, effort: 2, evidenceValue: primary.internalLinkCount, pageUrl: primary.finalUrl });

  add({ ruleId: "search.imageText", dimension: "search", outcome: altRatio === null ? "notMeasured" : outcomeForRatio(altRatio, 0.9, 0.65), evidenceType: altRatio === null ? "needsReview" : "verified", maxPoints: 9, earnedRatio: altRatio ?? 0, severity: 2, businessImpact: 2, effort: 2, evidenceValue: images === 0 ? null : `${imagesWithAlt}/${images}` });

  const schemaValid = a.sum((p) => p.jsonLdValidCount);
  add({ ruleId: "search.structuredData", dimension: "search", outcome: schemaValid > 0 ? "pass" : "fail", evidenceType: "verified", maxPoints: 9, severity: 2, businessImpact: 3, effort: 3, evidenceValue: schemaValid });

  const discoveredPages = observation.discoveredPageCount ?? pages.length;
  const pageFetchFailed = (observation.failedPageCount ?? 0) > 0;
  const pageCoverage = Math.min(1, discoveredPages / 4);
  add({ ruleId: "search.pageDiscovery", dimension: "search", outcome: pageFetchFailed ? "notMeasured" : discoveredPages >= 4 ? "pass" : discoveredPages >= 2 ? "partial" : "fail", evidenceType: pageFetchFailed ? "needsReview" : "verified", maxPoints: 9, earnedRatio: pageFetchFailed ? 0 : pageCoverage, severity: 2, businessImpact: 2, effort: 2, evidenceValue: pageFetchFailed ? `${pages.length}/${discoveredPages}` : discoveredPages });

  const seoLab = observation.lab.seoScore;
  add({ ruleId: "search.seoLab", dimension: "search", outcome: seoLab === null ? "notMeasured" : seoLab >= 90 ? "pass" : seoLab >= 70 ? "partial" : "fail", evidenceType: seoLab === null ? "needsReview" : "verified", maxPoints: 8, earnedRatio: seoLab === null ? 0 : seoLab / 100, severity: 2, businessImpact: 3, effort: 2, evidenceValue: seoLab });

  // AI answer readiness. These are interpretation signals, never ranking claims.
  const entityRatio = a.ratio((p) => p.hasEntityLanguage);
  add({ ruleId: "ai.entityLanguage", dimension: "aiReadiness", outcome: outcomeForRatio(entityRatio, 0.6, 0.25), evidenceType: "inferred", maxPoints: 20, earnedRatio: entityRatio, severity: 3, businessImpact: 3, effort: 2, evidenceValue: `${round(entityRatio * 100)}%` });

  const serviceRatio = a.ratio((p) => p.hasServiceLanguage);
  add({ ruleId: "ai.serviceLanguage", dimension: "aiReadiness", outcome: outcomeForRatio(serviceRatio, 0.6, 0.25), evidenceType: "inferred", maxPoints: 20, earnedRatio: serviceRatio, severity: 3, businessImpact: 3, effort: 2, evidenceValue: `${round(serviceRatio * 100)}%` });

  const directAnswers = a.sum((p) => p.directAnswerCount);
  add({ ruleId: "ai.answerStructure", dimension: "aiReadiness", outcome: directAnswers >= 3 ? "pass" : directAnswers >= 1 ? "partial" : "fail", evidenceType: "inferred", maxPoints: 18, earnedRatio: Math.min(1, directAnswers / 3), severity: 2, businessImpact: 3, effort: 2, evidenceValue: directAnswers });

  const evidencePages = pages.filter((p) => p.hasTrustSignal || p.hasAuthorSignal).length;
  const evidenceRatio = evidencePages / pages.length;
  add({ ruleId: "ai.evidenceAuthorship", dimension: "aiReadiness", outcome: outcomeForRatio(evidenceRatio, 0.5, 0.2), evidenceType: "inferred", maxPoints: 15, earnedRatio: evidenceRatio, severity: 2, businessImpact: 3, effort: 3, evidenceValue: `${evidencePages}/${pages.length}` });

  const hasOrgSchema = pages.some((p) => p.hasOrganizationSchema || p.hasServiceSchema);
  add({ ruleId: "ai.machineReadableOrganization", dimension: "aiReadiness", outcome: hasOrgSchema ? "pass" : schemaValid > 0 ? "partial" : "fail", evidenceType: "verified", maxPoints: 15, earnedRatio: hasOrgSchema ? 1 : schemaValid > 0 ? 0.45 : 0, severity: 2, businessImpact: 3, effort: 3, evidenceValue: hasOrgSchema });

  const crawlableContent = indexable && primary.wordCount >= 180 && primary.visibleContentLength > 700;
  add({ ruleId: "ai.crawlableContent", dimension: "aiReadiness", outcome: crawlableContent ? "pass" : indexable && primary.wordCount >= 80 ? "partial" : "fail", evidenceType: "verified", maxPoints: 12, earnedRatio: crawlableContent ? 1 : indexable && primary.wordCount >= 80 ? 0.5 : 0, severity: 3, businessImpact: 3, effort: 3, evidenceValue: primary.wordCount, pageUrl: primary.finalUrl });

  // Technical health
  add({ ruleId: "technical.https", dimension: "technical", outcome: /^https:/i.test(primary.finalUrl) ? "pass" : "fail", evidenceType: "verified", maxPoints: 18, severity: 4, businessImpact: 4, effort: 2, evidenceValue: /^https:/i.test(primary.finalUrl), pageUrl: primary.finalUrl });

  const healthyResponses = a.ratio((p) => p.status >= 200 && p.status < 400);
  add({ ruleId: "technical.responseHealth", dimension: "technical", outcome: outcomeForRatio(healthyResponses, 1, 0.75), evidenceType: "verified", maxPoints: 20, earnedRatio: healthyResponses, severity: 4, businessImpact: 4, effort: 2, evidenceValue: `${pages.filter((p) => p.status >= 200 && p.status < 400).length}/${pages.length}` });

  const renderRatio = a.ratio((p) => /text\/html/i.test(p.contentType) && p.visibleContentLength >= 250);
  add({ ruleId: "technical.rendering", dimension: "technical", outcome: outcomeForRatio(renderRatio, 1, 0.7), evidenceType: "verified", maxPoints: 17, earnedRatio: renderRatio, severity: 3, businessImpact: 4, effort: 3, evidenceValue: `${round(renderRatio * 100)}%` });

  const performance = observation.lab.performanceScore;
  add({ ruleId: "technical.mobilePerformance", dimension: "technical", outcome: performance === null ? "notMeasured" : performance >= 90 ? "pass" : performance >= 50 ? "partial" : "fail", evidenceType: performance === null ? "needsReview" : "verified", maxPoints: 25, earnedRatio: performance === null ? 0 : performance / 100, severity: 4, businessImpact: 4, effort: 3, evidenceValue: performance });

  const { lcpMs, cls } = observation.lab;
  const cwvMeasured = lcpMs !== null && cls !== null;
  const cwvGood = cwvMeasured && lcpMs <= 2500 && cls <= 0.1;
  const cwvPartial = cwvMeasured && lcpMs <= 4000 && cls <= 0.25;
  add({ ruleId: "technical.coreWebVitals", dimension: "technical", outcome: !cwvMeasured ? "notMeasured" : cwvGood ? "pass" : cwvPartial ? "partial" : "fail", evidenceType: cwvMeasured ? "verified" : "needsReview", maxPoints: 20, earnedRatio: cwvGood ? 1 : cwvPartial ? 0.5 : 0, severity: 4, businessImpact: 4, effort: 4, evidenceValue: cwvMeasured ? `LCP ${lcpMs}ms · CLS ${cls}` : null });

  const bestPractices = observation.lab.bestPracticesScore;
  add({ ruleId: "technical.bestPracticesLab", dimension: "technical", outcome: bestPractices === null ? "notMeasured" : bestPractices >= 90 ? "pass" : bestPractices >= 70 ? "partial" : "fail", evidenceType: bestPractices === null ? "needsReview" : "verified", maxPoints: 8, earnedRatio: bestPractices === null ? 0 : bestPractices / 100, severity: 2, businessImpact: 3, effort: 3, evidenceValue: bestPractices });

  return checks;
}

function dimensionScore(key: AuditDimension, checks: AuditCheck[]): DimensionScore {
  const own = checks.filter((check) => check.dimension === key);
  const measured = own.filter((check) => check.outcome !== "notMeasured");
  const earned = measured.reduce((total, check) => total + check.earnedPoints, 0);
  const available = measured.reduce((total, check) => total + check.maxPoints, 0);
  const all = own.reduce((total, check) => total + check.maxPoints, 0);
  const score = available === 0 ? 0 : round(100 * earned / available);
  return {
    key,
    score,
    band: scoreBand(score),
    measuredPoints: earned,
    availablePoints: available,
    totalPoints: all,
    coverage: all === 0 ? 0 : round(100 * available / all),
    checks: own,
  };
}

function priorityPlan(checks: AuditCheck[]): PriorityPlan {
  const byPriority = (a: AuditCheck, b: AuditCheck) =>
    b.priority - a.priority ||
    b.severity - a.severity ||
    b.maxPoints - a.maxPoints ||
    a.ruleId.localeCompare(b.ruleId);
  const issues = checks
    .filter((check) => check.outcome === "fail" || check.outcome === "partial")
    .sort(byPriority);
  const strengths = checks
    .filter((check) => check.outcome === "pass")
    .sort((a, b) =>
      b.businessImpact - a.businessImpact ||
      b.earnedPoints - a.earnedPoints ||
      b.maxPoints - a.maxPoints ||
      a.ruleId.localeCompare(b.ruleId));
  const fixNow = issues.find((check) => check.effort <= 2) ?? null;
  const afterFix = issues.filter((check) => check.ruleId !== fixNow?.ruleId);
  const planNext = afterFix.find((check) => check.effort >= 3) ?? null;
  const excluded = new Set([fixNow?.ruleId, planNext?.ruleId].filter(Boolean));
  const protect = strengths.find((check) => !excluded.has(check.ruleId)) ?? null;
  return { fixNow, planNext, protect };
}

function opportunityRoute(
  overall: number,
  dimensions: Record<AuditDimension, DimensionScore>,
  answers: AuditAnswers,
): OpportunityRoute {
  const complexExperience = answers.businessType === "platform" || answers.conversionAction === "use-tool";
  if (complexExperience && (answers.expectedResults === "no" || overall < 60)) return "platform";
  if (dimensions.positioning.score < 60 && (dimensions.technical.score < 65 || dimensions.experience.score < 60)) return "redesign";
  if (dimensions.experience.score < 75 || dimensions.positioning.score < 75) return "ux";
  if (overall >= 85) return "improve";
  return "improve";
}

export function scoreAudit(observation: AuditObservation, answers: AuditAnswers): AuditReport {
  const checks = buildChecks(observation, answers);
  const dimensions = Object.fromEntries(
    DIMENSIONS.map((key) => [key, dimensionScore(key, checks)]),
  ) as Record<AuditDimension, DimensionScore>;
  const scoredDimensions = DIMENSIONS.filter((key) => dimensions[key].availablePoints > 0);
  const scoredWeight = scoredDimensions.reduce((sum, key) => sum + DIMENSION_WEIGHTS[key], 0);
  const overallScore = scoredWeight === 0 ? 0 : round(scoredDimensions.reduce(
    (total, key) => total + (100 * dimensions[key].measuredPoints / dimensions[key].availablePoints) * DIMENSION_WEIGHTS[key],
    0,
  ) / scoredWeight);
  const coverageWeight = DIMENSIONS.reduce((sum, key) => sum + DIMENSION_WEIGHTS[key], 0);
  const coverage = coverageWeight === 0 ? 0 : round(100 * DIMENSIONS.reduce((sum, key) => {
    const dimension = dimensions[key];
    const measuredRatio = dimension.totalPoints === 0 ? 0 : dimension.availablePoints / dimension.totalPoints;
    return sum + measuredRatio * DIMENSION_WEIGHTS[key];
  }, 0) / coverageWeight);

  return {
    version: AUDIT_VERSION,
    auditId: observation.auditId,
    accessToken: observation.accessToken,
    url: observation.finalUrl,
    domain: observation.normalizedDomain,
    createdAt: observation.createdAt,
    detectedLanguage: observation.detectedLanguage,
    pages: observation.pages,
    lab: observation.lab,
    warnings: observation.warnings,
    sample: Boolean(observation.sample),
    overallScore,
    band: scoreBand(overallScore),
    coverage,
    dimensions,
    checks,
    priorityPlan: priorityPlan(checks),
    opportunityRoute: opportunityRoute(overallScore, dimensions, answers),
  };
}
