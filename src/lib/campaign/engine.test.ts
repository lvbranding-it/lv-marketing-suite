import { describe, expect, it } from "vitest";
import {
  allocationAmounts, balanceNotes, breakEven, buildScenario, calculate, clamp,
  componentAssessments, displayPercents, estimateMediaSpend, feasibility,
  feasibilityNarrative, feasibilityPaths, planLevers, protectedFloorShare,
  readinessNarrative, readinessScore, rebalanceShares, recommendationSummary,
  roundTotal, safeDiv, scenarioRationale, selectedScopeRequirements, shareStatus,
} from "./engine";
import { CATEGORY_KEYS, formatMoney } from "./config";
import { EMPTY_READINESS, emptyAnswers } from "./persist";
import type {
  CalculatorAnswers, CategoryKey, ReadinessState, Shares,
} from "./types";

/** Sets every component to one state, so score expectations are exact. */
function withReadiness(a: CalculatorAnswers, state: ReadinessState | null): CalculatorAnswers {
  const readiness = { ...a.readiness };
  for (const k of Object.keys(readiness) as (keyof typeof readiness)[]) readiness[k] = state;
  return { ...a, readiness };
}

// ── Fixtures ────────────────────────────────────────────────────────────────────

function budgetAnswers(overrides?: Partial<CalculatorAnswers["financial"]>): CalculatorAnswers {
  const a = emptyAnswers();
  a.profile = { audienceFocus: "consumers", stage: "growing", reach: "local", industry: "Hospitality", currency: "USD" };
  a.objective = "leads";
  a.scope = { durationDays: 90, customDuration: false, channels: ["google-search", "meta-facebook"], audience: "10k-100k", timeSensitive: false };
  a.destination = "landing-page";
  a.readiness = {
    ...EMPTY_READINESS,
    positioning: "ready", message: "ready", visualIdentity: "ready",
    landingPage: "ready", tracking: "ready",
  };
  a.financial = { ...a.financial, mode: "budget", budgetTotal: 25_000, avgValue: 400, marginPct: 0.5, ...overrides };
  return a;
}

function goalAnswers(overrides?: Partial<CalculatorAnswers["financial"]>): CalculatorAnswers {
  const a = budgetAnswers();
  a.financial = {
    ...a.financial,
    mode: "goal", budgetTotal: null,
    goalCount: 100, avgValue: 400, conversionRate: 0.2, costPerResult: 40, marginPct: 0.5,
    ...overrides,
  };
  return a;
}

const shareSum = (s: Shares) => CATEGORY_KEYS.reduce((sum, k) => sum + s[k], 0);

// ── Shares (now derived from requirements, not the other way round) ────────────

const sharesOf = (a: CalculatorAnswers, k: "essential" | "growth" | "expansion" = "growth") =>
  buildScenario(a, k).shares;

describe("requirement-derived shares", () => {
  it("always sums to 1 across many input combinations", () => {
    const variants = [budgetAnswers(), goalAnswers(), emptyAnswers(),
      withReadiness(budgetAnswers(), null), withReadiness(budgetAnswers(), "ready")];
    for (const a of variants) {
      for (const scenario of ["essential", "growth", "expansion"] as const) {
        expect(shareSum(sharesOf(a, scenario))).toBeCloseTo(1, 9);
      }
    }
  });

  it("shifts budget toward strategy and creative when the foundation is missing", () => {
    const unready = withReadiness(budgetAnswers(), null);
    const ready = withReadiness(budgetAnswers(), "ready");
    const su = sharesOf(unready);
    const sr = sharesOf(ready);
    expect(su.strategy).toBeGreaterThan(sr.strategy);
    expect(su.creative).toBeGreaterThan(sr.creative);
    expect(su.media).toBeLessThan(sr.media);
  });

  it("adds digital-experience weight when the landing page is missing", () => {
    const withPage = budgetAnswers();
    const withoutPage = budgetAnswers();
    withoutPage.readiness = { ...withoutPage.readiness, landingPage: "create" };
    expect(sharesOf(withoutPage).digital).toBeGreaterThan(sharesOf(withPage).digital);
  });

  it("gives expansion a larger testing amount than essential", () => {
    const a = budgetAnswers();
    expect(buildScenario(a, "expansion").requirements.testing)
      .toBeGreaterThan(buildScenario(a, "essential").requirements.testing);
  });
});

// ── Amounts ─────────────────────────────────────────────────────────────────────

describe("allocationAmounts", () => {
  it("amounts always total the investment exactly", () => {
    for (const total of [500, 2_000, 7_450, 25_000, 100_000, 1_234_500]) {
      const shares = sharesOf(budgetAnswers());
      const amounts = allocationAmounts(total, shares);
      expect(CATEGORY_KEYS.reduce((s, k) => s + amounts[k], 0)).toBe(total);
    }
  });

  it("handles zero and negative totals without NaN", () => {
    const shares = sharesOf(budgetAnswers());
    expect(CATEGORY_KEYS.reduce((s, k) => s + allocationAmounts(0, shares)[k], 0)).toBe(0);
    for (const k of CATEGORY_KEYS) {
      expect(Number.isFinite(allocationAmounts(-500, shares)[k])).toBe(true);
    }
  });
});

