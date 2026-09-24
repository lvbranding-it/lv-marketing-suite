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

/** One segment of speech as a recognition engine reports it. */
export interface SpeechResult {
  isFinal: boolean;
  0: { transcript: string };
}

/** What a recognition event adds to the message, and what is still being heard. */
export interface Dictation {
  /** Settled words to append to the message, empty when nothing new settled. */
  settled: string;
  /** Words still being heard, shown live and replaced by the next event. */
  pending: string;
  /** How many segments have now been handed over; feeds the next call. */
  delivered: number;
}

/**
 * Reads one recognition event.
 *
 * A continuous session reports every segment it has ever settled on, every time
 * anything changes. Appending whatever the event carried therefore repeated the
 * same sentence on each update, so `delivered` records how far the message has
 * already consumed and only later segments are handed over.
 *
 * Segments that are not yet final are returned separately: they are a preview
 * that the next event will revise, so they belong on screen but never in the
 * message itself.
 */
export function readDictation(
  results: ArrayLike<SpeechResult>,
  delivered: number,
): Dictation {
  const settled: string[] = [];
  let pending = "";
  let seen = delivered;
  Array.from(results).forEach((result, index) => {
    const text = result[0].transcript.trim();
    if (!result.isFinal) {
      if (text) pending += (pending ? " " : "") + text;
      return;
    }
    if (index < delivered) return;
    seen = Math.max(seen, index + 1);
    if (text) settled.push(text);
  });
  return { settled: settled.join(" "), pending, delivered: seen };
}

/**
 * Joins dictated words onto a message without doubling or losing the space.
 *
 * The end of the message is trimmed before the join because each append leaves
 * the previous one's spacing behind; without it a long dictation accumulates a
 * wider and wider gap between every phrase.
 */
export function appendDictation(message: string, addition: string): string {
  const words = addition.trim();
  if (!words) return message;
  const kept = message.replace(/\s+$/, "");
  return kept ? `${kept} ${words}` : words;
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
