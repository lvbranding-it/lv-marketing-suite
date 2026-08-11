import { describe, expect, it } from "vitest";
import { buildLeadBody, isEmail, planSummaryLines, CTA_COPY, LEAD_SOURCE } from "./lead";
import { allocationAmounts, calculate } from "./engine";
import { EMPTY_READINESS, emptyAnswers } from "./persist";
import { CATEGORY_KEYS, FEASIBILITY_BANDS } from "./config";
import type { CalculatorAnswers, CategoryKey } from "./types";

// ── Fixtures ────────────────────────────────────────────────────────────────────

/** A well-funded plan: scope supported, most essentials ready. */
function fundedAnswers(): CalculatorAnswers {
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
  a.financial = { ...a.financial, mode: "budget", budgetTotal: 120_000, avgValue: 400, marginPct: 0.5 };
  return a;
}

/** The case the calculator exists for: a budget below the lean minimum. */
function underfundedAnswers(): CalculatorAnswers {
  const a = fundedAnswers();
  a.scope = { ...a.scope, channels: ["google-search", "meta-facebook", "instagram", "youtube", "tiktok"] };
  a.destination = "buy-online";
  a.readiness = { ...EMPTY_READINESS };
  a.financial = { ...a.financial, budgetTotal: 1_200 };
  return a;
}

const contact = { name: "Maria Lopez", email: "maria@example.com", phone: "", hp: "" };

const build = (a: CalculatorAnswers) => {
  const result = calculate(a);
  const plan = result.scenarios[result.recommendedScenario];
  return { result, plan };
};

// ── Plan brief ──────────────────────────────────────────────────────────────────

describe("planSummaryLines", () => {
  it("always states the status, the lean minimum, and the complete scope", () => {
    for (const answers of [fundedAnswers(), underfundedAnswers()]) {
      const { result, plan } = build(answers);
      const labels = planSummaryLines(answers, result, plan).map((l) => l.label);
      expect(labels).toContain("Plan status");
      expect(labels).toContain("Lean minimum");
      expect(labels).toContain("Complete scope");
      expect(labels).toContain("Starting point");
    }
  });

  it("reports the funding gap when the budget falls short", () => {
    const answers = underfundedAnswers();
    const { result, plan } = build(answers);
    const lines = planSummaryLines(answers, result, plan);
    const gap = lines.find((l) => l.label === "Gap to the lean minimum");
    expect(result.feasibility.minimumFundingGap.max).toBeGreaterThan(0);
    expect(gap).toBeDefined();
    expect(gap!.value).toMatch(/\$/);
  });

  it("omits the gap rows when nothing is missing", () => {
    const answers = fundedAnswers();
    const { result, plan } = build(answers);
    const labels = planSummaryLines(answers, result, plan).map((l) => l.label);
    expect(result.feasibility.completeScopeFundingGap.max).toBe(0);
    expect(labels).not.toContain("Gap to the complete scope");
    expect(labels).not.toContain("Gap to the lean minimum");
  });

  it("never claims media activation on a preparation-phase plan", () => {
    const answers = underfundedAnswers();
    const { result, plan } = build(answers);
    const shown = planSummaryLines(answers, result, plan).find((l) => l.label === "Plan shown")!;
    if (plan.isPreparationPhase) {
      expect(shown.value).toContain("no media activation");
      expect(shown.value).not.toContain("media budget");
    }
  });

  it("names the essentials that are not ready", () => {
    const answers = underfundedAnswers();
    const { result, plan } = build(answers);
    const missing = planSummaryLines(answers, result, plan).find((l) => l.label === "Essentials not ready");
    expect(result.readiness.gaps.essential.length).toBeGreaterThan(0);
    expect(missing).toBeDefined();
    // Human labels, not internal keys.
    expect(missing!.value).not.toMatch(/objectiveOffer|visualIdentity|landingPage/);
  });

  it("flags when more channels are selected than the media budget can fund", () => {
    const answers = underfundedAnswers();
    const { result, plan } = build(answers);
    const line = planSummaryLines(answers, result, plan).find((l) => l.label === "Channels vs. funding");
    expect(result.feasibility.selectedChannels).toBeGreaterThan(result.feasibility.supportedChannels);
    expect(line).toBeDefined();
  });
});

// ── Payload ─────────────────────────────────────────────────────────────────────

