import { describe, expect, it } from "vitest";
import { calculate, balanceNotes } from "../engine";
import { EMPTY_READINESS, emptyAnswers } from "../persist";
import {
  CATEGORY_KEYS, CHANNELS, DESTINATIONS, FEASIBILITY_BANDS, READINESS_BANDS,
  READINESS_GROUPS, READINESS_ITEMS, READINESS_STATES, OBJECTIVES, SCENARIOS,
  AUDIENCE_BANDS,
} from "../config";
import { narrativesFor, formatLongDate, localeFor } from "./index";
import {
  esCategories, esChannels, esDestinations, esFeasibilityBands, esObjectives,
  esReadinessBands, esReadinessGroups, esReadinessItems, esReadinessStates,
  esRelevance, esScenarios, esAudienceBands,
} from "./es.metadata";
import { esPhrases } from "./es.phrases";
import type { CalculatorAnswers } from "../types";

// ── Fixtures ────────────────────────────────────────────────────────────────────

function answersFor(budget: number, channels: CalculatorAnswers["scope"]["channels"]): CalculatorAnswers {
  const a = emptyAnswers();
  a.profile = { audienceFocus: "consumers", stage: "growing", reach: "local", industry: "Servicios profesionales", currency: "USD" };
  a.objective = "leads";
  a.scope = { durationDays: 90, customDuration: false, channels, audience: "10k-100k", timeSensitive: false };
  a.destination = "landing-page";
  a.readiness = { ...EMPTY_READINESS };
  a.financial = { ...a.financial, mode: "budget", budgetTotal: budget, avgValue: 400, marginPct: 0.5 };
  return a;
}

const underfunded = () => answersFor(1_200, ["google-search", "meta-facebook", "instagram", "youtube", "tiktok"]);
const funded      = () => answersFor(120_000, ["google-search", "meta-facebook"]);

const ES = /[áéíóúñÁÉÍÓÚÑ¿¡]/;

// ── Completeness: a missing translation must be impossible, not just unlikely ───

describe("Spanish covers every key the model defines", () => {
  it("has a translation for every allocation category", () => {
    for (const key of CATEGORY_KEYS) {
      expect(esCategories[key], key).toBeDefined();
      expect(esCategories[key].label.length).toBeGreaterThan(0);
      expect(esCategories[key].why.length).toBeGreaterThan(0);
      expect(esCategories[key].covers.length).toBeGreaterThan(0);
    }
  });

  it("has a translation for every readiness component", () => {
    for (const item of READINESS_ITEMS) {
      expect(esReadinessItems[item.key], item.key).toBeDefined();
      expect(esReadinessItems[item.key].label.length).toBeGreaterThan(0);
    }
  });

  it("covers every objective, scenario, channel, destination, and band", () => {
    for (const o of OBJECTIVES)          expect(esObjectives[o.key], o.key).toBeDefined();
    for (const s of SCENARIOS)           expect(esScenarios[s.key], s.key).toBeDefined();
    for (const c of CHANNELS)            expect(esChannels[c.key], c.key).toBeDefined();
    for (const d of DESTINATIONS)        expect(esDestinations[d.key], d.key).toBeDefined();
    for (const b of READINESS_BANDS)     expect(esReadinessBands[b.band], b.band).toBeDefined();
    for (const g of READINESS_GROUPS)    expect(esReadinessGroups[g.key], g.key).toBeDefined();
    for (const s of READINESS_STATES)    expect(esReadinessStates[s.key], s.key).toBeDefined();
    for (const f of FEASIBILITY_BANDS)   expect(esFeasibilityBands[f.status], f.status).toBeDefined();
    for (const b of AUDIENCE_BANDS)      expect(esAudienceBands[b.key], b.key).toBeDefined();
  });

  it("leaves no English behind in the Spanish metadata", () => {
    const blob = [
      ...Object.values(esCategories).flatMap((c) => [c.label, c.why, c.covers]),
      ...Object.values(esObjectives).map((o) => o.label),
      ...Object.values(esReadinessBands).map((b) => b.summary),
      ...Object.values(esFeasibilityBands).map((b) => b.short),
      ...Object.values(esRelevance),
    ].join(" ");
    // Words that would only appear if an English string leaked through.
    expect(blob).not.toMatch(/\b(the|your|campaign needs|and the|budget)\b/i);
    expect(blob).toMatch(ES);
  });
});

// ── Grammar: the reason these are functions and not templates ──────────────────

