import { describe, expect, it } from "vitest";
import {
  appendDictation,
  pickVoice,
  readDictation,
  speechText,
  type SpeechResult,
} from "./voice";

const said = (transcript: string, isFinal: boolean): SpeechResult => ({
  isFinal,
  0: { transcript },
});

describe("reading speech as it arrives", () => {
  it("shows unsettled words without putting them in the message", () => {
    const heard = readDictation([said("help me intro", false)], 0);
    expect(heard).toEqual({ settled: "", pending: "help me intro", delivered: 0 });
  });

  /**
   * A continuous session re-reports every settled segment on each event, so a
   * reader that trusts the event alone repeats whole sentences into the message.
   */
  it("hands over each settled segment exactly once", () => {
    const first = readDictation([said("Help me introduce LV Branding", true)], 0);
    expect(first.settled).toBe("Help me introduce LV Branding");

    const second = readDictation(
      [said("Help me introduce LV Branding", true), said("to a restaurant owner", true)],
      first.delivered,
    );
    expect(second.settled).toBe("to a restaurant owner");

    const quiet = readDictation(
      [said("Help me introduce LV Branding", true), said("to a restaurant owner", true)],
      second.delivered,
    );
    expect(quiet.settled).toBe("");
  });

  it("separates what settled from what is still being heard", () => {
    const heard = readDictation([said("Draft an introduction", true), said("for a clinic", false)], 0);
    expect(heard.settled).toBe("Draft an introduction");
    expect(heard.pending).toBe("for a clinic");
    expect(heard.delivered).toBe(1);
  });

  it("ignores segments that carried no words", () => {
    expect(readDictation([said("   ", true)], 0)).toEqual({
      settled: "",
      pending: "",
      delivered: 1,
    });
  });
});

describe("adding dictated words to a message", () => {
  it.each([
    ["", "Hello there", "Hello there"],
    ["Hello", "there", "Hello there"],
    ["Hello ", "there", "Hello there"],
    ["Hello", "   ", "Hello"],
    ["", "", ""],
  ])("joins %o and %o", (message, addition, expected) =>
    expect(appendDictation(message, addition)).toBe(expected),
  );
});

const voice = (name: string, lang: string) =>
  ({ name, lang, localService: true, default: false, voiceURI: name }) as SpeechSynthesisVoice;

// The real macOS list, trimmed: the character voices sit among the usable ones,
// which is what made "first match wins" unsafe.
const MAC_VOICES = [
  voice("Samantha", "en-US"),
  voice("Albert", "en-US"),
  voice("Bubbles", "en-US"),
  voice("Zarvox", "en-US"),
  voice("Daniel", "en-GB"),
  voice("Eddy (Spanish (Spain))", "es-ES"),
  voice("Mónica", "es-ES"),
  voice("Paulina", "es-MX"),
];

describe("speechText", () => {
  it("spells LV out rather than letting it be read as a Roman numeral", () => {
    // L is fifty and V is five, so the engine announced "fifty-five Branding".
    expect(speechText("Welcome to LV Branding", "en")).toBe("Welcome to El Vee Branding");
    expect(speechText("Bienvenido a LV Branding", "es")).toBe("Bienvenido a Eleve Branding");
  });

  it("leaves words that merely contain those letters alone", () => {
    expect(speechText("Solve the LVL puzzle", "en")).toBe("Solve the LVL puzzle");
  });

  it("removes markdown, links and emoji that would be read aloud literally", () => {
    expect(speechText("**Welcome** aboard 🚀", "en")).toBe("Welcome aboard");
    expect(speechText("See [our site](https://lvbranding.com) today", "en")).toBe("See our site today");
    expect(speechText("Read https://example.com/x now", "en")).toBe("Read now");
  });
});

describe("pickVoice", () => {
  it("never returns a novelty voice when a usable one exists", () => {
    expect(pickVoice(MAC_VOICES, "en")?.name).toBe("Samantha");
  });

  it("chooses Mexican Spanish, which the old es-US request could never match", () => {
    expect(pickVoice(MAC_VOICES, "es")?.name).toBe("Paulina");
  });

  it("prefers a downloaded high-quality variant when the platform offers one", () => {
    const upgraded = [voice("Samantha", "en-US"), voice("Ava (Premium)", "en-US")];
    expect(pickVoice(upgraded, "en")?.name).toBe("Ava (Premium)");
  });

  it("falls back to a novelty voice only when nothing else speaks the language", () => {
    expect(pickVoice([voice("Zarvox", "en-US")], "en")?.name).toBe("Zarvox");
    expect(pickVoice([voice("Zarvox", "en-US")], "es")).toBeNull();
  });
});
