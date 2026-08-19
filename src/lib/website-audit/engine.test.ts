import { describe, expect, it } from "vitest";
import { DIMENSION_WEIGHTS, hasNoIndexDirective, scoreAudit, scoreBand } from "./engine";
import { SAMPLE_ANSWERS, SAMPLE_OBSERVATION } from "./sample";
import { DIMENSIONS } from "./types";

describe("website opportunity audit scoring", () => {
  it("builds a deterministic, finite report from normalized signals", () => {
    const first = scoreAudit(SAMPLE_OBSERVATION, SAMPLE_ANSWERS);
    const second = scoreAudit(SAMPLE_OBSERVATION, SAMPLE_ANSWERS);
    expect(second).toEqual(first);
    expect(first.overallScore).toBeGreaterThanOrEqual(0);
    expect(first.overallScore).toBeLessThanOrEqual(100);
    expect(first.coverage).toBeGreaterThan(0);
    expect(first.checks.every((check) => Number.isFinite(check.priority))).toBe(true);
    for (const dimension of DIMENSIONS) {
      expect(first.dimensions[dimension].score).toBeGreaterThanOrEqual(0);
      expect(first.dimensions[dimension].score).toBeLessThanOrEqual(100);
    }
  });

  it("uses the published dimension weights", () => {
    const report = scoreAudit(SAMPLE_OBSERVATION, SAMPLE_ANSWERS);
    const expected = Math.round(DIMENSIONS.reduce((sum, dimension) => {
      const score = report.dimensions[dimension];
      return sum + (100 * score.measuredPoints / score.availablePoints) * DIMENSION_WEIGHTS[dimension];
    }, 0));
    expect(report.overallScore).toBe(expected);
  });

  it("removes unavailable lab checks from the denominator instead of treating them as zero", () => {
    const unavailable = structuredClone(SAMPLE_OBSERVATION);
    unavailable.lab = {
      measured: false,
      performanceScore: null,
      accessibilityScore: null,
      bestPracticesScore: null,
      seoScore: null,
      lcpMs: null,
      cls: null,
      tbtMs: null,
      source: "none",
    };
    const failed = structuredClone(SAMPLE_OBSERVATION);
    failed.lab.performanceScore = 0;
    failed.lab.accessibilityScore = 0;
    failed.lab.lcpMs = 9000;
    failed.lab.cls = 0.8;

    const missingReport = scoreAudit(unavailable, SAMPLE_ANSWERS);
    const failedReport = scoreAudit(failed, SAMPLE_ANSWERS);
    expect(missingReport.coverage).toBeLessThan(failedReport.coverage);
    expect(missingReport.dimensions.technical.score).toBeGreaterThan(failedReport.dimensions.technical.score);
    expect(missingReport.checks.filter((check) => check.outcome === "notMeasured").length).toBeGreaterThan(0);
  });

  it("is monotonic when a verified viewport issue is fixed", () => {
    const broken = structuredClone(SAMPLE_OBSERVATION);
    broken.pages.forEach((page) => { page.hasViewport = false; });
    const fixed = structuredClone(broken);
    fixed.pages.forEach((page) => { page.hasViewport = true; });
    expect(scoreAudit(fixed, SAMPLE_ANSWERS).dimensions.experience.score)
      .toBeGreaterThan(scoreAudit(broken, SAMPLE_ANSWERS).dimensions.experience.score);
  });

  it("selects distinct priority actions for the representative report", () => {
    const report = scoreAudit(SAMPLE_OBSERVATION, SAMPLE_ANSWERS);
    const actions = [report.priorityPlan.fixNow, report.priorityPlan.planNext, report.priorityPlan.protect]
      .filter((check) => check !== null);
    const ids = actions.map((check) => check.ruleId);
    expect(actions).toHaveLength(3);
    expect(new Set(ids).size).toBe(3);
  });

  it("does not mislabel passing checks as fix-now or plan-next actions", () => {
    const strong = structuredClone(SAMPLE_OBSERVATION);
    strong.pages.forEach((page) => {
      page.hasViewport = true;
      page.h1Count = 1;
      page.headingSkips = 0;
      page.linkCount = Math.max(page.linkCount, 10);
      page.unclearLinkCount = 0;
      page.brokenAnchorCount = 0;
      page.imagesWithAlt = page.imageCount;
      page.namedControlCount = page.controlCount;
      page.hasTrustSignal = true;
      page.hasCtaSignal = true;
      page.ctaLabels = ["Contact us", "Request a quote"];
      page.actionableCtaLabels = ["Contact us", "Request a quote"];
      page.hasServiceLanguage = true;
      page.hasEntityLanguage = true;
      page.hasAudienceLanguage = true;
      page.internalLinkCount = 10;
      page.descriptionLength = 100;
      page.jsonLdValidCount = 1;
      page.hasOrganizationSchema = true;
      page.directAnswerCount = 4;
      page.wordCount = 500;
      page.visibleContentLength = 2_000;
    });
    strong.pages[0].h1Text = "Operations consulting for industrial teams";
    strong.lab.performanceScore = 100;
    strong.lab.accessibilityScore = 100;
    strong.lab.seoScore = 100;
    strong.lab.bestPracticesScore = 100;
    strong.lab.lcpMs = 1_000;
    strong.lab.cls = 0;
    const report = scoreAudit(strong, { ...SAMPLE_ANSWERS, differentiation: "yes", expectedResults: "yes" });
    expect(report.priorityPlan.fixNow).toBeNull();
    expect(report.priorityPlan.planNext).toBeNull();
    expect(report.priorityPlan.protect?.outcome).toBe("pass");
  });

  it("uses a discovered homepage for positioning while evaluating submitted-page search signals", () => {
    const observation = structuredClone(SAMPLE_OBSERVATION);
    observation.pages[0].h1Count = 0;
    observation.pages[0].h1Text = "";
    observation.pages[0].hasEntityLanguage = false;
    observation.pages[0].hasServiceLanguage = false;
    const discoveredHome = structuredClone(observation.pages[1]);
    discoveredHome.pageType = "home";
    discoveredHome.h1Count = 1;
    discoveredHome.h1Text = "Operations consulting for industrial teams";
    discoveredHome.hasEntityLanguage = true;
    discoveredHome.hasServiceLanguage = true;
    observation.pages.splice(1, 0, discoveredHome);
    const report = scoreAudit(observation, SAMPLE_ANSWERS);
    expect(report.checks.find((check) => check.ruleId === "positioning.offerClarity")?.outcome).toBe("pass");
    expect(report.checks.find((check) => check.ruleId === "search.primaryHeading")?.outcome).toBe("fail");
  });

  it("does not count an unhealthy contact page as a viable conversion path", () => {
    const observation = structuredClone(SAMPLE_OBSERVATION);
    observation.pages.forEach((page) => {
      page.hasContactSignal = false;
      page.formCount = 0;
      page.ctaLabels = ["Explore services"];
      page.actionableCtaLabels = [];
      page.ctaTargets = [];
    });
    const contact = observation.pages.find((page) => page.pageType === "contact")!;
    contact.status = 404;
    contact.formCount = 1;
    contact.hasContactSignal = true;
    contact.ctaLabels = ["Contact us"];
    const report = scoreAudit(observation, SAMPLE_ANSWERS);
    expect(report.checks.find((check) => check.ruleId === "positioning.conversionPath")?.outcome).not.toBe("pass");
  });

  it("does not treat an inert intended-action label as a working conversion path", () => {
    const observation = structuredClone(SAMPLE_OBSERVATION);
    observation.pages.forEach((page) => {
      page.hasContactSignal = false;
      page.formCount = 0;
      page.actionableCtaLabels = [];
      page.ctaTargets = [];
    });
    observation.pages[0].hasCtaSignal = true;
    observation.pages[0].ctaLabels = ["Contact us"];
    const report = scoreAudit(observation, SAMPLE_ANSWERS);
    expect(report.checks.find((check) => check.ruleId === "positioning.primaryCta")?.outcome).toBe("partial");
    expect(report.checks.find((check) => check.ruleId === "positioning.conversionPath")?.outcome).not.toBe("pass");
  });

  it("does not treat an action word aimed at an unrelated destination as a conversion path", () => {
    const observation = structuredClone(SAMPLE_OBSERVATION);
    observation.pages.forEach((page) => { page.ctaTargets = []; page.actionableCtaLabels = []; page.ctaLabels = []; page.hasCtaSignal = false; });
    observation.pages[0].ctaLabels = ["Buy now"];
    observation.pages[0].actionableCtaLabels = ["Buy now"];
    observation.pages[0].ctaTargets = [{ label: "Buy now", destination: "https://northstar-operations.example/privacy", kind: "link" }];
    observation.pages[0].hasCtaSignal = true;
    const report = scoreAudit(observation, { ...SAMPLE_ANSWERS, conversionAction: "buy" });
    expect(report.checks.find((check) => check.ruleId === "positioning.primaryCta")?.outcome).toBe("partial");
    expect(report.checks.find((check) => check.ruleId === "positioning.conversionPath")?.outcome).not.toBe("pass");
  });

  it("leaves CTA checks unmeasured when the intended action is unspecified", () => {
    const report = scoreAudit(SAMPLE_OBSERVATION, { ...SAMPLE_ANSWERS, conversionAction: "other" });
    expect(report.checks.find((check) => check.ruleId === "positioning.primaryCta")?.outcome).toBe("notMeasured");
    expect(report.checks.find((check) => check.ruleId === "positioning.conversionPath")?.outcome).toBe("notMeasured");
  });

  it("does not award offer clarity from a generic headline plus page-wide service language", () => {
    const observation = structuredClone(SAMPLE_OBSERVATION);
    observation.pages[0].h1Text = "Welcome to our website";
    observation.pages[0].hasServiceLanguage = true;
    observation.pages[0].hasEntityLanguage = true;
    expect(scoreAudit(observation, SAMPLE_ANSWERS).checks.find((check) => check.ruleId === "positioning.offerClarity")?.outcome).toBe("partial");
  });

  it("excludes image-alt checks when no images are present", () => {
    const observation = structuredClone(SAMPLE_OBSERVATION);
    observation.pages.forEach((page) => { page.imageCount = 0; page.imagesWithAlt = 0; });
    const report = scoreAudit(observation, SAMPLE_ANSWERS);
    expect(report.checks.find((check) => check.ruleId === "experience.imageAlternatives")?.outcome).toBe("notMeasured");
    expect(report.checks.find((check) => check.ruleId === "search.imageText")?.outcome).toBe("notMeasured");
  });

  it("does not route a healthy platform business to a custom build solely from its business type", () => {
    const report = scoreAudit(SAMPLE_OBSERVATION, { ...SAMPLE_ANSWERS, businessType: "platform", expectedResults: "yes" });
    expect(report.overallScore).toBeGreaterThanOrEqual(60);
    expect(report.opportunityRoute).not.toBe("platform");
  });

  it("treats representative-page fetch failure as missing coverage, not a verified discovery loss", () => {
    const observation = structuredClone(SAMPLE_OBSERVATION);
    observation.failedPageCount = 1;
    observation.pages.pop();
    const report = scoreAudit(observation, SAMPLE_ANSWERS);
    expect(report.checks.find((check) => check.ruleId === "search.pageDiscovery")?.outcome).toBe("notMeasured");
  });

  it("requires observed audience language instead of passing on generic entity copy", () => {
    const observation = structuredClone(SAMPLE_OBSERVATION);
    observation.pages[0].hasEntityLanguage = true;
    observation.pages[0].hasAudienceLanguage = false;
    const report = scoreAudit(observation, SAMPLE_ANSWERS);
    expect(report.checks.find((check) => check.ruleId === "positioning.audienceRelevance")?.outcome).toBe("partial");
  });

  it("requires the submitted audience to match prominent page language", () => {
    const observation = structuredClone(SAMPLE_OBSERVATION);
    observation.pages[0].hasAudienceLanguage = true;
    const report = scoreAudit(observation, { ...SAMPLE_ANSWERS, audience: "Independent pediatric dentists" });
    expect(report.checks.find((check) => check.ruleId === "positioning.audienceRelevance")?.outcome).toBe("partial");
  });

  it("recognizes complete and agent-specific no-index directives without matching longer tokens", () => {
    expect(hasNoIndexDirective("index, follow; googlebot: none")).toBe(true);
    expect(hasNoIndexDirective("noindex, follow")).toBe(true);
    expect(hasNoIndexDirective("index, noindexifembedded")).toBe(false);
    const observation = structuredClone(SAMPLE_OBSERVATION);
    observation.pages[0].robots = "index, follow; X-Robots-Tag: noindex";
    expect(scoreAudit(observation, SAMPLE_ANSWERS).checks.find((check) => check.ruleId === "search.indexability")?.outcome).toBe("fail");
  });

  it("rejects malformed canonical evidence and scores both additional Lighthouse categories", () => {
    const observation = structuredClone(SAMPLE_OBSERVATION);
    observation.pages[0].canonical = "#";
    observation.lab.seoScore = 92;
    observation.lab.bestPracticesScore = 55;
    const report = scoreAudit(observation, SAMPLE_ANSWERS);
    expect(report.checks.find((check) => check.ruleId === "search.canonical")?.outcome).toBe("fail");
    expect(report.checks.find((check) => check.ruleId === "search.seoLab")?.outcome).toBe("pass");
    expect(report.checks.find((check) => check.ruleId === "technical.bestPracticesLab")?.outcome).toBe("fail");
  });

  it("uses the specified public score-band boundaries", () => {
    expect(scoreBand(85)).toBe("strong");
    expect(scoreBand(84)).toBe("friction");
    expect(scoreBand(70)).toBe("friction");
    expect(scoreBand(69)).toBe("constrained");
    expect(scoreBand(50)).toBe("constrained");
    expect(scoreBand(49)).toBe("rebuild");
  });
});