// ── Rebalancing ─────────────────────────────────────────────────────────────────

describe("rebalanceShares", () => {
  const base = sharesOf(budgetAnswers());

  it("keeps the sum at exactly 1 after adjustments", () => {
    const next = rebalanceShares(base, "media", 0.6, []);
    expect(shareSum(next)).toBeCloseTo(1, 9);
    expect(next.media).toBeCloseTo(0.6, 9);
  });

  it("never moves locked categories", () => {
    const next = rebalanceShares(base, "media", 0.55, ["strategy", "testing"]);
    expect(next.strategy).toBeCloseTo(base.strategy, 9);
    expect(next.testing).toBeCloseTo(base.testing, 9);
    expect(shareSum(next)).toBeCloseTo(1, 9);
  });

  it("clamps requests that would starve other categories", () => {
    const next = rebalanceShares(base, "media", 1.5, []);
    expect(next.media).toBeLessThan(1);
    expect(shareSum(next)).toBeCloseTo(1, 9);
    for (const k of CATEGORY_KEYS) expect(next[k]).toBeGreaterThanOrEqual(0.01 - 1e-9);
  });

  it("returns the input unchanged when the target itself is locked", () => {
    expect(rebalanceShares(base, "media", 0.2, ["media"])).toBe(base);
  });

  it("redistributes proportionally among unlocked categories", () => {
    const next = rebalanceShares(base, "media", base.media - 0.1, []);
    // Everything else should have grown, in proportion.
    const ratioStrategy = next.strategy / base.strategy;
    const ratioCreative = next.creative / base.creative;
    expect(ratioStrategy).toBeGreaterThan(1);
    expect(ratioStrategy).toBeCloseTo(ratioCreative, 2);
  });
});

// ── Readiness ───────────────────────────────────────────────────────────────────

describe("readinessScore", () => {
  it("is 0 when nothing is answered and 100 when everything applicable is ready", () => {
    expect(readinessScore(withReadiness(budgetAnswers(), null)).score).toBe(0);
    expect(readinessScore(withReadiness(budgetAnswers(), "ready")).score).toBe(100);
  });

  it("maps scores to the right bands", () => {
    expect(readinessScore(withReadiness(budgetAnswers(), null)).band).toBe("foundation");
    expect(readinessScore(withReadiness(budgetAnswers(), "ready")).band).toBe("scale");
    expect(readinessScore(withReadiness(budgetAnswers(), "review")).band).toBe("partial");
  });

  it("gives partial credit for 'exists but needs review' and 'not sure'", () => {
    const review = readinessScore(withReadiness(budgetAnswers(), "review")).score;
    const unsure = readinessScore(withReadiness(budgetAnswers(), "unsure")).score;
    const create = readinessScore(withReadiness(budgetAnswers(), "create")).score;
    expect(review).toBe(50);
    expect(unsure).toBe(25);
    expect(create).toBe(0);
  });

  it("excludes components that do not apply to this campaign", () => {
    // Search + email, awareness, no destination action: no video, no checkout.
    const a = budgetAnswers();
    a.objective = "awareness";
    a.destination = "none";
    a.scope = { ...a.scope, channels: ["google-search", "email"] };
    const r = readinessScore(withReadiness(a, "ready"));
    const notRequired = r.assessments.filter((x) => x.relevance === "not-required").map((x) => x.key);
    expect(notRequired).toContain("checkoutFlow");
    expect(notRequired).toContain("eventPage");
    expect(notRequired).toContain("leadForm");
    // Excluded components cannot drag the score down.
    expect(r.score).toBe(100);
  });

  it("does not penalise a Search campaign for having no video", () => {
    const search = budgetAnswers();
    search.scope = { ...search.scope, channels: ["google-search"] };
    const withYouTube = budgetAnswers();
    withYouTube.scope = { ...withYouTube.scope, channels: ["google-search", "youtube"] };

    // Everything ready except video, so video is the only difference.
    const readiness = { ...withReadiness(search, "ready").readiness, video: "create" as const };
    const searchScore = readinessScore({ ...search, readiness }).score;
    const videoScore = readinessScore({ ...withYouTube, readiness }).score;
    // Search doesn't need video, so it stays at 100; YouTube does, so it drops.
    expect(searchScore).toBe(100);
    expect(videoScore).toBeLessThan(100);
  });

  it("counts essential components separately from the weighted score", () => {
    const r = readinessScore(budgetAnswers());
    expect(r.essentialTotal).toBeGreaterThan(0);
    expect(r.essentialReady).toBeLessThanOrEqual(r.essentialTotal);
    expect(r.gaps.essential.length + r.gaps.recommended.length).toBeGreaterThan(0);
  });
});