describe("Spanish agreement follows the data", () => {
  it("pluralises channels", () => {
    expect(esPhrases.channelCount(1)).toBe("1 canal");
    expect(esPhrases.channelCount(3)).toBe("3 canales");
  });

  it("pluralises days and months", () => {
    expect(esPhrases.dayCount(1)).toBe("1 día");
    expect(esPhrases.dayCount(30)).toBe("30 días");
    expect(esPhrases.monthCount(1)).toBe("1 mes");
    expect(esPhrases.monthCount(3)).toBe("3 meses");
  });

  it("agrees the adjective with the count", () => {
    expect(esPhrases.channelsSupported(0, 1)).toContain("seleccionado");
    expect(esPhrases.channelsSupported(0, 1)).not.toContain("seleccionados");
    expect(esPhrases.channelsSupported(0, 5)).toContain("seleccionados");
  });

  // The count is bare because its label already names the components; repeating
  // the noun produced "2 de 13 piezas esenciales listas" beside a label saying
  // exactly that. What matters is the separator: "de", never "of".
  it("joins the ready count with de, not of", () => {
    expect(esPhrases.essentialsReady(2, 13)).toBe("2 de 13");
    expect(esPhrases.essentialsReady(0, 1)).toBe("0 de 1");
    expect(esPhrases.essentialsReady(2, 13)).not.toContain(" of ");
  });
});

// ── Narratives ─────────────────────────────────────────────────────────────────

describe("Spanish narratives", () => {
  it("produces Spanish for every feasibility status", () => {
    const seen = new Set<string>();
    for (const answers of [underfunded(), funded(), answersFor(7_000, ["google-search", "meta-facebook"])]) {
      const result = calculate(answers, "es");
      const copy = narrativesFor("es").feasibility(answers, result.feasibility);
      seen.add(result.feasibility.status);
      expect(copy.headline).toMatch(ES);
      expect(copy.detail.length).toBeGreaterThan(40);
      // No stray English connectives.
      expect(copy.detail).not.toMatch(/\b(the|your|which|because)\b/i);
    }
    expect(seen.size).toBeGreaterThan(1);
  });

  it("keeps the uncomfortable truth intact for an underfunded plan", () => {
    const answers = underfunded();
    const result = calculate(answers, "es");
    const copy = narrativesFor("es").feasibility(answers, result.feasibility);
    // It must still say the money is short and that ads are not included.
    expect(copy.detail).toMatch(/por debajo/);
    expect(copy.detail).toMatch(/no incluye pautar anuncios/);
  });

  it("never promises media activation in a Spanish preparation phase", () => {
    const answers = underfunded();
    const result = calculate(answers, "es");
    const paths = narrativesFor("es").paths(answers, result.feasibility);
    const prep = paths.find((p) => p.id === "preparation");
    expect(prep).toBeDefined();
    expect(prep!.text).toMatch(/no es parte de esta fase/);
  });

  // Checking for accents would be a poor proxy: plenty of correct Spanish
  // sentences contain none ("Seleccionaste 5 canales, pero el presupuesto...").
  // Comparing against the English text tests the property that actually matters.
  it("words every balance note differently from English", () => {
    const answers = underfunded();
    const result = calculate(answers, "es");
    const plan = result.scenarios[result.recommendedScenario];
    const es = balanceNotes(answers, plan, undefined, "es");
    const en = balanceNotes(answers, plan, undefined, "en");

    expect(es.length).toBeGreaterThan(0);
    expect(es.map((n) => n.id)).toEqual(en.map((n) => n.id));
    for (let i = 0; i < es.length; i++) {
      expect(es[i].text, es[i].id).not.toBe(en[i].text);
      expect(es[i].text, es[i].id).not.toMatch(/\b(the|your|budget|channels)\b/i);
    }
  });

  it("still returns English when no language is given", () => {
    const answers = underfunded();
    const result = calculate(answers);
    const copy = narrativesFor().feasibility(answers, result.feasibility);
    expect(copy.headline).toBe("Let's start with preparation.");
  });

  it("uses no em dashes in either language", () => {
    const answers = funded();
    const result = calculate(answers, "es");
    const plan = result.scenarios[result.recommendedScenario];
    for (const lang of ["en", "es"] as const) {
      const n = narrativesFor(lang);
      const blob = [
        n.feasibility(answers, result.feasibility).detail,
        n.scenarioRationale(answers, plan),
        n.recommendationSummary(answers, result),
        n.planLevers(answers, result),
        n.readiness(result.readiness),
      ].join(" ");
      expect(blob, lang).not.toContain("—");
    }
  });
});

// ── Locale formatting ──────────────────────────────────────────────────────────

describe("locale formatting", () => {
  it("maps languages to BCP-47 tags", () => {
    expect(localeFor("en")).toBe("en-US");
    expect(localeFor("es")).toBe("es-MX");
  });

  it("writes the date the way each language does", () => {
    const d = new Date(2026, 7, 11);
    expect(formatLongDate(d, "en")).toBe("August 11, 2026");
    expect(formatLongDate(d, "es")).toMatch(/11 de agosto de 2026/);
  });
});
