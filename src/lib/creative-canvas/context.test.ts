import { describe, expect, it } from "vitest";
import { buildCreativeContext } from "../../../supabase/functions/_shared/creative-canvas/context.ts";
import type { CreativeRequest } from "../../../supabase/functions/_shared/creative-canvas/types.ts";

function request(overrides: Partial<CreativeRequest> = {}): CreativeRequest {
  return {
    projectId: "00000000-0000-4000-8000-000000000001", canvasId: "00000000-0000-4000-8000-000000000002", orgId: "00000000-0000-4000-8000-000000000003",
    operation: "write_copy", instruction: "Create a launch headline", provider: "auto", idempotencyKey: "stable-test-key",
    selectedNodes: [], language: "en", ...overrides,
  };
}

describe("LV Intelligence context selection", () => {
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

  it("stays short enough for the model to weigh it", () => {
    // The text prompt for the same request is tens of thousands of characters.
    const prepared = buildCreativeContext(outfitTransfer());
    expect(prepared.imagePrompt.length).toBeLessThan(2_500);
    expect(prepared.imagePrompt.length).toBeLessThan(prepared.enhancedPrompt.length);
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