// ── Component relevance ─────────────────────────────────────────────────────────

describe("componentAssessments", () => {
  it("makes video essential when YouTube or TikTok is selected", () => {
    const a = budgetAnswers();
    a.scope = { ...a.scope, channels: ["youtube"] };
    const video = componentAssessments(a).find((x) => x.key === "video");
    expect(video?.relevance).toBe("essential");
    expect(video?.reason).toContain("YouTube");
    // Stated as a strong requirement, not an absolute claim about the platform.
    expect(video?.reason).not.toContain("can only run");
  });

  it("excludes video entirely when no selected channel can run it", () => {
    const a = budgetAnswers();
    a.scope = { ...a.scope, channels: ["google-search", "email"] };
    expect(componentAssessments(a).find((x) => x.key === "video")?.relevance).toBe("not-required");
  });

  it("keeps video optional on channels that can carry it but do not depend on it", () => {
    const a = budgetAnswers();
    a.scope = { ...a.scope, channels: ["google-display"] };
    expect(componentAssessments(a).find((x) => x.key === "video")?.relevance).toBe("optional");
  });

  it("drives destination components from the destination answer", () => {
    const shop = budgetAnswers();
    shop.destination = "buy-online";
    const shopAssessments = componentAssessments(shop);
    expect(shopAssessments.find((x) => x.key === "checkoutFlow")?.relevance).toBe("essential");
    expect(shopAssessments.find((x) => x.key === "eventPage")?.relevance).toBe("not-required");

    const event = budgetAnswers();
    event.destination = "event-registration";
    const eventAssessments = componentAssessments(event);
    expect(eventAssessments.find((x) => x.key === "eventPage")?.relevance).toBe("essential");
    expect(eventAssessments.find((x) => x.key === "checkoutFlow")?.relevance).toBe("not-required");
  });

  it("lets a native-form lead campaign skip the landing page", () => {
    const a = budgetAnswers();
    a.destination = "lead-form";
    a.scope = { ...a.scope, channels: ["meta-facebook", "instagram"] };
    const landing = componentAssessments(a).find((x) => x.key === "landingPage");
    expect(landing?.relevance).toBe("optional");
    expect(landing?.reason).toContain("natively");
  });

  it("keeps the landing page recommended when a lead campaign uses Search", () => {
    const a = budgetAnswers();
    a.destination = "lead-form";
    a.scope = { ...a.scope, channels: ["google-search"] };
    expect(componentAssessments(a).find((x) => x.key === "landingPage")?.relevance).toBe("recommended");
  });

  it("softens conversion tracking for pure awareness campaigns", () => {
    const a = budgetAnswers();
    a.destination = "none";
    expect(componentAssessments(a).find((x) => x.key === "tracking")?.relevance).toBe("recommended");
    const perf = budgetAnswers();
    perf.destination = "lead-form";
    expect(componentAssessments(perf).find((x) => x.key === "tracking")?.relevance).toBe("essential");
  });
});

// ── Goal-first formulas ─────────────────────────────────────────────────────────

describe("estimateMediaSpend", () => {
  it("computes leads × cost per lead for lead generation", () => {
    const a = goalAnswers({ costPerResult: 40 });
    a.objective = "leads";
    // 100 leads × $40
    expect(estimateMediaSpend(a, 100)).toBeCloseTo(4_000);
  });

  it("applies the lead step for sales objectives (goal ÷ conversion × CPL)", () => {
    const a = goalAnswers({ conversionRate: 0.2, costPerResult: 40 });
    a.objective = "sales";
    // 100 sales ÷ 0.2 = 500 leads × $40 = $20,000
    expect(estimateMediaSpend(a, 100)).toBeCloseTo(20_000);
  });

  it("prices awareness as reach x frequency x CPM per 1,000 impressions", () => {
    // The worked example: 1,000,000 reach x frequency 3 = 3,000,000 impressions
    // at a $15 CPM = $45,000 in media.
    const a = goalAnswers({ costPerResult: 15, targetFrequency: 3 });
    a.objective = "awareness";
    expect(estimateMediaSpend(a, 1_000_000)).toBeCloseTo(45_000);
  });

  it("falls back to the default frequency when none is entered", () => {
    const a = goalAnswers({ costPerResult: 15, targetFrequency: null });
    a.objective = "awareness";
    // Default frequency is 3: 50,000 x 3 / 1,000 x 15 = $2,250
    expect(estimateMediaSpend(a, 50_000)).toBeCloseTo(2_250);
  });

  it("clamps unrealistic frequency inputs", () => {
    const a = goalAnswers({ costPerResult: 15, targetFrequency: 500 });
    a.objective = "awareness";
    // Clamped to the max of 20: 1,000 x 20 / 1,000 x 15 = $300
    expect(estimateMediaSpend(a, 1_000)).toBeCloseTo(300);
  });

  it("returns null when required inputs are missing", () => {
    const a = goalAnswers({ costPerResult: null });
    expect(estimateMediaSpend(a, 100)).toBeNull();
    const b = goalAnswers({ conversionRate: null });
    b.objective = "sales";
    expect(estimateMediaSpend(b, 100)).toBeNull();
  });
});

