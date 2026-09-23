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
    expect(LV_BRAND_VISUAL_IDENTITY_GUARDRAIL).toContain("interlocking monograms");
  });
});
