import { describe, expect, it } from "vitest";
import {
  createScheme,
  deleteScheme,
  duplicateScheme,
  exportScheme,
  formatSchemeColorsForCopy,
  getBuiltInSchemes,
  importScheme,
  LV_BRANDING_SCHEME,
  normalizeHexColor,
  renameScheme,
  sanitizeSchemeId,
  sanitizeSchemeName,
  schemeExportFilename,
  SchemeError,
  updateSchemeColors,
} from "./index";

const FIRST_DATE = new Date("2026-05-01T12:30:00.000Z");
const LATER_DATE = new Date("2026-05-02T08:00:00.000Z");

describe("palette scheme utilities", () => {
  it("provides the required immutable LV Branding preset", () => {
    expect(LV_BRANDING_SCHEME).toMatchObject({
      id: "builtin-lv-branding",
      name: "LV Branding",
      colors: ["#CB2039", "#231F20", "#FFFFFF"],
      isBuiltIn: true,
    });
    expect(Object.isFrozen(LV_BRANDING_SCHEME)).toBe(true);
    expect(Object.isFrozen(LV_BRANDING_SCHEME.colors)).toBe(true);
    expect(new Date(LV_BRANDING_SCHEME.createdAt).toISOString()).toBe(LV_BRANDING_SCHEME.createdAt);
  });

  it("returns defensive copies of built-in records", () => {
    const first = getBuiltInSchemes();
    first[0].colors[0] = "#000000";
    expect(getBuiltInSchemes()[0].colors[0]).toBe("#CB2039");
  });

  it("sanitizes display names and generated IDs", () => {
    expect(sanitizeSchemeName("  Launch <script>alert(1)</script>  \u202e palette  ")).toBe("Launch alert(1) palette");
    expect(sanitizeSchemeName("<>\u0000")).toBe("Untitled scheme");
    expect(sanitizeSchemeId(" ../../Bad palette!? ")).toBe("Bad-palette");
  });

  it("normalizes supported HEX forms", () => {
    expect(normalizeHexColor("abc")).toBe("#AABBCC");
    expect(normalizeHexColor(" #cb2039 ")).toBe("#CB2039");
    expect(normalizeHexColor("#abcd")).toBeNull();
  });

  it("creates a custom scheme with a safe unique ID and canonical ISO dates", () => {
    const result = createScheme(
      getBuiltInSchemes(),
      { name: "  <b>Campaign</b> colors ", colors: ["abc", "#cb2039"] },
      { now: FIRST_DATE, idFactory: () => "../../spring campaign" },
    );
    expect(result.scheme).toEqual({
      id: "scheme-spring-campaign",
      name: "Campaign colors",
      colors: ["#AABBCC", "#CB2039"],
      createdAt: FIRST_DATE.toISOString(),
      updatedAt: FIRST_DATE.toISOString(),
      isBuiltIn: false,
    });
    expect(result.schemes).toHaveLength(2);
  });

  it("makes generated IDs unique when an ID factory repeats a value", () => {
    const initial = createScheme([], { name: "One", colors: ["#111111"] }, { now: FIRST_DATE, idFactory: () => "fixed" });
    const second = createScheme(initial.schemes, { name: "Two", colors: ["#222222"] }, { now: FIRST_DATE, idFactory: () => "fixed" });
    expect(initial.scheme.id).toBe("scheme-fixed");
    expect(second.scheme.id).toBe("scheme-fixed-2");
  });

  it("renames and recolors a custom scheme without mutating the source array", () => {
    const created = createScheme([], { name: "Original", colors: ["#111111"] }, { now: FIRST_DATE, idFactory: () => "one" });
    const renamed = renameScheme(created.schemes, created.scheme.id, "  New <em>Name</em> ", { now: LATER_DATE });
    const recolored = updateSchemeColors(renamed.schemes, created.scheme.id, ["fff", "#000000"], { now: LATER_DATE });

    expect(created.scheme.name).toBe("Original");
    expect(renamed.scheme.name).toBe("New Name");
    expect(renamed.scheme.createdAt).toBe(FIRST_DATE.toISOString());
    expect(renamed.scheme.updatedAt).toBe(LATER_DATE.toISOString());
    expect(recolored.scheme.colors).toEqual(["#FFFFFF", "#000000"]);
  });

  it("duplicates a built-in as a new editable custom scheme", () => {
    const result = duplicateScheme(getBuiltInSchemes(), "builtin-lv-branding", {
      now: FIRST_DATE,
      idFactory: () => "lv-copy",
    });
    expect(result.scheme).toMatchObject({
      id: "scheme-lv-copy",
      name: "LV Branding copy",
      colors: ["#CB2039", "#231F20", "#FFFFFF"],
      isBuiltIn: false,
    });
  });

  it("deletes custom schemes but protects the built-in from deletion or editing", () => {
    const builtIns = getBuiltInSchemes();
    const created = createScheme(builtIns, { name: "Temporary", colors: ["#123456"] }, { now: FIRST_DATE, idFactory: () => "temp" });
    expect(deleteScheme(created.schemes, created.scheme.id).schemes).toEqual(builtIns);

    for (const operation of [
      () => deleteScheme(builtIns, "builtin-lv-branding"),
      () => renameScheme(builtIns, "builtin-lv-branding", "Changed", { now: LATER_DATE }),
      () => updateSchemeColors(builtIns, "builtin-lv-branding", ["#000000"], { now: LATER_DATE }),
    ]) {
      try {
        operation();
        throw new Error("Expected a protected-scheme error");
      } catch (error) {
        expect(error).toBeInstanceOf(SchemeError);
        expect((error as SchemeError).code).toBe("BUILT_IN_PROTECTED");
      }
    }
  });

  it("exports and imports a scheme while retaining its sanitized name and ordered colors", () => {
    const created = createScheme([], { name: "Launch palette", colors: ["#ABCDEF", "#012345"] }, { now: FIRST_DATE, idFactory: () => "original" });
    const serialized = exportScheme(created.scheme);
    const parsed = JSON.parse(serialized);
    expect(parsed).toMatchObject({ kind: "lv-motion-palette-scheme", version: 1 });

    const imported = importScheme(serialized, created.schemes, { now: LATER_DATE, idFactory: () => "imported" });
    expect(imported.scheme.name).toBe("Launch palette");
    expect(imported.scheme.colors).toEqual(["#ABCDEF", "#012345"]);
    expect(imported.scheme.id).toBe("scheme-imported");
    expect(imported.scheme.isBuiltIn).toBe(false);
  });

  it("rejects invalid imported JSON and invalid scheme colors", () => {
    expect(() => importScheme("not json", [], { now: FIRST_DATE })).toThrow(/not valid JSON/i);
    expect(() => createScheme([], { name: "Bad", colors: ["red"] }, { now: FIRST_DATE })).toThrow(/valid HEX colors/i);
  });

  it("formats copy text and a filesystem-safe export name", () => {
    expect(formatSchemeColorsForCopy(LV_BRANDING_SCHEME)).toBe("#CB2039\n#231F20\n#FFFFFF");
    expect(formatSchemeColorsForCopy(LV_BRANDING_SCHEME, ", ")).toBe("#CB2039, #231F20, #FFFFFF");
    expect(schemeExportFilename({ name: "  Café / Spring <b>2026</b>  " })).toBe("cafe-spring-2026.motion-palette.json");
  });
});
