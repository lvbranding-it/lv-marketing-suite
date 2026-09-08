/**
 * Text and voice preparation for the Advisor, kept free of network and storage
 * imports so it can be reasoned about — and tested — on its own.
 */

/**
 * Prepares model output for a speech engine.
 *
 * Markdown, links and emoji go because they are read aloud literally: a rocket
 * in a greeting becomes the spoken word "rocket".
 *
 * "LV" is respelled because speech engines read it as a Roman numeral — L is
 * fifty and V is five — so "LV Branding" was being announced as "fifty-five
 * Branding". This string is spoken and never displayed, so writing it the way
 * it should sound is the fix: the letters in English, and the way the pair is
 * actually said aloud in Spanish.
 */
export function speechText(text: string, language = "en"): string {
  return text
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/[*_`#>|]/g, "")
    .replace(/\bLV\b/g, language === "es" ? "Eleve" : "El Vee")
    .replace(/\p{Extended_Pictographic}/gu, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/**
 * Voices that exist for comic effect. macOS lists them alongside the real ones,
 * and picking the first match for a language meant one platform reordering
 * stood between the Advisor and being narrated by "Bubbles" or "Zarvox".
 */
const NOVELTY_VOICE =
  /^(albert|bad news|bahh|bells|boing|bubbles|cellos|eddy|flo|fred|good news|grandma|grandpa|jester|junior|kathy|organ|ralph|reed|rocko|sandy|shelley|superstar|trinoids|whisper|wobble|zarvox)\b/i;

/** Preferred narrators, best first, chosen for clarity rather than character. */
const PREFERRED_VOICES: Record<string, string[]> = {
  en: ["ava", "samantha", "allison", "zoe", "alex", "daniel", "karen"],
  // No es-US voice exists on macOS, so Spanish previously fell through to a
  // character voice. Mexican Spanish leads, matching who this portal serves.
  es: ["paulina", "mónica", "monica", "angelica", "juan", "diego"],
};

/** macOS lists its high-quality variants only once they have been downloaded. */
const isUpgradedVoice = (name: string) => /\((enhanced|premium)\)/i.test(name);

/**
 * The platform reports no voices until it has loaded them, so the first reply
 * read aloud used to get whatever default the engine chose. The last good list
 * is remembered instead.
 */
let cachedVoices: SpeechSynthesisVoice[] = [];
export function voiceList(): SpeechSynthesisVoice[] {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return cachedVoices;
  const live = window.speechSynthesis.getVoices();
  if (live.length) cachedVoices = live;
  return cachedVoices;
}

export function pickVoice(
  voices: SpeechSynthesisVoice[],
  language: string,
): SpeechSynthesisVoice | null {
  const prefix = language === "es" ? "es" : "en";
  const matching = voices.filter((v) => v.lang.toLowerCase().startsWith(prefix));
  const candidates = matching.filter((v) => !NOVELTY_VOICE.test(v.name));
  // A novelty voice still beats silence if a platform ships nothing else.
  if (!candidates.length) return matching[0] ?? null;
  const order = PREFERRED_VOICES[prefix] ?? [];
  const rank = (v: SpeechSynthesisVoice) => {
    const named = order.findIndex((name) => v.name.toLowerCase().startsWith(name));
    return (named < 0 ? order.length : named) - (isUpgradedVoice(v.name) ? 0.5 : 0);
  };
  return [...candidates].sort((a, b) => rank(a) - rank(b))[0];
}
