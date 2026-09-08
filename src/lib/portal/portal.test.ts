import { describe, expect, it } from "vitest";
import { canSubmit, emptyLead, searchTerm, stages } from "./types";
import { portalTranslations } from "./translations";

describe("portal language and input contracts", () => {
  it("provides matching English and Spanish labels including all stages", () => {
    expect(Object.keys(portalTranslations.en).sort()).toEqual(
      Object.keys(portalTranslations.es).sort(),
    );
    for (const lang of ["en", "es"] as const) {
      for (const stage of stages)
        expect(portalTranslations[lang][`portal.${stage}`]).toBeTruthy();
      for (const value of Object.values(portalTranslations[lang]))
        expect(value.trim()).not.toBe("");
    }
  });
  it("requires handoff fields and allows email or phone", () => {
    expect(canSubmit(emptyLead)).toBe(false);
    const lead = {
      ...emptyLead,
      first_name: "Ana",
      last_name: "Lopez",
      company: "Example",
      phone: "555 123 4567",
      source: "Event",
      service: "Branding",
      summary: "Needs discovery",
    };
    expect(canSubmit(lead)).toBe(true);
    expect(canSubmit({ ...lead, phone: "", email: "ana@example.test" })).toBe(
      true,
    );
    expect(canSubmit({ ...lead, summary: "   " })).toBe(false);
  });
  it("prevents filter syntax injection and preserves Spanish names", () => {
    expect(searchTerm("García,or(org_id.eq.other)%_*")).toBe(
      "Garcíaororg_id.eq.other".replace("_", ""),
    );
    expect(searchTerm("  García  ")).toBe("García");
    expect(searchTerm("x".repeat(200))).toHaveLength(100);
  });
});
