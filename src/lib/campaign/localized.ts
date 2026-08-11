// ── Language-aware model accessors ──────────────────────────────────────────────
// config.ts holds the model (keys, colours, weights, coefficients). The copy
// modules hold the words. This joins them, so a component asks for "the
// objectives, in this language" and gets a list it can render directly.
//
// English returns the config values unchanged, which is what keeps the English
// calculator provably identical: for `lang === "en"` these are pass-throughs.

import {
  AUDIENCE_BANDS, AUDIENCE_FOCUS_OPTIONS, BUSINESS_STAGES, CATEGORIES, CHANNELS,
  DESTINATIONS, DURATION_PRESETS, FEASIBILITY_BANDS, INDUSTRIES,
  LEAN_SCOPE_ASSUMPTIONS, MARKET_REACHES, OBJECTIVES, PREPARATION_PHASE,
  READINESS_BANDS, READINESS_GROUPS, READINESS_ITEMS, READINESS_STATES,
  RELEVANCE_LABELS, SCENARIOS, SCOPE_LEVERS, SEPARATE_SCOPE_ADDITIONS,
  type FeasibilityStatus,
} from "./config";
import {
  esAudienceBands, esAudienceFocus, esCategories, esChannels, esDestinations,
  esDurationPresets, esFeasibilityBands, esIndustries, esLists, esObjectives,
  esReaches, esReadinessBands, esReadinessGroups, esReadinessItems,
  esReadinessStates, esRelevance, esScenarios, esStages, esReadinessClauses,
} from "./copy/es.metadata";
import type { Lang } from "./copy";
import type {
  AudienceBand, CategoryKey, ChannelKey, ComponentRelevance, DestinationKey,
  ObjectiveKey, ReadinessBand, ReadinessGroupKey, ReadinessKey, ReadinessState,
  ScenarioKey,
} from "./types";

const isEs = (lang: Lang) => lang === "es";

// ── Allocation categories ───────────────────────────────────────────────────────

export interface LocalCategory {
  key: CategoryKey; label: string; short: string; why: string; covers: string;
  colorLight: string; colorDark: string;
}

export function categories(lang: Lang = "en"): LocalCategory[] {
  return CATEGORIES.map((c) => {
    const w = isEs(lang) ? esCategories[c.key] : c;
    return {
      key: c.key, label: w.label, short: w.short, why: w.why, covers: w.covers,
      colorLight: c.colorLight, colorDark: c.colorDark,
    };
  });
}

export const category = (key: CategoryKey, lang: Lang = "en"): LocalCategory =>
  categories(lang).find((c) => c.key === key) as LocalCategory;

// ── Objectives ──────────────────────────────────────────────────────────────────
// Only the words vary; the unit economics stay in config so both languages price
// identically. `unitNoun` is localized because it is rendered in prose.

export function objectives(lang: Lang = "en") {
  return OBJECTIVES.map((o) => {
    const w = isEs(lang) ? esObjectives[o.key] : null;
    return {
      ...o,
      label:        w?.label ?? o.label,
      unitNoun:     w?.unitNoun ?? o.unitNoun,
      unitSingular: w?.unitSingular ?? o.unitSingular,
      hint:         w?.hint,
    };
  });
}

export const objective = (key: ObjectiveKey, lang: Lang = "en") =>
  objectives(lang).find((o) => o.key === key)!;

// ── Scenarios ───────────────────────────────────────────────────────────────────

export function scenarios(lang: Lang = "en") {
  return SCENARIOS.map((s) => {
    const w = isEs(lang) ? esScenarios[s.key] : null;
    return {
      ...s,
      label:       w?.label ?? s.label,
      tagline:     w?.tagline ?? s.tagline,
      description: w?.description ?? s.description,
      limitations: w?.limitations ?? s.limitations,
    };
  });
}

export const scenario = (key: ScenarioKey, lang: Lang = "en") =>
  scenarios(lang).find((s) => s.key === key)!;

// ── Simple label lists ──────────────────────────────────────────────────────────

export const channels = (lang: Lang = "en") =>
  CHANNELS.map((c) => ({ key: c.key, label: isEs(lang) ? esChannels[c.key] : c.label }));

export const channelLabelOf = (key: ChannelKey, lang: Lang = "en") =>
  isEs(lang) ? esChannels[key] : (CHANNELS.find((c) => c.key === key)?.label ?? key);

export const destinations = (lang: Lang = "en") =>
  DESTINATIONS.map((d) => ({ key: d.key, label: isEs(lang) ? esDestinations[d.key] : d.label }));

export const destinationLabelOf = (key: DestinationKey | null, lang: Lang = "en") =>
  (key ? destinations(lang).find((d) => d.key === key)?.label : null) ?? null;

