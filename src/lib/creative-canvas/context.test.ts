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
