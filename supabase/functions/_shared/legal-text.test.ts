import { describe, expect, it } from "vitest";
import { canonicalJson, drawnWidth, pdfSafe, validSignature, wrapText } from "./legal-text";

describe("canonicalJson", () => {
  it("gives the same text whatever order keys were written in, so the fingerprint is stable", () => {
    expect(canonicalJson({ b: 1, a: [{ y: 2, x: "é" }] })).toBe(canonicalJson({ a: [{ x: "é", y: 2 }], b: 1 }));
    expect(canonicalJson({ b: 1, a: 2 })).toBe('{"a":2,"b":1}');
  });
});

describe("validSignature", () => {
  it("takes a typed name or a drawn PNG and nothing else", () => {
    expect(validSignature({ type: "type", value: "  Ana Ruiz " })).toEqual({ type: "type", value: "Ana Ruiz" });
    expect(validSignature({ type: "type", value: "A" })).toBeNull();
    expect(validSignature({ type: "draw", value: "data:image/png;base64,iVBORw0KGgo=" })).toEqual({ type: "draw", value: "data:image/png;base64,iVBORw0KGgo=" });
    expect(validSignature({ type: "draw", value: "data:image/svg+xml;base64,PHN2Zz4=" })).toBeNull();
    expect(validSignature({ type: "draw", value: `data:image/png;base64,${"A".repeat(400_001)}` })).toBeNull();
    expect(validSignature(null)).toBeNull();
  });
});

describe("pdfSafe", () => {
  it("keeps Spanish and typographic marks, and replaces what the PDF fonts cannot draw", () => {
    expect(pdfSafe("Autorización — “sí” ñ ¿qué?")).toBe("Autorización — “sí” ñ ¿qué?");
    expect(pdfSafe("9:30 AM")).toBe("9:30 AM");
    expect(pdfSafe("Hola 🙂")).toBe("Hola ??");
  });
});

describe("wrapText", () => {
  const measure = (line: string) => line.length;

  it("breaks at spaces within the width and keeps paragraph breaks", () => {
    expect(wrapText("one two three four", measure, 9)).toEqual(["one two", "three", "four"]);
    expect(wrapText("a\nb", measure, 9)).toEqual(["a", "b"]);
  });

  it("splits a word only when it alone is wider than the line", () => {
    expect(wrapText("abcdefghijk", measure, 4)).toEqual(["abcd", "efgh", "ijk"]);
  });
});

describe("drawnWidth", () => {
  it("adds up each character, the way the PDF draws them", () => {
    const widths: Record<string, number> = { T: 6, y: 5, ":": 3, " ": 2.5 };
    expect(drawnWidth("Ty: ", (char) => widths[char])).toBe(16.5);
    expect(drawnWidth("", () => 1)).toBe(0);
  });
});