describe("buildLeadBody", () => {
  it("sends the endpoint's required fields", () => {
    const answers = fundedAnswers();
    const { result, plan } = build(answers);
    const body = buildLeadBody(answers, result, plan, "quote", contact);
    expect(body.source).toBe(LEAD_SOURCE);
    expect(body.contact_name).toBe("Maria Lopez");
    expect(body.contact_email).toBe("maria@example.com");
    expect(body.event_type.length).toBeGreaterThan(0);
  });

  it("puts the intent in event_type so the CRM leads with what they want", () => {
    const answers = fundedAnswers();
    const { result, plan } = build(answers);
    expect(buildLeadBody(answers, result, plan, "build-missing", contact).event_type)
      .toBe("Help building the missing pieces");
    expect(buildLeadBody(answers, result, plan, "send-plan", contact).event_type)
      .toBe("Just send me the plan for now");
  });

  it("carries the channels as human labels, not keys", () => {
    const answers = fundedAnswers();
    const { result, plan } = build(answers);
    const body = buildLeadBody(answers, result, plan, "quote", contact);
    expect(body.services).toEqual(["Google Search", "Meta (Facebook)"]);
  });

  it("trims contact input and nulls an empty phone", () => {
    const answers = fundedAnswers();
    const { result, plan } = build(answers);
    const body = buildLeadBody(answers, result, plan, "quote", {
      name: "  Maria Lopez  ", email: "  maria@example.com ", phone: "   ", hp: "",
    });
    expect(body.contact_name).toBe("Maria Lopez");
    expect(body.contact_email).toBe("maria@example.com");
    expect(body.contact_phone).toBeNull();
  });

  it("passes the honeypot through untouched", () => {
    const answers = fundedAnswers();
    const { result, plan } = build(answers);
    const body = buildLeadBody(answers, result, plan, "quote", { ...contact, hp: "bot" });
    expect(body.hp).toBe("bot");
  });

  it("describes a goal-first plan by its goal, not a budget it never had", () => {
    const answers = fundedAnswers();
    answers.financial = {
      ...answers.financial,
      mode: "goal", budgetTotal: null, goalCount: 250, conversionRate: 0.2, costPerResult: 40,
    };
    const { result, plan } = build(answers);
    const body = buildLeadBody(answers, result, plan, "quote", contact);
    expect(body.budget).toContain("250");
    expect(body.budget).toContain("Goal-first");
  });

  it("never sends a plan brief that leaks internal keys", () => {
    const answers = underfundedAnswers();
    const { result, plan } = build(answers);
    const body = buildLeadBody(answers, result, plan, "second-opinion", contact);
    const blob = body.plan_summary.map((p) => `${p.label} ${p.value}`).join(" ");
    expect(blob).not.toMatch(/preparation-only|scope-supported|focused-pilot|campaign-preparation/);
  });
});

// ── Status-aware copy ───────────────────────────────────────────────────────────

describe("CTA copy", () => {
  it("covers every feasibility status", () => {
    for (const band of FEASIBILITY_BANDS) {
      const copy = CTA_COPY[band.status];
      expect(copy).toBeDefined();
      expect(copy.heading.length).toBeGreaterThan(0);
      expect(copy.action.length).toBeGreaterThan(0);
    }
  });

  it("uses no em dashes", () => {
    for (const band of FEASIBILITY_BANDS) {
      const copy = CTA_COPY[band.status];
      expect(`${copy.heading} ${copy.body} ${copy.action}`).not.toContain("—");
    }
  });

  it("does not promise a campaign to someone who cannot fund one", () => {
    const copy = CTA_COPY["preparation-only"];
    expect(`${copy.heading} ${copy.body}`.toLowerCase()).not.toMatch(/launch your campaign|run your campaign/);
  });
});

describe("isEmail", () => {
  it("accepts real addresses and rejects the usual mistakes", () => {
    expect(isEmail("maria@example.com")).toBe(true);
    expect(isEmail("  maria@example.co.uk  ")).toBe(true);
    expect(isEmail("maria@example")).toBe(false);
    expect(isEmail("maria.example.com")).toBe(false);
    expect(isEmail("")).toBe(false);
  });
});

// ── Allocation basis ────────────────────────────────────────────────────────────
// The reserve is held OUTSIDE the six categories. Every view that renders
// category amounts (dashboard table, detail cards, printed report) must divide
// `plan.total - plan.reserveAmount`, never `plan.total`. Using the total spread
// the reserve across every category and made the same figure disagree with
// itself on one screen.

describe("category amounts exclude the reserve", () => {
  it("categories sum to the allocatable amount, and adding the reserve gives the total", () => {
    for (const answers of [fundedAnswers(), underfundedAnswers()]) {
      const { result, plan } = build(answers);
      const allocatable = plan.total - plan.reserveAmount;
      const amounts = allocationAmounts(allocatable, plan.shares);
      const sum = CATEGORY_KEYS.reduce((s, k) => s + amounts[k], 0);
      expect(sum).toBe(allocatable);
      expect(sum + plan.reserveAmount).toBe(plan.total);
    }
  });

  it("dividing the full total instead would overstate the categories", () => {
    const answers = fundedAnswers();
    const { plan } = build(answers);
    expect(plan.reserveAmount).toBeGreaterThan(0);
    const wrong = allocationAmounts(plan.total, plan.shares);
    const right = allocationAmounts(plan.total - plan.reserveAmount, plan.shares);
    const sumOf = (a: Record<CategoryKey, number>) =>
      CATEGORY_KEYS.reduce((s, k) => s + a[k], 0);
    expect(sumOf(wrong)).toBeGreaterThan(sumOf(right));
  });
});
