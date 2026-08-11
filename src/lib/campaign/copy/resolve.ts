// ── Full copy resolution ────────────────────────────────────────────────────────
// Assembles a complete CalcCopy for a language. Components take this one object
// rather than importing from a dozen modules.

import {
  enCards, enErrors, enFormatRange, enIntro, enMeta, enNav, enProse, enReport,
  enResults, enSteps, enMeters,
} from "./en.ui";
import { enBrief, enCta, enPhrases } from "./en.phrases";
import {
  esCards, esErrors, esFormatRange, esIntro, esMeta, esNav, esProse, esReport,
  esResults, esSteps, esMeters,
} from "./es.ui";
import { esBrief, esCta, esPhrases } from "./es.phrases";
import {
  esAudienceBands, esAudienceFocus, esCategories, esChannels, esDestinations,
  esDurationPresets, esFeasibilityBands, esFeasibilityScoreLabels, esIndustries,
  esLists, esObjectives, esReaches, esReadinessBands, esReadinessGroups,
  esReadinessItems, esReadinessStates, esRelevance, esScenarios, esStages,
} from "./es.metadata";
import {
  AUDIENCE_FOCUS_OPTIONS, BUSINESS_STAGES, CATEGORIES, CHANNELS, DESTINATIONS,
  DURATION_PRESETS, FEASIBILITY_BANDS, FEASIBILITY_SCORE_BANDS, INDUSTRIES,
  LEAN_SCOPE_ASSUMPTIONS, MARKET_REACHES, OBJECTIVES, PREPARATION_PHASE,
  READINESS_BANDS, READINESS_GROUPS, READINESS_ITEMS, READINESS_STATES,
  RELEVANCE_LABELS, SCENARIOS, SCOPE_LEVERS, SEPARATE_SCOPE_ADDITIONS,
  AUDIENCE_BANDS,
} from "../config";
import { localeFor } from "./index";
import type { CalcCopy, Lang } from "./types";

const byKey = <K extends string, V>(items: readonly { key: K }[], pick: (i: never) => V) =>
  Object.fromEntries(items.map((i) => [i.key, pick(i as never)])) as Record<K, V>;

const EN: CalcCopy = {
  lang: "en",
  locale: localeFor("en"),
  meta: enMeta, intro: enIntro, nav: enNav, steps: enSteps, errors: enErrors,
  results: enResults, cards: enCards, prose: enProse, phrases: enPhrases,
  meters: enMeters,
  categories: byKey(CATEGORIES, (c: (typeof CATEGORIES)[number]) =>
    ({ label: c.label, short: c.short, why: c.why, covers: c.covers })),
  objectives: byKey(OBJECTIVES, (o: (typeof OBJECTIVES)[number]) =>
    ({ label: o.label, hint: "", unitNoun: o.unitNoun, unitSingular: o.unitSingular })),
  scenarios: byKey(SCENARIOS, (s: (typeof SCENARIOS)[number]) =>
    ({ label: s.label, tagline: s.tagline, description: s.description, limitations: s.limitations })),
  channels: byKey(CHANNELS, (c: (typeof CHANNELS)[number]) => c.label),
  destinations: byKey(DESTINATIONS, (d: (typeof DESTINATIONS)[number]) => d.label),
  readinessItems: byKey(READINESS_ITEMS, (i: (typeof READINESS_ITEMS)[number]) =>
    ({ label: i.label, hint: "" })),
  readinessGroups: byKey(READINESS_GROUPS, (g: (typeof READINESS_GROUPS)[number]) =>
    ({ label: g.label, blurb: g.blurb })),
  readinessStates: byKey(READINESS_STATES, (s: (typeof READINESS_STATES)[number]) =>
    ({ label: s.label, short: s.short })),
  readinessBands: Object.fromEntries(
    READINESS_BANDS.map((b) => [b.band, { label: b.label, summary: b.summary }]),
  ) as CalcCopy["readinessBands"],
  relevance: RELEVANCE_LABELS,
  feasibilityBands: Object.fromEntries(
    FEASIBILITY_BANDS.map((b) => [b.status, { label: b.label, short: b.short }]),
  ) as CalcCopy["feasibilityBands"],
  feasibilityScoreLabels: FEASIBILITY_SCORE_BANDS.map((b) => b.label),
  audienceFocus: AUDIENCE_FOCUS_OPTIONS,
  stages: BUSINESS_STAGES,
  reaches: MARKET_REACHES,
  audienceBands: byKey(AUDIENCE_BANDS, (b: (typeof AUDIENCE_BANDS)[number]) => b.label),
  industries: INDUSTRIES,
  durationPresets: Object.fromEntries(DURATION_PRESETS.map((p) => [p.days, p.label])),
  lists: {
    leanScopeAssumptions:   [...LEAN_SCOPE_ASSUMPTIONS],
    separateScopeAdditions: [...SEPARATE_SCOPE_ADDITIONS],
    scopeLevers:            [...SCOPE_LEVERS],
    preparationInclusions:  [...PREPARATION_PHASE.inclusions],
    preparationTitle:       PREPARATION_PHASE.title,
  },
  cta: enCta,
  brief: enBrief,
  report: enReport,
  formatRange: enFormatRange,
};

const ES: CalcCopy = {
  lang: "es",
  locale: localeFor("es"),
  meta: esMeta, intro: esIntro, nav: esNav, steps: esSteps, errors: esErrors,
  results: esResults, cards: esCards, prose: esProse, phrases: esPhrases,
  meters: esMeters,
  categories: esCategories, objectives: esObjectives, scenarios: esScenarios,
  channels: esChannels, destinations: esDestinations,
  readinessItems: esReadinessItems, readinessGroups: esReadinessGroups,
  readinessStates: esReadinessStates, readinessBands: esReadinessBands,
  relevance: esRelevance, feasibilityBands: esFeasibilityBands,
  feasibilityScoreLabels: esFeasibilityScoreLabels,
  audienceFocus: esAudienceFocus, stages: esStages, reaches: esReaches,
  audienceBands: esAudienceBands, industries: esIndustries,
  durationPresets: esDurationPresets,
  lists: esLists, cta: esCta, brief: esBrief, report: esReport,
  formatRange: esFormatRange,
};

const ALL: Record<Lang, CalcCopy> = { en: EN, es: ES };

/** The complete copy set for a language. Defaults to English. */
export const copyFor = (lang: Lang = "en"): CalcCopy => ALL[lang] ?? EN;
