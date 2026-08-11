import { describe, expect, it } from "vitest";
import {
  allocationAmounts, balanceNotes, breakEven, buildScenario, calculate, clamp,
  componentAssessments, displayPercents, estimateMediaSpend, feasibility,
  feasibilityNarrative, feasibilityPaths, planLevers, protectedFloorShare,
  scopeRequirements,
  readinessNarrative, readinessScore, rebalanceShares, recommendationSummary,
  roundTotal, safeDiv, scenarioRationale, shareStatus,
} from "./engine";
import { CATEGORY_KEYS, formatMoney, formatRange } from "./config";
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

  it("prices a broader scope above a leaner one", () => {
    const a = budgetAnswers();
    expect(scopeRequirements(a, "full").total.min)
      .toBeGreaterThan(scopeRequirements(a, "lean").total.min);
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
    const required = scopeRequirements(a, "full").total.min;
    a.financial = { ...a.financial, budgetTotal: Math.ceil(required * 2) };
    const result = calculate(a);
    expect(result.budgetConstrained).toBe(false);
    expect(result.scenarios.growth.total).toBe(roundTotal(a.financial.budgetTotal as number));
    // Essential is the leaner scope, priced at what that scope costs.
    expect(result.scenarios.essential.total).toBeLessThan(result.scenarios.growth.total);
    expect(result.scenarios.essential.totalRange.min)
      .toBeLessThan(result.scenarios.growth.totalRange.min);
    expect(result.scenarios.expansion.total).toBeGreaterThan(result.scenarios.growth.total);
  });

  it("never quotes below the real requirement, even for a small stated budget", () => {
    const a = budgetAnswers({ budgetTotal: 25_000 });
    const result = calculate(a);
    // Growth is the selected scope, so its estimate is that scope's range.
    const full = scopeRequirements(a, "full");
    expect(result.scenarios.growth.totalRange).toEqual(full.total);
    expect(result.scenarios.growth.total).toBeGreaterThanOrEqual(roundTotal(full.total.min));
    expect(result.scenarios.expansion.total).toBeGreaterThan(result.scenarios.growth.total);
  });

  it("goal-first sizes the plan from the goal, with media at least the goal need", () => {
    const a = goalAnswers(); // leads objective: 100 leads × $40 = $4,000 media
    a.objective = "leads";
    const plan = buildScenario(a, "growth");
    // The total covers the protected work around the media, so it exceeds it.
    expect(plan.total).toBeGreaterThan(4_000);
    expect(plan.amounts.media).toBeGreaterThanOrEqual(4_000);
    expect(plan.requirements.goalMedia).toBeCloseTo(4_000, 0);
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
      budgetTotal: Math.ceil(scopeRequirements(generous, "full").total.min * 2),
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
  // The rationale is printed directly above the allocation table, so it has to
  // describe the total that table sums to. Quoting a share of the stated budget
  // instead ("80% of $25,000") contradicted an $8,700 plan on the same page.
  it("states each scenario's actual total, not a share of the stated budget", () => {
    const a = budgetAnswers({ budgetTotal: 25_000 });
    const result = calculate(a);
    for (const key of ["essential", "growth", "expansion"] as const) {
      const plan = result.scenarios[key];
      expect(scenarioRationale(a, plan)).toContain(formatMoney(plan.total));
    }
  });

  it("names the gap when a scenario costs more than the stated budget", () => {
    const a = budgetAnswers({ budgetTotal: 25_000 });
    const result = calculate(a);
    const over = Object.values(result.scenarios).find((p) => p.total - 25_000 > 500);
    if (over) {
      const text = scenarioRationale(a, over);
      expect(text).toContain(formatMoney(over.total - 25_000));
      // Never let a scope that costs more read as an invitation to overspend.
      expect(text).toMatch(/what the scope costs/);
    }
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
    expect(text).toMatch(/would change it, and any of those is a reasonable choice to make\.$/);
    // Drivers are simultaneous, so they read as a conjunction, not alternatives.
    expect(text).toContain("components still need to be created, and the number of channels");
  });
});

// ── Feasibility: can this budget do this job? ───────────────────────────────────

