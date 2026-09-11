import { MarkerType, type Edge, type Node, type Viewport } from "@xyflow/react";
import type { CreativeEdgeKind } from "./graph";
import type { CreativeNodeType } from "./types";
import type { CreativeSceneDocument, CreativeSceneEdge } from "./scene";

export interface CreativeNodeData extends Record<string, unknown> {
  nodeType: CreativeNodeType;
  title: string;
  body: string;
  accent: string;
  assetId: string;
  assetUrl: string;
  includeInContext: boolean;
  status: string;
}

export type CreativeFlowNode = Node<CreativeNodeData, CreativeNodeType>;
export type CreativeFlowEdge = Edge<Record<string, unknown>>;


/**
 * How each kind of arrow reads on the canvas.
 *
 * An informing arrow is quiet and structural; a running order is drawn in brand
 * red and dashed, because "this comes before that" is a different claim and
 * should not be mistaken for direction at a glance. The `then` label is derived
 * from the kind rather than stored, so it never becomes a label someone has to
 * maintain.
 */
export const SEQUENCE_EDGE_LABEL = "then";

export function edgeAppearance(kind: CreativeEdgeKind = "association"): Partial<CreativeFlowEdge> {
  if (kind === "sequence") {
    return {
      label: SEQUENCE_EDGE_LABEL,
      style: { stroke: "#CB2039", strokeWidth: 2, strokeDasharray: "6 4" },
      labelStyle: { fill: "#ffffff", fontSize: 10, fontWeight: 600, letterSpacing: ".06em", textTransform: "uppercase" },
      labelBgStyle: { fill: "#CB2039" },
      labelBgPadding: [6, 3] as [number, number],
      labelBgBorderRadius: 4,
      markerEnd: { type: MarkerType.ArrowClosed, width: 16, height: 16, color: "#CB2039" },
    };
  }
  return {
    label: undefined,
    style: { stroke: "rgba(255,255,255,.38)", strokeWidth: 1.6, strokeDasharray: undefined },
    labelStyle: undefined,
    labelBgStyle: undefined,
    markerEnd: { type: MarkerType.ArrowClosed, width: 15, height: 15, color: "rgba(255,255,255,.45)" },
  };
}

/** The kind an edge is carrying, tolerant of scenes saved before kinds existed. */
export const edgeKindOf = (edge: Pick<CreativeFlowEdge, "data">): CreativeEdgeKind =>
  edge.data?.kind === "sequence" || edge.data?.kind === "reference" ? edge.data.kind : "association";

export function sceneToFlow(scene: CreativeSceneDocument, assetUrls: ReadonlyMap<string, string> = new Map()) {
  const nodes: CreativeFlowNode[] = scene.nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: node.position,
    parentId: node.parentId,
    extent: node.parentId ? "parent" : undefined,
    zIndex: node.zIndex,
    style: { width: node.size.width, height: node.size.height },
    data: {
      nodeType: node.type,
      title: node.title,
      body: node.body,
      accent: node.accent,
      assetId: node.assetId ?? "",
      assetUrl: node.assetId ? assetUrls.get(node.assetId) ?? "" : "",
      includeInContext: node.includeInContext,
      status: node.status,
    },
  }));
  const edges: CreativeFlowEdge[] = scene.edges.map((edge) => {
    const kind = edge.kind ?? "association";
    return {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      type: "smoothstep",
      data: { kind },
      ...edgeAppearance(kind),
      // A label someone typed wins over the derived one.
      ...(edge.label ? { label: edge.label } : {}),
    };
  });
  return { nodes, edges, viewport: scene.viewport as Viewport };
}

export function flowToScene(nodes: CreativeFlowNode[], edges: CreativeFlowEdge[], viewport: Viewport): CreativeSceneDocument {
  return {
    schemaVersion: 1,
    nodes: nodes.map((node) => ({
      id: node.id,
      type: node.data.nodeType,
      position: { x: node.position.x, y: node.position.y },
      size: {
        width: Number(node.width ?? node.measured?.width ?? node.style?.width ?? 320),
        height: Number(node.height ?? node.measured?.height ?? node.style?.height ?? 220),
      },
      title: node.data.title,
      body: node.data.body,
      accent: node.data.accent,
      assetId: node.data.assetId || undefined,
      includeInContext: node.data.includeInContext,
      status: node.data.status,
      parentId: node.parentId,
      zIndex: node.zIndex,
    })),
    edges: edges.map((edge): CreativeSceneEdge => ({
      id: edge.id,
      source: edge.source,
      target: edge.target,
      // The kind's own label is decoration recomputed on load, not content.
      label: typeof edge.label === "string" && edge.label !== SEQUENCE_EDGE_LABEL ? edge.label : undefined,
      kind: edgeKindOf(edge),
    })),
    viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
    savedAt: new Date().toISOString(),
  };
}
