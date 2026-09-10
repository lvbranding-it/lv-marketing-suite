import { describe, expect, it } from "vitest";
import { flowToScene, sceneToFlow } from "./react-flow-adapter";
import { serializeScene } from "./scene";

describe("React Flow scene adapter", () => {
  it("hydrates runtime asset URLs without persisting them", () => {
    const scene = serializeScene({ schemaVersion: 1, viewport: { x: 12, y: 18, zoom: .8 }, edges: [], nodes: [{ id: "image-1", type: "image", position: { x: 20, y: 30 }, size: { width: 400, height: 300 }, title: "Reference", body: "Lighting", accent: "#CB2039", assetId: "asset-1", includeInContext: true, status: "draft" }] });
    const flow = sceneToFlow(scene, new Map([["asset-1", "https://signed.example/image"]]));
    expect(flow.nodes[0].data.assetUrl).toContain("signed.example");
    const restored = flowToScene(flow.nodes, flow.edges, flow.viewport);
    expect(restored.nodes[0].assetId).toBe("asset-1");
    expect(JSON.stringify(restored)).not.toContain("signed.example");
  });

  it("round-trips grouping and semantic edge data", () => {
    const scene = serializeScene({ schemaVersion: 1, viewport: { x: 0, y: 0, zoom: 1 }, nodes: [
      { id: "frame", type: "export_frame", position: { x: 0, y: 0 }, size: { width: 800, height: 600 }, title: "Frame", body: "", accent: "#CB2039", includeInContext: true, status: "draft" },
      { id: "copy", type: "text", parentId: "frame", position: { x: 40, y: 60 }, size: { width: 300, height: 200 }, title: "Copy", body: "Hello", accent: "#CB2039", includeInContext: true, status: "approved_final" },
    ], edges: [{ id: "edge-1", source: "frame", target: "copy", kind: "reference", label: "contains" }] });
    const flow = sceneToFlow(scene);
    const roundTrip = flowToScene(flow.nodes, flow.edges, flow.viewport);
    expect(roundTrip.nodes[1].parentId).toBe("frame");
    expect(roundTrip.edges[0]).toMatchObject({ kind: "reference", label: "contains" });
  });
});