// ── Scenarios ───────────────────────────────────────────────────────────────────

describe("buildScenario / calculate", () => {
  it("prices a comfortably funded budget-first plan at the budget, with surplus to media", () => {
    // Give the plan clear headroom over its requirement.
    const a = budgetAnswers();
    const required = selectedScopeRequirements(a).total;
    a.financial = { ...a.financial, budgetTotal: Math.ceil(required * 2) };
    const result = calculate(a);
    expect(result.budgetConstrained).toBe(false);
    expect(result.scenarios.growth.total).toBe(roundTotal(a.financial.budgetTotal as number));
    expect(result.scenarios.essential.total).toBeLessThan(result.scenarios.growth.total);
    expect(result.scenarios.expansion.total).toBeGreaterThan(result.scenarios.growth.total);
  });

  it("never quotes below the real requirement, even for a small stated budget", () => {
    const a = budgetAnswers({ budgetTotal: 25_000 });
    const result = calculate(a);
    // Growth is the selected scope, so it costs what that scope costs.
    expect(result.scenarios.growth.total).toBe(roundTotal(selectedScopeRequirements(a).total));
    expect(result.scenarios.expansion.total).toBeGreaterThan(result.scenarios.growth.total);
  });

  it("goal-first total derives from media need ÷ media share", () => {
    const a = goalAnswers(); // leads objective: 100 leads × $40 = $4,000 media
    a.objective = "leads";
    const plan = buildScenario(a, "growth");
    expect(plan.total).toBeGreaterThan(4_000); // total covers more than media
    // Media amount should be within rounding distance of the $4,000 requirement.
    expect(Math.abs(plan.amounts.media - 4_000)).toBeLessThan(300);
  });

  it("category amounts plus the reserve always equal the scenario total", () => {
    // I = P + M + R, so the six categories sum to the total minus the reserve.
    for (const answers of [budgetAnswers(), goalAnswers()]) {
      const result = calculate(answers);
      for (const key of ["essential", "growth", "expansion"] as const) {
        const plan = result.scenarios[key];
        const allocated = CATEGORY_KEYS.reduce((s, k) => s + plan.amounts[k], 0);
        expect(allocated + plan.reserveAmount).toBe(plan.total);
        expect(plan.reserveAmount).toBeGreaterThan(0);
      }
    }
  });

  it("recommends the pilot whenever the budget cannot fund the scope, Growth otherwise", () => {
    expect(calculate(budgetAnswers({ budgetTotal: 3_000 })).recommendedScenario).toBe("essential");
    const generous = budgetAnswers();
    generous.financial = {
      ...generous.financial,
      budgetTotal: Math.ceil(selectedScopeRequirements(generous).total * 2),
    };
    expect(calculate(generous).recommendedScenario).toBe("growth");
    expect(calculate(goalAnswers()).recommendedScenario).toBe("growth");
  });

  it("survives zero/absent financial inputs without NaN or Infinity", () => {
    const a = emptyAnswers();
    const result = calculate(a);
    for (const key of ["essential", "growth", "expansion"] as const) {
      const plan = result.scenarios[key];
      expect(Number.isFinite(plan.total)).toBe(true);
      for (const k of CATEGORY_KEYS) expect(Number.isFinite(plan.amounts[k])).toBe(true);
    }
  });
});

// ── Break-even ──────────────────────────────────────────────────────────────────

describe("breakEven", () => {
  it("computes gross profit per unit and break-even units", () => {
    const a = budgetAnswers({ avgValue: 400, marginPct: 0.5 });
    const be = breakEven(25_000, a, null);
    expect(be).not.toBeNull();
    expect(be?.grossProfitPerUnit).toBeCloseTo(200);
    expect(be?.breakEvenUnits).toBe(125); // 25,000 / 200
  });

  it("returns null when value or margin is missing", () => {
    expect(breakEven(25_000, budgetAnswers({ avgValue: null }), null)).toBeNull();
    expect(breakEven(25_000, budgetAnswers({ marginPct: null }), null)).toBeNull();
  });

  it("never divides by zero", () => {
    expect(breakEven(25_000, budgetAnswers({ avgValue: 0 }), null)).toBeNull();
    expect(breakEven(25_000, budgetAnswers({ marginPct: 0 }), null)).toBeNull();
  });

  it("translates lead goals into customers through the conversion rate", () => {
    const a = goalAnswers({ conversionRate: 0.2 });
    a.objective = "leads";
    const be = breakEven(10_000, a, 500); // 500 leads × 0.2 = 100 customers
    expect(be?.goalUnits).toBe(100);
    expect(be?.unitNoun).toBe("customers");
  });

  it("does not label projected revenue as profit (both fields exist separately)", () => {
    const a = goalAnswers();
    a.objective = "leads";
    const be = breakEven(10_000, a, 500);
    expect(be?.projectedRevenue).not.toBeNull();
    expect(be?.projectedGrossProfit).not.toBeNull();
    expect(be?.projectedGrossProfit).toBeLessThan(be?.projectedRevenue ?? 0);
  });
});

