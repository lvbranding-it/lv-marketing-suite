import { describe, expect, it } from "vitest";
import { pickVoice, speechText } from "./voice";

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
