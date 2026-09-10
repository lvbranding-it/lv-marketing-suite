import type { Edge, Node, Viewport } from "@xyflow/react";
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
  const edges: CreativeFlowEdge[] = scene.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    type: "smoothstep",
    data: { kind: edge.kind ?? "association" },
  }));
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
      label: typeof edge.label === "string" ? edge.label : undefined,
      kind: edge.data?.kind === "sequence" || edge.data?.kind === "reference" ? edge.data.kind : "association",
    })),
    viewport: { x: viewport.x, y: viewport.y, zoom: viewport.zoom },
    savedAt: new Date().toISOString(),
  };
}