// ── Balance notes ───────────────────────────────────────────────────────────────

describe("balanceNotes", () => {
  it("flags media-heavy allocations when creative is missing", () => {
    const a = budgetAnswers();
    a.readiness = { ...EMPTY_READINESS, landingPage: "ready", tracking: "ready" };
    const plan = buildScenario(a, "growth");
    const heavy: Shares = { ...plan.shares, media: 0.62 };
    const rest = 0.38 / 5;
    for (const k of CATEGORY_KEYS) if (k !== "media") heavy[k] = rest;
    const notes = balanceNotes(a, plan, heavy);
    expect(notes.some((n) => n.id === "media-heavy")).toBe(true);
  });

  it("flags missing tracking and low testing reserves", () => {
    const a = budgetAnswers();
    a.readiness = { ...a.readiness, tracking: "create" };
    const plan = buildScenario(a, "growth");
    const low: Shares = { ...plan.shares };
    const delta = low.testing - 0.03;
    low.testing = 0.03;
    low.media += delta;
    const notes = balanceNotes(a, plan, low);
    expect(notes.some((n) => n.id === "tracking")).toBe(true);
    expect(notes.some((n) => n.id === "testing")).toBe(true);
  });

  it("flags a reach goal larger than the stated audience size", () => {
    const a = goalAnswers({ goalCount: 1_000_000, costPerResult: 15, targetFrequency: 3 });
    a.objective = "awareness";
    a.scope = { ...a.scope, audience: "10k-100k" };
    const plan = buildScenario(a, "growth");
    const notes = balanceNotes(a, plan);
    expect(notes.some((n) => n.id === "reach-vs-audience")).toBe(true);
  });

  it("flags a local market paired with a national-scale audience", () => {
    const a = budgetAnswers();
    a.profile = { ...a.profile, reach: "local" };
    a.scope = { ...a.scope, audience: "over-1m" };
    const plan = buildScenario(a, "growth");
    expect(balanceNotes(a, plan).some((n) => n.id === "local-vs-scale")).toBe(true);
  });

  it("flags very large scale compressed into 30 days", () => {
    const a = goalAnswers({ goalCount: 800_000, costPerResult: 15, targetFrequency: 3 });
    a.objective = "awareness";
    a.scope = { ...a.scope, durationDays: 30, audience: "over-1m" };
    const plan = buildScenario(a, "growth");
    expect(balanceNotes(a, plan).some((n) => n.id === "duration-vs-scale")).toBe(true);
  });

  it("stays quiet when reach and audience are consistent", () => {
    const a = goalAnswers({ goalCount: 50_000, costPerResult: 15, targetFrequency: 3 });
    a.objective = "awareness";
    a.scope = { ...a.scope, audience: "100k-1m" };
    const plan = buildScenario(a, "growth");
    const ids = balanceNotes(a, plan).map((n) => n.id);
    expect(ids).not.toContain("reach-vs-audience");
    expect(ids).not.toContain("local-vs-scale");
  });

  it("orders attention notes before info notes", () => {
    const a = withReadiness(budgetAnswers(), null);
    const plan = buildScenario(a, "growth");
    const notes = balanceNotes(a, plan);
    const firstInfo = notes.findIndex((n) => n.tone === "info");
    const lastAttention = notes.map((n) => n.tone).lastIndexOf("attention");
    if (firstInfo !== -1 && lastAttention !== -1) expect(lastAttention).toBeLessThan(firstInfo);
  });
});

// ── Plain-language explanations ─────────────────────────────────────────────────

describe("scenarioRationale / recommendationSummary", () => {
  it("explains budget-first totals in terms of the stated budget", () => {
    const a = budgetAnswers({ budgetTotal: 25_000 });
    const result = calculate(a);
    expect(scenarioRationale(a, result.scenarios.growth)).toContain("$25,000");
    expect(scenarioRationale(a, result.scenarios.essential)).toContain("80%");
    expect(scenarioRationale(a, result.scenarios.expansion)).toContain("25%");
  });

  it("explains awareness totals with reach, frequency, and CPM", () => {
    const a = goalAnswers({ goalCount: 1_000_000, costPerResult: 15, targetFrequency: 3 });
    a.objective = "awareness";
    const result = calculate(a);
    const text = scenarioRationale(a, result.scenarios.growth);
    expect(text).toContain("frequency of 3");
    expect(text).toContain("CPM");
  });

  it("ties the recommendation summary to the user's answers", () => {
    const a = budgetAnswers();
    const result = calculate(a);
    const text = recommendationSummary(a, result);
    expect(text).toContain("2 advertising channels");
    expect(text).toContain("3 months");
    expect(text.length).toBeGreaterThan(80);
  });
});

