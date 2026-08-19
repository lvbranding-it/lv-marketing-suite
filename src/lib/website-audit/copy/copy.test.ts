import { describe, expect, it } from "vitest";
import { DIMENSIONS, RULE_IDS } from "../types";
import { auditCopyFor } from ".";

function flatten(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value === "function") return [];
  if (Array.isArray(value)) return value.flatMap(flatten);
  if (value && typeof value === "object") return Object.values(value).flatMap(flatten);
  return [];
}

describe("website audit bilingual copy", () => {
  it("contains every stable rule and dimension in both languages", () => {
    for (const language of ["en", "es"] as const) {
      const copy = auditCopyFor(language);
      expect(Object.keys(copy.rules).sort()).toEqual([...RULE_IDS].sort());
      expect(Object.keys(copy.dimensions).sort()).toEqual([...DIMENSIONS].sort());
    }
  });

  it("has no empty static production strings", () => {
    for (const language of ["en", "es"] as const) {
      expect(flatten(auditCopyFor(language)).every((value) => value.trim().length > 0)).toBe(true);
    }
  });

  it("keeps the same stable catalog surface in English and Spanish", () => {
    const keys = (value: unknown, path = "root"): string[] => {
      if (Array.isArray(value)) return value.flatMap((item, index) => keys(item, `${path}.${index}`));
      if (value && typeof value === "object") return Object.entries(value).flatMap(([key, item]) => keys(item, `${path}.${key}`));
      return [path];
    };
    expect(keys(auditCopyFor("es")).sort()).toEqual(keys(auditCopyFor("en")).sort());
  });
});
