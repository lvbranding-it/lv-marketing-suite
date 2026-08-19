import { describe, expect, it } from "vitest";
import { matchesSiteSignal } from "../../../supabase/functions/_shared/website-audit/heuristics.ts";

describe("website audit language-specific content heuristics", () => {
  it("recognizes English audience, trust, and CTA signals", () => {
    const copy = "We help operations leaders. Read our case studies, then book a call.";
    expect(matchesSiteSignal(copy, "en", "audience")).toBe(true);
    expect(matchesSiteSignal(copy, "en", "trust")).toBe(true);
    expect(matchesSiteSignal(copy, "en", "cta")).toBe(true);
    expect(matchesSiteSignal("View pricing or make an appointment", "en", "cta")).toBe(true);
    expect(matchesSiteSignal("Open customer portal", "en", "cta")).toBe(true);
  });

  it("recognizes Spanish audience, trust, and CTA signals", () => {
    const copy = "Ayudamos a líderes de operaciones. Conoce nuestros casos de éxito y agenda una llamada.";
    expect(matchesSiteSignal(copy, "es", "audience")).toBe(true);
    expect(matchesSiteSignal(copy, "es", "trust")).toBe(true);
    expect(matchesSiteSignal(copy, "es", "cta")).toBe(true);
    expect(matchesSiteSignal("Ver precios o agenda una cita", "es", "cta")).toBe(true);
  });

  it("does not apply the other language's vocabulary to a known-language page", () => {
    expect(matchesSiteSignal("Agenda una llamada", "en", "cta")).toBe(false);
    expect(matchesSiteSignal("Book a call", "es", "cta")).toBe(false);
  });

  it("uses both catalogs only when page language is unknown", () => {
    expect(matchesSiteSignal("Agenda una llamada", "unknown", "cta")).toBe(true);
    expect(matchesSiteSignal("Book a call", "unknown", "cta")).toBe(true);
  });
});