// ── Guards, rounding, formatting ────────────────────────────────────────────────

describe("numeric guards and formatting", () => {
  it("clamp/safeDiv never emit NaN or Infinity", () => {
    expect(clamp(NaN, 0, 10)).toBe(0);
    expect(clamp(Infinity, 0, 10)).toBe(10);
    expect(safeDiv(5, 0)).toBe(0);
    expect(safeDiv(NaN, 3)).toBe(0);
    expect(safeDiv(5, 0, 42)).toBe(42);
  });

  it("roundTotal avoids fake precision at planning scale", () => {
    expect(roundTotal(25_143)).toBe(25_100);
    expect(roundTotal(101_267)).toBe(101_500);
    expect(roundTotal(4_444)).toBe(4_450);
    expect(roundTotal(432)).toBe(430);
    expect(roundTotal(-50)).toBe(0);
  });

  it("formats currency without throwing on bad input", () => {
    expect(formatMoney(25_000)).toBe("$25,000");
    expect(formatMoney(NaN)).toBe("–");
    expect(formatMoney(Infinity)).toBe("–");
  });

  it("displayPercents always totals exactly 100", () => {
    const variants: Shares[] = [
      sharesOf(budgetAnswers()),
      sharesOf(goalAnswers(), "essential"),
      rebalanceShares(sharesOf(budgetAnswers()), "media", 0.57, []),
      { strategy: 1 / 6, creative: 1 / 6, digital: 1 / 6, media: 1 / 6, management: 1 / 6, testing: 1 / 6 },
    ];
    for (const shares of variants) {
      const pcts = displayPercents(shares);
      expect(CATEGORY_KEYS.reduce((s, k) => s + pcts[k], 0)).toBe(100);
    }
  });

  it("shareStatus reports the balanced band around a recommendation", () => {
    expect(shareStatus(0.42, 0.42)).toBe("balanced");
    expect(shareStatus(0.50, 0.42)).toBe("above");
    expect(shareStatus(0.30, 0.42)).toBe("below");
  });
});

// ── Contradictions, narrative, and levers ───────────────────────────────────────

describe("contradictions and explanation copy", () => {
  it("reports a critical contradiction when reach exceeds the audience", () => {
    const a = goalAnswers({ goalCount: 1_000_000, costPerResult: 15, targetFrequency: 3 });
    a.objective = "awareness";
    a.destination = "none";
    a.scope = { ...a.scope, audience: "10k-100k" };
    const result = calculate(a);
    expect(result.contradictions.length).toBeGreaterThan(0);
    expect(result.contradictions[0].id).toBe("reach-vs-audience");
    expect(result.contradictions.every((n) => n.critical)).toBe(true);
  });

  it("reports no contradictions when the answers are consistent", () => {
    const a = goalAnswers({ goalCount: 50_000, costPerResult: 15, targetFrequency: 3 });
    a.objective = "awareness";
    a.destination = "none";
    a.scope = { ...a.scope, audience: "100k-1m" };
    expect(calculate(a).contradictions).toHaveLength(0);
  });

  it("separates confirmed requirements from possible needs in the narrative", () => {
    const a = budgetAnswers();
    a.scope = { ...a.scope, channels: ["meta-facebook", "instagram"] };
    a.readiness = { ...withReadiness(a, "ready").readiness, positioning: "create", photography: "create" };
    const text = readinessNarrative(readinessScore(a));
    // Essential gap is stated as needing attention; recommended gap is hedged.
    expect(text).toContain("need attention before launch");
    expect(text).toContain("recommended because of the channels selected");
    expect(text).toContain("confirmed during campaign planning");
  });

  it("names the levers that would change a large number", () => {
    const a = goalAnswers({ goalCount: 1_000_000, costPerResult: 15, targetFrequency: 3 });
    a.objective = "awareness";
    a.destination = "none";
    a.scope = { ...a.scope, channels: ["youtube", "instagram", "meta-facebook"] };
    a.readiness = { ...withReadiness(a, "create").readiness };
    const text = planLevers(a, calculate(a));
    expect(text).toContain("Reducing the reach");
    expect(text).toContain("narrowing the channel mix");
    expect(text).toMatch(/would change the recommendation\.$/);
    // Drivers are simultaneous, so they read as a conjunction, not alternatives.
    expect(text).toContain("components still need to be created, and the number of channels");
  });
});

// ── Feasibility: can this budget do this job? ───────────────────────────────────