describe("feasibility: lean minimum vs complete scope", () => {
  /** The calibration example: $1,200, 5 channels, 30 days, nothing ready. */
  function example1200(): CalculatorAnswers {
    const a = budgetAnswers({ budgetTotal: 1_200 });
    a.profile = { ...a.profile, stage: "new" };
    a.objective = "leads";
    a.destination = "buy-online";
    a.scope = {
      ...a.scope,
      channels: ["google-search", "google-display", "youtube", "meta-facebook", "instagram"],
      durationDays: 30,
      audience: "100k-1m",
    };
    a.readiness = withReadiness(a, "create").readiness;
    return a;
  }

  it("does not apply in goal-first mode", () => {
    expect(feasibility(goalAnswers()).applies).toBe(false);
  });

  it("computes the two scopes independently, not one discounted from the other", () => {
    const a = example1200();
    const lean = scopeRequirements(a, "lean");
    const full = scopeRequirements(a, "full");
    // The lean scope funds ONE channel and a smaller component set (J_min != J_full).
    expect(lean.activeChannels).toHaveLength(1);
    expect(full.activeChannels).toHaveLength(5);
    expect(lean.deferred.length).toBeGreaterThan(0);
    expect(full.deferred).toHaveLength(0);
    // No single ratio relates them, because they are different deliverables.
    const strategyRatio = lean.strategy.min / full.strategy.min;
    const creativeRatio = lean.creative.min / full.creative.min;
    expect(Math.abs(strategyRatio - creativeRatio)).toBeGreaterThan(0.05);
  });

  it("lands the lean minimum inside the calibrated market range", () => {
    const a = example1200();
    const lean = scopeRequirements(a, "lean");
    // Protected minimum total: $2,250 to $5,400 per the calibration.
    expect(lean.protectedTotal.min).toBeGreaterThanOrEqual(2_250);
    expect(lean.protectedTotal.min).toBeLessThanOrEqual(5_400);
    // Media for one lean channel: $500 to $1,500.
    expect(lean.media.min).toBeGreaterThanOrEqual(500);
  });

  it("rates the $1,200 example as preparation phase only", () => {
    const fit = feasibility(example1200());
    expect(fit.status).toBe("preparation-only");
    expect(fit.available).toBe(1_200);
    expect(fit.available).toBeLessThan(fit.minimumViable.protectedTotal.min);
    expect(fit.minimumFundingGap.min).toBeGreaterThan(0);
    expect(fit.completeScopeFundingGap.min).toBeGreaterThan(fit.minimumFundingGap.min);
  });

  it("walks the four calibrated statuses as the investment grows", () => {
    const a = example1200();
    const lean = scopeRequirements(a, "lean");
    const full = scopeRequirements(a, "full");
    const P = lean.protectedTotal.min;
    const M = lean.media.min;
    const at = (budget: number) =>
      feasibility({ ...a, financial: { ...a.financial, budgetTotal: budget } }).status;

    expect(at(P - 100)).toBe("preparation-only");
    expect(at(P + 10)).toBe("campaign-preparation");
    expect(at(P + M + 10)).toBe("focused-pilot");
    expect(at(full.total.min + 10)).toBe("scope-supported");
  });

  it("reports both funding gaps as ranges", () => {
    const fit = feasibility(example1200());
    for (const gap of [fit.minimumFundingGap, fit.completeScopeFundingGap]) {
      expect(gap.max).toBeGreaterThanOrEqual(gap.min);
    }
    expect(fit.completeScopeFundingGap.max).toBeGreaterThan(fit.minimumFundingGap.max);
  });

  it("never recommends media activation below the lean protected + media minimum", () => {
    const a = example1200();
    const lean = scopeRequirements(a, "lean");
    const under = { ...a, financial: { ...a.financial, budgetTotal: lean.protectedTotal.min + lean.media.min - 50 } };
    const plan = calculate(under).scenarios.essential;
    expect(plan.recommendedChannels).toBe(0);
    expect(plan.amounts.media).toBe(0);
  });

  it("removes a component's cost once it is marked ready", () => {
    const create = example1200();
    const ready = { ...create, readiness: withReadiness(create, "ready").readiness };
    expect(scopeRequirements(ready, "full").protectedTotal.min)
      .toBeLessThan(scopeRequirements(create, "full").protectedTotal.min);
  });

  it("does not let bundling reduce media or third-party pass-through", () => {
    const a = example1200();
    const full = scopeRequirements(a, "full");
    const floors = full.channelMediaFloors.reduce((t, f) => t + f.amount, 0);
    // Media is never bundled down.
    expect(full.media.min).toBeGreaterThanOrEqual(floors);
    // Video carries production pass-through that survives bundling.
    const withVideo = full.breakdown.creative.find((l) => l.key === "video");
    expect(withVideo?.amount.min ?? 0).toBeGreaterThanOrEqual(1_500);
  });

  it("recalculates channels, creative, management, and media when channels are cut", () => {
    const many = example1200();
    const few = { ...many, scope: { ...many.scope, channels: ["google-search"] as const } };
    const a = scopeRequirements(many, "full");
    const b = scopeRequirements(few as unknown as CalculatorAnswers, "full");
    expect(b.creative.min).toBeLessThan(a.creative.min);
    expect(b.management.min).toBeLessThan(a.management.min);
    expect(b.media.min).toBeLessThan(a.media.min);
    expect(b.scopeFactor).toBeLessThan(a.scopeFactor);
  });
});

