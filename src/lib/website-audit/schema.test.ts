import { describe, expect, it } from "vitest";
import { meaningfulSchemaTypes } from "../../../supabase/functions/_shared/website-audit/schema.ts";

describe("website audit JSON-LD semantics", () => {
  it("rejects parseable values that are not meaningful schema documents", () => {
    for (const value of [{}, [], null, "Organization", { "@type": "Organization" }]) {
      expect([...meaningfulSchemaTypes(value)]).toEqual([]);
    }
  });

  it("accepts contextual and fully-qualified schema.org types", () => {
    expect([...meaningfulSchemaTypes({ "@context": "https://schema.org", "@type": "Organization" })]).toEqual(["Organization"]);
    expect([...meaningfulSchemaTypes({ "@type": "https://schema.org/Service" })]).toEqual(["Service"]);
  });

  it("collects graph types without accepting lookalike type names as organizations", () => {
    const types = meaningfulSchemaTypes({
      "@context": "https://schema.org",
      "@graph": [{ "@type": "Disorganization" }, { "@type": ["Article", "Person"] }],
    });
    expect([...types]).toEqual(["Article", "Person"]);
    expect(types.has("Organization")).toBe(false);
  });
});
