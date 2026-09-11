import { describe, expect, it } from "vitest";
import { edgeKindOf, flowToScene, sceneToFlow, SEQUENCE_EDGE_LABEL } from "./react-flow-adapter";
import { collectInheritedContext } from "./graph";
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

describe("arrow kinds through the adapter", () => {
  const sceneWith = (kind?: "association" | "sequence") => serializeScene({
    schemaVersion: 1, viewport: { x: 0, y: 0, zoom: 1 }, nodes: [],
    edges: [{ id: "edge-1", source: "a", target: "b", ...(kind ? { kind } : {}) }],
  });

  it("keeps the kind across a round trip", () => {
    const flow = sceneToFlow(sceneWith("sequence"));
    expect(flow.edges[0].data?.kind).toBe("sequence");
    expect(flowToScene([], flow.edges, flow.viewport).edges[0].kind).toBe("sequence");
  });

  it("reads an edge saved before kinds existed as informing", () => {
    expect(sceneToFlow(sceneWith()).edges[0].data?.kind).toBe("association");
  });

  it("draws a running order differently from a direction", () => {
    const sequence = sceneToFlow(sceneWith("sequence")).edges[0];
    const association = sceneToFlow(sceneWith("association")).edges[0];
    expect(sequence.label).toBe(SEQUENCE_EDGE_LABEL);
    expect(sequence.style?.strokeDasharray).toBeTruthy();
    expect(association.label).toBeUndefined();
    expect(association.style?.strokeDasharray).toBeUndefined();
  });

  it("does not persist the derived label as content", () => {
    const flow = sceneToFlow(sceneWith("sequence"));
    expect(flowToScene([], flow.edges, flow.viewport).edges[0].label).toBeUndefined();
  });

  it("keeps a label someone actually typed", () => {
    const scene = serializeScene({
      schemaVersion: 1, viewport: { x: 0, y: 0, zoom: 1 }, nodes: [],
      edges: [{ id: "edge-1", source: "a", target: "b", kind: "sequence", label: "after approval" }],
    });
    const flow = sceneToFlow(scene);
    expect(flow.edges[0].label).toBe("after approval");
    expect(flowToScene([], flow.edges, flow.viewport).edges[0].label).toBe("after approval");
  });

  it("hands the graph helpers a kind they can actually read", () => {
    // A flow edge keeps its kind under `data`, so passing one straight to the
    // graph helpers reads `undefined` and silently treats a running order as
    // direction. `edgeKindOf` is the conversion that must be used.
    const flow = sceneToFlow(sceneWith("sequence"));
    expect((flow.edges[0] as { kind?: string }).kind).toBeUndefined();
    expect(edgeKindOf(flow.edges[0])).toBe("sequence");

    const flat = flow.edges.map((edge) => ({ source: edge.source, target: edge.target, kind: edgeKindOf(edge) }));
    expect(collectInheritedContext(flat, ["b"])).toEqual([]);
    // Whereas handing the flow edge over unconverted is the bug this guards.
    expect(collectInheritedContext(flow.edges, ["b"])).toHaveLength(1);
  });
});
