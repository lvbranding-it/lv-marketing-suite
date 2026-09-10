import { describe, expect, it } from "vitest";
import { createEmptyScene, generationTransitionAllowed, restoreScene, serializeScene } from "./scene";
import { sanitizeCreativeFilename, validateCreativeUpload } from "./types";

describe("creative canvas scene persistence", () => {
  it("serializes and restores the normalized vendor-independent scene", () => {
    const scene = createEmptyScene();
    scene.nodes.push({ id: "brief", type: "brand_context", position: { x: 10, y: 20 }, size: { width: 360, height: 240 }, title: "Brief", body: "Context", accent: "#CB2039", includeInContext: true, status: "draft" });
    const serialized = serializeScene(scene);
    expect(serialized.schemaVersion).toBe(1);
    expect(restoreScene(serialized)?.nodes[0].title).toBe("Brief");
    expect(restoreScene({ ...serialized, schemaVersion: 2 })).toBeNull();
    expect(JSON.stringify(serialized)).not.toMatch(/react.?flow/i);
  });

  it("enforces generation lifecycle transitions", () => {
    expect(generationTransitionAllowed("draft", "queued")).toBe(true);
    expect(generationTransitionAllowed("processing", "completed")).toBe(true);
    expect(generationTransitionAllowed("completed", "processing")).toBe(false);
    expect(generationTransitionAllowed("failed", "queued")).toBe(true);
  });
});

describe("creative asset validation", () => {
  it("accepts supported images only when MIME and extension agree", () => {
    expect(validateCreativeUpload({ name: "reference.PNG", size: 1024, type: "image/png" } as File)).toBeNull();
    expect(validateCreativeUpload({ name: "reference.svg", size: 1024, type: "image/svg+xml" } as File)).toMatch(/PNG/);
    expect(validateCreativeUpload({ name: "spoofed.jpg", size: 1024, type: "image/png" } as File)).toMatch(/matching/);
    expect(validateCreativeUpload({ name: "large.webp", size: 26 * 1024 * 1024, type: "image/webp" } as File)).toMatch(/25 MB/);
  });

  it("sanitizes filenames without retaining path separators", () => {
    expect(sanitizeCreativeFilename("../../Client Brief (final).png")).toBe("..-..-Client-Brief-final-.png");
    expect(sanitizeCreativeFilename("///")).toBe("creative-asset");
  });
});