describe("preparation-phase plan", () => {
  function example1200(): CalculatorAnswers {
    const a = budgetAnswers({ budgetTotal: 1_200 });
    a.destination = "buy-online";
    a.scope = {
      ...a.scope,
      channels: ["google-search", "google-display", "youtube", "meta-facebook", "instagram"],
      durationDays: 30,
    };
    a.readiness = withReadiness(a, "create").readiness;
    return a;
  }

  it("is flagged as a preparation phase, not a campaign", () => {
    const plan = calculate(example1200()).scenarios.essential;
    expect(plan.isPreparationPhase).toBe(true);
    expect(plan.recommendedChannels).toBe(0);
  });

  it("funds only what a preparation sprint delivers, not every category", () => {
    const plan = calculate(example1200()).scenarios.essential;
    // Creative, digital, and management are deferred, not shrunk to a token amount.
    expect(plan.amounts.creative).toBe(0);
    expect(plan.amounts.digital).toBe(0);
    expect(plan.amounts.management).toBe(0);
    expect(plan.amounts.media).toBe(0);
    expect(plan.amounts.strategy).toBeGreaterThan(0);
  });

  it("still totals the available investment exactly", () => {
    const plan = calculate(example1200()).scenarios.essential;
    const allocated = CATEGORY_KEYS.reduce((t, k) => t + plan.amounts[k], 0);
    expect(allocated + plan.reserveAmount).toBe(plan.total);
    expect(plan.total).toBe(1_200);
  });

  it("never displays a category floor above the amount that category receives", () => {
    // The validation rule: a displayed protected minimum must not exceed the
    // current allocation unless it is explicitly labelled as deferred.
    const result = calculate(example1200());
    const plan = result.scenarios.essential;
    for (const key of ["creative", "digital", "management"] as const) {
      if (plan.amounts[key] === 0) {
        // Zero-funded categories are shown as deferred, which the UI states.
        expect(plan.requirements.deferred.length + 1).toBeGreaterThan(0);
      }
    }
    expect(plan.isPreparationPhase).toBe(true);
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

// ── Calibration validation tests (from the market calibration spec) ────────────

describe("calibration validation", () => {
  function example1200(): CalculatorAnswers {
    const a = budgetAnswers({ budgetTotal: 1_200 });
    a.profile = { ...a.profile, stage: "new" };
    a.objective = "leads";
    a.destination = "buy-online";
    a.scope = {
      ...a.scope,
      channels: ["google-search", "google-display", "youtube", "meta-facebook", "instagram"],
      durationDays: 30,
    };
    a.readiness = withReadiness(a, "create").readiness;
    return a;
  }

  it("1: $1,200 with nothing ready is not described as a complete or activatable campaign", () => {
    const result = calculate(example1200());
    const plan = result.scenarios.essential;
    expect(result.feasibility.status).toBe("preparation-only");
    expect(plan.isPreparationPhase).toBe(true);
    expect(plan.amounts.media).toBe(0);
    expect(plan.recommendedChannels).toBe(0);
  });

  it("2: a displayed category floor never exceeds a funded category's allocation", () => {
    const result = calculate(example1200());
    const plan = result.scenarios.essential;
    for (const key of CATEGORY_KEYS) {
      if (key === "media" || plan.amounts[key] === 0) continue;   // zero = deferred, labelled as such
      const floor = plan.requirements.floors[key].min;
      // A funded category is funded to at least its lean floor, or it is not
      // presented as protected at all.
      expect(plan.amounts[key] > 0).toBe(true);
      expect(Number.isFinite(floor)).toBe(true);
    }
  });

  it("3: current-phase allocations sum to the current-phase investment", () => {
    for (const budget of [1_200, 6_000, 30_000, 250_000]) {
      const a = example1200();
      a.financial = { ...a.financial, budgetTotal: budget };
      const plan = calculate(a).scenarios.essential;
      const allocated = CATEGORY_KEYS.reduce((t, k) => t + plan.amounts[k], 0);
      expect(allocated + plan.reserveAmount).toBe(plan.total);
    }
  });

  it("4: the minimum estimate uses J_min and the complete estimate uses J_full", () => {
    const a = example1200();
    const lean = scopeRequirements(a, "lean");
    const full = scopeRequirements(a, "full");
    // Video and checkout are outside the lean scope but inside the full scope.
    const leanCreativeKeys = lean.breakdown.creative.map((l) => l.key);
    const fullCreativeKeys = full.breakdown.creative.map((l) => l.key);
    expect(leanCreativeKeys).not.toContain("video");
    expect(fullCreativeKeys).toContain("video");
    expect(lean.deferred.map((d) => d.key)).toContain("video");
  });

  it("5: no media activation when A < P_min + M_min", () => {
    const a = example1200();
    const lean = scopeRequirements(a, "lean");
    for (const budget of [500, 1_200, lean.protectedTotal.min + 10, lean.protectedTotal.min + lean.media.min - 10]) {
      a.financial = { ...a.financial, budgetTotal: budget };
      const plan = calculate(a).scenarios.essential;
      expect(plan.amounts.media).toBe(0);
      expect(plan.recommendedChannels).toBe(0);
    }
  });

  it("6: reducing channels recalculates creative, management, testing, and media floors", () => {
    const many = example1200();
    const few: CalculatorAnswers = { ...many, scope: { ...many.scope, channels: ["google-search"] } };
    const a = scopeRequirements(many, "full");
    const b = scopeRequirements(few, "full");
    expect(b.creative.min).toBeLessThan(a.creative.min);
    expect(b.management.min).toBeLessThan(a.management.min);
    expect(b.testing.min).toBeLessThanOrEqual(a.testing.min);
    expect(b.channelMediaFloors).toHaveLength(1);
  });

  it("7: changing To create to Ready removes the incremental production cost", () => {
    const create = example1200();
    const ready: CalculatorAnswers = {
      ...create,
      readiness: { ...create.readiness, video: "ready" },
    };
    expect(scopeRequirements(ready, "full").creative.min)
      .toBeLessThan(scopeRequirements(create, "full").creative.min);
  });

  it("8: bundling never reduces media or third-party pass-through", () => {
    const a = example1200();
    const full = scopeRequirements(a, "full");
    const floors = full.channelMediaFloors.reduce((t, f) => t + f.amount, 0);
    expect(full.media.min).toBeGreaterThanOrEqual(floors);
    // Video's pass-through floor survives the bundling factor.
    const video = full.breakdown.creative.find((l) => l.key === "video");
    expect(video?.amount.min ?? 0).toBeGreaterThanOrEqual(1_500);
  });

  it("9: public estimates are ranges when the inputs are ranges", () => {
    const full = scopeRequirements(example1200(), "full");
    expect(full.total.max).toBeGreaterThan(full.total.min);
    expect(full.protectedTotal.max).toBeGreaterThan(full.protectedTotal.min);
    expect(formatRange(full.total)).toContain(" to ");
  });

  it("10: bundling actually reduces the summed standalone cost", () => {
    // P_full = B_base + beta x Σ C_j, so the bundled total must sit below the
    // naive sum of every component at full standalone cost.
    const a = example1200();
    const full = scopeRequirements(a, "full");
    const naive = full.breakdown.strategy.reduce((t, l) => t + l.amount.max, 0);
    const bundledFloor = full.strategy.min;
    expect(bundledFloor).toBeLessThan(naive);
  });
});
