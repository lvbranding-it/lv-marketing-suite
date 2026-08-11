// ── Language resolution ─────────────────────────────────────────────────────────
// One entry point. Components and the engine take a `Lang` and ask for what they
// need; nothing else in the app decides how a language is spelled.

import { enNarratives } from "./en.narratives";
import { esNarratives } from "./es.narratives";
import type { Narratives } from "./narratives";
import type { Lang } from "./types";

export type { Lang } from "./types";
export type { CalcCopy } from "./types";
export type { Narratives } from "./narratives";

const NARRATIVES: Record<Lang, Narratives> = {
  en: enNarratives,
  es: esNarratives,
};

/** The composed prose for a language. Defaults to English. */
export const narrativesFor = (lang: Lang = "en"): Narratives => NARRATIVES[lang] ?? NARRATIVES.en;

/** BCP-47 tag for Intl formatting. USD stays USD; only the words change. */
export const localeFor = (lang: Lang = "en"): string => (lang === "es" ? "es-MX" : "en-US");

/** Long date, e.g. "August 11, 2026" / "11 de agosto de 2026". */
export function formatLongDate(d: Date, lang: Lang = "en"): string {
  return d.toLocaleDateString(localeFor(lang), { year: "numeric", month: "long", day: "numeric" });
}

/** "$6,000 to $9,000" / "$6,000 a $9,000". */
export const rangeJoiner = (lang: Lang = "en"): string => (lang === "es" ? "a" : "to");
