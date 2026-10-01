import { describe, expect, it } from "vitest";
import { buildCreativeContext } from "../../../supabase/functions/_shared/creative-canvas/context.ts";
import type { CreativeRequest } from "../../../supabase/functions/_shared/creative-canvas/types.ts";
import { LV_BRAND_IDENTITY_GUARDRAIL, LV_BRAND_VISUAL_IDENTITY_GUARDRAIL } from "../../../supabase/functions/_shared/lv-brand-identity.ts";

function request(overrides: Partial<CreativeRequest> = {}): CreativeRequest {
  return {
    projectId: "00000000-0000-4000-8000-000000000001", canvasId: "00000000-0000-4000-8000-000000000002", orgId: "00000000-0000-4000-8000-000000000003",
    operation: "write_copy", instruction: "Create a launch headline", provider: "auto", idempotencyKey: "stable-test-key",
    selectedNodes: [], language: "en", ...overrides,
  };
}

describe("LV Intelligence context selection", () => {
  it("keeps LV Branding distinct from Louis Vuitton in every text request", () => {
    const result = buildCreativeContext(request());
    expect(result.systemInstructions).toContain(LV_BRAND_IDENTITY_GUARDRAIL);
    expect(result.systemInstructions).toContain("LV Branding is NOT Louis Vuitton");
  });

  it("includes only selected objects allowed in AI context", () => {
    const result = buildCreativeContext(request({ selectedNodes: [
      { id: "included", type: "text", text: "Approved positioning", includeInAiContext: true },
      { id: "excluded", type: "reference", text: "Unrelated moodboard", includeInAiContext: false },
    ] }));
    expect(result.manifest.selectedObjectIds).toEqual(["included"]);
    expect(result.manifest.excludedObjectIds).toEqual(["excluded"]);
    expect(result.enhancedPrompt).toContain("Approved positioning");
    expect(result.enhancedPrompt).not.toContain("Unrelated moodboard");
  });

  it("constructs bilingual adaptation as intent-preserving copy work", () => {
    const result = buildCreativeContext(request({ operation: "adapt_en_es", instruction: "Make it natural for Houston", language: "es" }));
    expect(result.enhancedPrompt).toContain("market-aware Spanish");
    expect(result.systemInstructions).toContain("rather than translating literally");
    expect(result.structuredContext.language).toBe("es");
  });

  it("caps oversized context and records traceability", () => {
    const result = buildCreativeContext(request({ selectedNodes: Array.from({ length: 12 }, (_, index) => ({ id: `node-${index}`, type: "text", text: "x".repeat(8000) })) }));
    expect(result.manifest.truncated).toBe(true);
    expect(result.manifest.characterCount).toBeLessThanOrEqual(36_000);
    expect(result.manifest.selectedObjectIds).toHaveLength(12);
  });
});

