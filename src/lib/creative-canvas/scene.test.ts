import { describe, expect, it } from "vitest";
import { createEmptyScene, generationTransitionAllowed, restoreScene, sceneFingerprint, serializeScene, type CreativeSceneDocument } from "./scene";
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

describe("deciding whether a canvas needs saving", () => {
  const scene = (): CreativeSceneDocument => serializeScene({
    schemaVersion: 1,
    viewport: { x: 505, y: 375, zoom: 0.72 },
    nodes: [{ id: "n1", type: "text", position: { x: 10, y: 20 }, size: { width: 320, height: 220 }, title: "Hook", body: "Made here.", accent: "#CB2039", includeInContext: true, status: "draft" }],
    edges: [{ id: "e1", source: "n1", target: "n2", kind: "association" }],
  });

  /** Postgres jsonb reorders object keys; the scene that comes back is the same document. */
  const asStoredByPostgres = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(asStoredByPostgres);
    if (value && typeof value === "object") {
      const keys = Object.keys(value).sort((a, b) => a.length - b.length || a.localeCompare(b));
      return Object.fromEntries(keys.map((key) => [key, asStoredByPostgres((value as Record<string, unknown>)[key])]));
    }
    return value;
  };

  it("treats a scene loaded back from the database as unchanged", () => {
    const original = scene();
    const reloaded = asStoredByPostgres(JSON.parse(JSON.stringify(original))) as CreativeSceneDocument;
    expect(JSON.stringify(reloaded)).not.toBe(JSON.stringify(original));
    expect(sceneFingerprint(reloaded)).toBe(sceneFingerprint(original));
  });

  it("ignores the save timestamp and fields left undefined", () => {
    const later = { ...scene(), savedAt: "2030-01-01T00:00:00.000Z" };
    later.edges = [{ ...later.edges[0], label: undefined }];
    expect(sceneFingerprint(later)).toBe(sceneFingerprint(scene()));
  });

  it("ignores the float noise a restored view picks up", () => {
    const restored = { ...scene(), viewport: { x: 505.0000001, y: 374.9999999, zoom: 0.7200000001 } };
    expect(sceneFingerprint(restored)).toBe(sceneFingerprint(scene()));
  });

  it("still sees a real edit and a real move", () => {
    const edited = scene();
    edited.nodes = [{ ...edited.nodes[0], body: "Made here. Shared here." }];
    const panned = { ...scene(), viewport: { x: 640, y: 375, zoom: 0.72 } };
    expect(sceneFingerprint(edited)).not.toBe(sceneFingerprint(scene()));
    expect(sceneFingerprint(panned)).not.toBe(sceneFingerprint(scene()));
  });
});