describe("feasibility", () => {
  /** The reported case: 5 channels, 90 days, almost nothing ready, $3,000. */
  function constrainedAnswers(): CalculatorAnswers {
    const a = budgetAnswers({ budgetTotal: 3_000 });
    a.scope = {
      ...a.scope,
      channels: ["google-search", "google-display", "youtube", "meta-facebook", "instagram"],
      audience: "100k-1m",
      durationDays: 90,
    };
    a.destination = "landing-page";
    a.readiness = { ...withReadiness(a, "create").readiness, positioning: "ready" };
    return a;
  }

  it("does not apply in goal-first mode", () => {
    expect(feasibility(goalAnswers()).applies).toBe(false);
  });

  it("prices the requirement bottom up: I = P + M + R", () => {
    const req = selectedScopeRequirements(constrainedAnswers());
    const P = req.strategy + req.creative + req.digital + req.management + req.testing;
    expect(req.protectedTotal).toBeCloseTo(P, 6);
    expect(req.total).toBeCloseTo(req.protectedTotal + req.media + req.reserve, 6);
    // Every protected line is a real, positive requirement here.
    for (const k of ["strategy", "creative", "digital", "management", "testing"] as const) {
      expect(req[k]).toBeGreaterThan(0);
    }
  });

  it("rates the reported $3,000 five-channel case as foundation phase only", () => {
    const fit = feasibility(constrainedAnswers());
    expect(fit.applies).toBe(true);
    // The protected requirements alone exceed the budget.
    expect(fit.budget).toBeLessThan(fit.requirements.protectedTotal);
    expect(fit.status).toBe("foundation-only");
    expect(fit.fundingGap).toBeGreaterThan(0);
    expect(fit.score).toBeLessThan(50);
  });

  it("walks up the statuses as the budget grows", () => {
    const a = constrainedAnswers();
    const req = selectedScopeRequirements(a);
    const P = req.protectedTotal;
    const allChannels = req.channelMediaFloors.reduce((t, f) => t + f.amount, 0);

    const at = (budget: number) =>
      feasibility({ ...a, financial: { ...a.financial, budgetTotal: budget } }).status;

    expect(at(P - 1_000)).toBe("foundation-only");
    expect(at(P + 10)).toBe("preparation");
    expect(at(P + req.singleChannelFloor + 10)).toBe("pilot");
    expect(at(P + allChannels + 10)).toBe("supported");
  });

  it("scores the budget against the requirement", () => {
    const a = constrainedAnswers();
    const req = selectedScopeRequirements(a);
    const half = { ...a, financial: { ...a.financial, budgetTotal: req.total / 2 } };
    expect(feasibility(half).score).toBe(50);
    const full = { ...a, financial: { ...a.financial, budgetTotal: req.total } };
    expect(feasibility(full).score).toBe(100);
    expect(feasibility(full).fundingGap).toBeLessThanOrEqual(0);
  });

  it("costs less when components are already ready", () => {
    const unready = constrainedAnswers();
    const ready = { ...unready, readiness: withReadiness(unready, "ready").readiness };
    expect(selectedScopeRequirements(ready).protectedTotal)
      .toBeLessThan(selectedScopeRequirements(unready).protectedTotal);
  });

  it("treats 'needs review' as cheaper than 'needs creating', per component", () => {
    const create = constrainedAnswers();
    const review = { ...create, readiness: withReadiness(create, "review").readiness };
    expect(selectedScopeRequirements(review).protectedTotal)
      .toBeLessThan(selectedScopeRequirements(create).protectedTotal);
  });

  it("charges the concept once and adds adaptation per channel", () => {
    const one = constrainedAnswers();
    one.scope = { ...one.scope, channels: ["google-search"] };
    const five = constrainedAnswers();
    const creativeOne = selectedScopeRequirements(one).creative;
    const creativeFive = selectedScopeRequirements(five).creative;
    // More channels cost more, but nowhere near five times more.
    expect(creativeFive).toBeGreaterThan(creativeOne);
    expect(creativeFive).toBeLessThan(creativeOne * 5);
  });

  it("scales strategy with scope rather than charging a flat fee", () => {
    const small = constrainedAnswers();
    small.scope = { ...small.scope, channels: ["google-search"], audience: "under-10k" };
    small.profile = { ...small.profile, reach: "local" };
    const big = constrainedAnswers();
    big.profile = { ...big.profile, reach: "international" };
    expect(selectedScopeRequirements(big).scopeFactor)
      .toBeGreaterThan(selectedScopeRequirements(small).scopeFactor);
    expect(selectedScopeRequirements(big).strategy)
      .toBeGreaterThan(selectedScopeRequirements(small).strategy);
  });

  it("respects the per-channel media floor even when the goal implies less", () => {
    const a = goalAnswers({ goalCount: 1, costPerResult: 1, conversionRate: 0.5 });
    const req = selectedScopeRequirements(a);
    const floors = req.channelMediaFloors.reduce((t, f) => t + f.amount, 0);
    expect(req.media).toBeGreaterThanOrEqual(floors);
  });
});