describe("the prompt an image model receives", () => {
  const outfitTransfer = () => request({
    operation: "edit_image",
    instruction: "Keep the person and face from the first image. Replace only the clothing with the outfit from the second image.",
    referenceAssetIds: ["asset-person", "asset-outfit"],
    selectedNodes: [
      { id: "n1", type: "reference", title: "PHOTO-2026-09-10.jpg", text: "Reference notes", assetId: "asset-person", role: "selected" },
      { id: "n2", type: "reference", title: "76a80de17cb2.jpg", text: "Reference notes", assetId: "asset-outfit", role: "selected" },
    ],
    brandContext: {
      brandName: "LV Branding",
      visualPrinciples: "Warm, natural light. Real people.",
      prohibitedElements: "No watermarks",
      // Copy guidance has no business in a picture prompt.
      voiceTone: "Confident, never boastful",
      competitors: "A long list of competitors that says nothing about a photograph",
    },
  });

  it("leads with the instruction instead of burying it", () => {
    const { imagePrompt } = buildCreativeContext(outfitTransfer());
    expect(imagePrompt.startsWith("Keep the person and face from the first image")).toBe(true);
  });

  it("tells the image model who LV is before anything else is read into the letters", () => {
    const { imagePrompt } = buildCreativeContext(outfitTransfer());
    expect(imagePrompt).toContain(LV_BRAND_VISUAL_IDENTITY_GUARDRAIL);
    expect(imagePrompt.indexOf(LV_BRAND_VISUAL_IDENTITY_GUARDRAIL)).toBeLessThan(imagePrompt.indexOf("Brand — LV Branding"));
    expect(imagePrompt).not.toMatch(/louis|vuitton|lvmh/i);
  });

  /**
   * The request that came back with a fashion-house logo on the sweater: the
   * whole brand side of that prompt was "visualPrinciples: High-Contrast,
   * Cinematic, Textured Luxury; brandName: LV Branding".
   */
  it("gives the luxury-sweater request an identity to read LV by", () => {
    const { imagePrompt } = buildCreativeContext(request({
      operation: "generate_image",
      instruction: "Change the color of the sweater to red and make the background New York",
      brandContext: { brandName: "LV Branding", visualPrinciples: "High-Contrast, Cinematic, Textured Luxury" },
    }));
    expect(imagePrompt).toContain("Brand — LV Branding. Look: High-Contrast, Cinematic, Textured Luxury");
    expect(imagePrompt).toContain("not a fashion or luxury-goods label");
    expect(imagePrompt).not.toContain("brandName:");
  });

  it("stays within the image model prompt budget", () => {
    const prepared = buildCreativeContext(outfitTransfer());
    expect(prepared.imagePrompt.length).toBeLessThanOrEqual(2_400);
    expect(prepared.imagePrompt).not.toContain("Project context:");
  });

  it("names the attached images in the order they are sent", () => {
    const { imagePrompt } = buildCreativeContext(outfitTransfer());
    expect(imagePrompt).toContain("Image 1: PHOTO-2026-09-10.jpg");
    expect(imagePrompt).toContain("Image 2: 76a80de17cb2.jpg");
    expect(imagePrompt.indexOf("Image 1")).toBeLessThan(imagePrompt.indexOf("Image 2"));
  });

  it("keeps brand guidance that can be seen and drops guidance that cannot", () => {
    const { imagePrompt } = buildCreativeContext(outfitTransfer());
    expect(imagePrompt).toContain("Warm, natural light");
    expect(imagePrompt).not.toContain("never boastful");
    expect(imagePrompt).not.toContain("competitors that says nothing");
  });

  it("says nothing about images when none are attached", () => {
    const { imagePrompt } = buildCreativeContext(request({ operation: "generate_image", instruction: "Make a red goat", referenceAssetIds: [] }));
    expect(imagePrompt).toContain("Make a red goat");
    expect(imagePrompt).not.toContain("Image 1");
  });

  it("carries connected direction as a line, not as the subject", () => {
    const { imagePrompt } = buildCreativeContext(request({
      operation: "generate_image",
      instruction: "A product shot of the bottle",
      selectedNodes: [
        { id: "n1", type: "image", title: "Bottle", text: "the bottle", role: "selected" },
        { id: "n2", type: "creative_direction", title: "Warm", text: "Low golden light, shallow depth", role: "inherited", depth: 1 },
      ],
    }));
    expect(imagePrompt.indexOf("A product shot of the bottle")).toBe(0);
    expect(imagePrompt).toContain("Low golden light");
  });

  it("draws from the selected card's text, not only the instruction", () => {
    const { imagePrompt } = buildCreativeContext(request({
      operation: "generate_image",
      instruction: "Make the key visual",
      selectedNodes: [
        { id: "n1", type: "conversation", title: "Campaign concept", text: "A founder at dawn on a Houston rooftop, city waking behind her", role: "selected" },
      ],
    }));
    expect(imagePrompt).toContain("Subject — Campaign concept: A founder at dawn on a Houston rooftop");
  });

  it("takes an AI reply card's response, not the instruction that asked for it", () => {
    const { imagePrompt } = buildCreativeContext(request({
      operation: "generate_image",
      instruction: "Make the key visual",
      selectedNodes: [{
        id: "n1", type: "conversation", title: "Campaign concept", role: "selected",
        text: "Instruction\nGive me three concepts from this photo\n\nResponse\nA founder at dawn on a Houston rooftop",
      }],
    }));
    expect(imagePrompt).toContain("Subject — Campaign concept: A founder at dawn on a Houston rooftop");
    expect(imagePrompt).not.toContain("Give me three concepts");
  });

  it("keeps picture captions and failed-run errors out of the prompt", () => {
    const { imagePrompt } = buildCreativeContext(request({
      operation: "edit_image",
      instruction: "Warm the light",
      referenceAssetIds: ["asset-photo"],
      selectedNodes: [
        { id: "n1", type: "reference", title: "photo.jpg", text: "Reference notes", assetId: "asset-photo", role: "selected" },
        { id: "n2", type: "generation", title: "Generate image", text: "Warm the light\n\nGeneration timed out", role: "inherited", depth: 1 },
      ],
    }));
    expect(imagePrompt).toContain("Image 1: photo.jpg");
    expect(imagePrompt).not.toContain("Reference notes");
    expect(imagePrompt).not.toContain("timed out");
  });

  it("names the client when the brand panel is empty", () => {
    const { imagePrompt } = buildCreativeContext(
      request({ operation: "generate_image", instruction: "A storefront at night" }),
      { name: "Spring launch", clientName: "Casa Melilla" },
    );
    expect(imagePrompt).toContain("Brand — Casa Melilla");
  });

  it("stays inside the cap with a long instruction and four pictures", () => {
    const { imagePrompt } = buildCreativeContext(request({
      operation: "edit_image",
      instruction: "x".repeat(5_000),
      referenceAssetIds: ["a1", "a2", "a3", "a4"],
      selectedNodes: ["a1", "a2", "a3", "a4"].map((assetId) => ({ id: assetId, type: "image", title: "y".repeat(200), assetId, role: "selected" as const })),
      brandContext: { brandName: "LV Branding", visualPrinciples: "z".repeat(5_000) },
    }));
    expect(imagePrompt.length).toBeLessThanOrEqual(2_400);
    expect(imagePrompt).toContain(LV_BRAND_VISUAL_IDENTITY_GUARDRAIL);
    expect(imagePrompt.endsWith("in the output.")).toBe(true);
  });

  it("leaves the writing prompt alone", () => {
    const { enhancedPrompt } = buildCreativeContext(request());
    expect(enhancedPrompt).toContain("Project context:");
    expect(enhancedPrompt.trimEnd().endsWith("Create a launch headline")).toBe(true);
  });
});

describe("one image in, one image out", () => {
  it("tells every image request to return a single image", () => {
    // Two references handed to the edits endpoint will otherwise sometimes come
    // back as a diptych of the inputs rather than the edit that was asked for.
    const { imagePrompt } = buildCreativeContext(request({
      operation: "edit_image",
      instruction: "Replace the clothing with the outfit from the second image",
      referenceAssetIds: ["asset-person", "asset-outfit"],
    }));
    expect(imagePrompt).toContain("Return exactly one finished image");
    expect(imagePrompt).toContain("do not include the reference images themselves");
  });

  it("keeps the rule even when the context is long enough to be trimmed", () => {
    const { imagePrompt } = buildCreativeContext(request({
      operation: "generate_image",
      instruction: "x".repeat(5_000),
      brandContext: { visualPrinciples: "y".repeat(5_000), approvedColors: "z".repeat(5_000) },
    }));
    expect(imagePrompt.endsWith("in the output.")).toBe(true);
    expect(imagePrompt.length).toBeLessThanOrEqual(2_400);
  });

  it("leaves writing prompts alone", () => {
    expect(buildCreativeContext(request()).enhancedPrompt).not.toContain("Return exactly one finished image");
  });
});