export const audienceBands = (lang: Lang = "en") =>
  AUDIENCE_BANDS.map((b) => ({ ...b, label: isEs(lang) ? esAudienceBands[b.key] : b.label }));

export const audienceBand = (key: AudienceBand, lang: Lang = "en") =>
  audienceBands(lang).find((b) => b.key === key) ?? audienceBands(lang)[0];

export const audienceFocusOptions = (lang: Lang = "en") =>
  isEs(lang) ? esAudienceFocus : AUDIENCE_FOCUS_OPTIONS;

export const stages = (lang: Lang = "en") => (isEs(lang) ? esStages : BUSINESS_STAGES);

export const reaches = (lang: Lang = "en") => (isEs(lang) ? esReaches : MARKET_REACHES);

export const industries = (lang: Lang = "en") => (isEs(lang) ? esIndustries : INDUSTRIES);

export const durationPresets = (lang: Lang = "en") =>
  DURATION_PRESETS.map((p) => ({
    ...p,
    label: isEs(lang) ? (esDurationPresets[p.days] ?? p.label) : p.label,
  }));

// ── Readiness ───────────────────────────────────────────────────────────────────

export function readinessItems(lang: Lang = "en") {
  return READINESS_ITEMS.map((i) => ({
    ...i,
    label: isEs(lang) ? esReadinessItems[i.key].label : i.label,
    hint:  isEs(lang) ? esReadinessItems[i.key].hint : undefined,
  }));
}

export const readinessItem = (key: ReadinessKey, lang: Lang = "en") =>
  readinessItems(lang).find((i) => i.key === key)!;

/** The fragment folded into "Shaped by your answers: …". */
export const readinessClause = (key: ReadinessKey, lang: Lang = "en") =>
  isEs(lang)
    ? (esReadinessClauses[key] ?? READINESS_ITEMS.find((i) => i.key === key)!.clause)
    : READINESS_ITEMS.find((i) => i.key === key)!.clause;

export const readinessGroups = (lang: Lang = "en") =>
  READINESS_GROUPS.map((g) => ({
    key: g.key as ReadinessGroupKey,
    label: isEs(lang) ? esReadinessGroups[g.key].label : g.label,
    blurb: isEs(lang) ? esReadinessGroups[g.key].blurb : g.blurb,
  }));

export const readinessStates = (lang: Lang = "en") =>
  READINESS_STATES.map((s) => ({
    ...s,
    label: isEs(lang) ? esReadinessStates[s.key].label : s.label,
    short: isEs(lang) ? esReadinessStates[s.key].short : s.short,
  }));

export const readinessState = (key: ReadinessState, lang: Lang = "en") =>
  readinessStates(lang).find((s) => s.key === key)!;

export const readinessBands = (lang: Lang = "en") =>
  READINESS_BANDS.map((b) => ({
    ...b,
    label:   isEs(lang) ? esReadinessBands[b.band].label : b.label,
    summary: isEs(lang) ? esReadinessBands[b.band].summary : b.summary,
  }));

export const readinessBand = (band: ReadinessBand, lang: Lang = "en") =>
  readinessBands(lang).find((b) => b.band === band);

export const relevanceLabel = (r: ComponentRelevance, lang: Lang = "en") =>
  isEs(lang) ? esRelevance[r] : RELEVANCE_LABELS[r];

// ── Feasibility ─────────────────────────────────────────────────────────────────

export const feasibilityBands = (lang: Lang = "en") =>
  FEASIBILITY_BANDS.map((b) => ({
    ...b,
    label: isEs(lang) ? esFeasibilityBands[b.status].label : b.label,
    short: isEs(lang) ? esFeasibilityBands[b.status].short : b.short,
  }));

export const feasibilityBandOf = (status: FeasibilityStatus, lang: Lang = "en") =>
  feasibilityBands(lang).find((b) => b.status === status)!;

// ── Verbatim lists ──────────────────────────────────────────────────────────────

export const leanScopeAssumptions = (lang: Lang = "en") =>
  isEs(lang) ? esLists.leanScopeAssumptions : LEAN_SCOPE_ASSUMPTIONS;

export const separateScopeAdditions = (lang: Lang = "en") =>
  isEs(lang) ? esLists.separateScopeAdditions : SEPARATE_SCOPE_ADDITIONS;

export const scopeLevers = (lang: Lang = "en") =>
  isEs(lang) ? esLists.scopeLevers : SCOPE_LEVERS;

export const preparationPhase = (lang: Lang = "en") =>
  isEs(lang)
    ? { title: esLists.preparationTitle, inclusions: esLists.preparationInclusions, categories: PREPARATION_PHASE.categories }
    : PREPARATION_PHASE;