describe("constrained scenarios", () => {
  function constrained(budget = 3_000): CalculatorAnswers {
    const a = budgetAnswers({ budgetTotal: budget });
    a.scope = {
      ...a.scope,
      channels: ["google-search", "google-display", "youtube", "meta-facebook", "instagram"],
      durationDays: 90,
    };
    a.destination = "landing-page";
    a.readiness = { ...withReadiness(a, "create").readiness, positioning: "ready" };
    return a;
  }

  it("flags the plan as budget-constrained and recommends the pilot", () => {
    const result = calculate(constrained());
    expect(result.budgetConstrained).toBe(true);
    expect(result.recommendedScenario).toBe("essential");
  });

  it("spends the whole budget on the pilot instead of holding a fraction back", () => {
    expect(calculate(constrained()).scenarios.essential.total).toBe(3_000);
  });

  it("prices the larger scenarios at what the selected scope really costs", () => {
    const result = calculate(constrained());
    expect(result.scenarios.growth.total).toBe(roundTotal(result.scenarios.growth.requirements.total));
    expect(result.scenarios.growth.total).toBeGreaterThan(result.scenarios.essential.total);
    expect(result.scenarios.expansion.total).toBeGreaterThan(result.scenarios.growth.total);
  });

  it("reduces the pilot's channel mix to what the budget can carry", () => {
    const plan = calculate(constrained()).scenarios.essential;
    expect(plan.plannedChannels.length).toBeLessThan(5);
  });

  it("keeps protected + media + reserve equal to the total at any budget", () => {
    for (const budget of [3_000, 30_000, 250_000]) {
      const result = calculate(constrained(budget));
      for (const key of ["essential", "growth", "expansion"] as const) {
        const plan = result.scenarios[key];
        const protectedSum = (["strategy", "creative", "digital", "management", "testing"] as const)
          .reduce((t, k) => t + plan.amounts[k], 0);
        expect(protectedSum + plan.amounts.media + plan.reserveAmount).toBe(plan.total);
      }
    }
  });

  it("never claims a channel the media line cannot fund", () => {
    const plan = calculate(constrained(3_000)).scenarios.essential;
    if (plan.amounts.media < plan.requirements.singleChannelFloor) {
      expect(plan.recommendedChannels).toBe(0);
      expect(plan.plannedChannels).toHaveLength(0);
    }
  });

  it("protects the foundation before media when the budget falls short", () => {
    // Media absorbs the shortfall first; the protected work is what the
    // campaign depends on, so it is the last thing cut.
    const plan = calculate(constrained(3_000)).scenarios.essential;
    const protectedSum = (["strategy", "creative", "digital", "management", "testing"] as const)
      .reduce((t, k) => t + plan.amounts[k], 0);
    expect(protectedSum).toBeGreaterThan(plan.amounts.media);
  });

  it("leaves an adequately funded plan unconstrained and lets surplus buy media", () => {
    const a = constrained();
    const req = selectedScopeRequirements(a);
    const generous = req.total * 3;
    a.financial = { ...a.financial, budgetTotal: generous };
    const result = calculate(a);
    expect(result.budgetConstrained).toBe(false);
    // Surplus flows to media, not to inflated protected lines.
    expect(result.scenarios.growth.amounts.media).toBeGreaterThan(req.media);
    // Within one allocation rounding step of the protected requirement.
    expect(Math.abs(result.scenarios.growth.amounts.strategy - req.strategy)).toBeLessThanOrEqual(100);
  });

  it("offers three concrete paths forward when constrained", () => {
    const a = constrained();
    const paths = feasibilityPaths(a, feasibility(a));
    expect(paths.map((p) => p.id)).toEqual(["pilot", "foundation", "increase"]);
  });

  it("offers no paths when the scope is supported", () => {
    const a = constrained();
    a.financial = { ...a.financial, budgetTotal: selectedScopeRequirements(a).total * 3 };
    expect(feasibilityPaths(a, feasibility(a))).toHaveLength(0);
  });
});

describe("protected allocation rule", () => {
  it("reports a protected floor for every category except media", () => {
    const plan = buildScenario(budgetAnswers(), "growth");
    for (const key of ["strategy", "creative", "digital", "management", "testing"] as const) {
      expect(protectedFloorShare(key, plan.requirements, plan.total)).toBeGreaterThan(0);
    }
    expect(protectedFloorShare("media", plan.requirements, plan.total)).toBe(0);
  });

  it("never reports a floor above 100%", () => {
    const plan = buildScenario(budgetAnswers({ budgetTotal: 500 }), "growth");
    for (const key of CATEGORY_KEYS) {
      const floor = protectedFloorShare(key, plan.requirements, plan.total);
      expect(floor).toBeGreaterThanOrEqual(0);
      expect(floor).toBeLessThanOrEqual(1);
    }
  });
});
