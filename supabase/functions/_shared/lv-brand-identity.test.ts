import { describe, expect, it } from "vitest";
import { LV_BRAND_IDENTITY_GUARDRAIL, LV_BRAND_VISUAL_IDENTITY_GUARDRAIL } from "./lv-brand-identity";

describe("LV Branding agency identity", () => {
  it("states the corporate distinction without ambiguity", () => {
    expect(LV_BRAND_IDENTITY_GUARDRAIL).toContain("LV Branding is NOT Louis Vuitton");
    expect(LV_BRAND_IDENTITY_GUARDRAIL).toContain("is not LVMH");
    expect(LV_BRAND_IDENTITY_GUARDRAIL).toContain("not affiliated with");
    expect(LV_BRAND_IDENTITY_GUARDRAIL).toContain('"LV" means LV Branding');
  });

  it("protects the official logo without forcing disclaimers into routine work", () => {
    expect(LV_BRAND_IDENTITY_GUARDRAIL).toContain("official LV Branding logo");
    expect(LV_BRAND_IDENTITY_GUARDRAIL).toContain("Never replace, reinterpret, or autocomplete");
    expect(LV_BRAND_IDENTITY_GUARDRAIL).toContain("Do not repeat an unsolicited legal disclaimer");
  });
});

describe("LV Branding identity for image models", () => {
  it("says what LV means and what the agency looks like", () => {
    expect(LV_BRAND_VISUAL_IDENTITY_GUARDRAIL).toContain('"LV" and "LV Branding" always mean LV Branding');
    expect(LV_BRAND_VISUAL_IDENTITY_GUARDRAIL).toContain("not a fashion or luxury-goods label");
    expect(LV_BRAND_VISUAL_IDENTITY_GUARDRAIL).toContain("red (#CB2039) circular badge with the letters LV in white");
    expect(LV_BRAND_VISUAL_IDENTITY_GUARDRAIL).toContain("reproduce it exactly as given");
  });

  /**
   * An image model reads "never draw the monogram" as a mention of the monogram.
   * The rule guards against borrowed branding without naming the brand it is
   * guarding against.
   */
  it("never names the fashion house it keeps out of the picture", () => {
    expect(LV_BRAND_VISUAL_IDENTITY_GUARDRAIL).not.toMatch(/louis|vuitton|lvmh|flower motif/i);
    expect(LV_BRAND_VISUAL_IDENTITY_GUARDRAIL).toContain("Do not add designer logos, monogram patterns");
  });

  it("fits the image prompt budget with room to spare", () => {
    expect(LV_BRAND_VISUAL_IDENTITY_GUARDRAIL.length).toBeLessThan(600);
  });
});
