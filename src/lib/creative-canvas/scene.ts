import { CREATIVE_NODE_TYPES, type CreativeNodeType } from "./types";

export interface CanvasPoint { x: number; y: number }
export interface CanvasSize { width: number; height: number }
export interface CanvasViewport extends CanvasPoint { zoom: number }

/**
 * The persisted LV scene contract. It deliberately contains no React Flow
 * types or renderer-only data (for example signed asset URLs).
 */
export interface CreativeSceneNode {
  id: string;
  type: CreativeNodeType;
  position: CanvasPoint;
  size: CanvasSize;
  title: string;
  body: string;
  accent: string;
  assetId?: string;
  includeInContext: boolean;
  status: string;
  parentId?: string;
  zIndex?: number;
  metadata?: Record<string, unknown>;
}

export interface CreativeSceneEdge {
  id: string;
  source: string;
  target: string;
  kind?: "association" | "sequence" | "reference";
  label?: string;
}

export interface CreativeSceneDocument {
  schemaVersion: 1;
  nodes: CreativeSceneNode[];
  edges: CreativeSceneEdge[];
  viewport: CanvasViewport;
  savedAt: string;
}

export function createEmptyScene(): CreativeSceneDocument {
  return { schemaVersion: 1, nodes: [], edges: [], viewport: { x: 0, y: 0, zoom: 1 }, savedAt: new Date(0).toISOString() };
}

export function serializeScene(scene: Omit<CreativeSceneDocument, "savedAt"> | CreativeSceneDocument): CreativeSceneDocument {
  return { ...scene, schemaVersion: 1, savedAt: new Date().toISOString() };
}

export function restoreScene(value: unknown): CreativeSceneDocument | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const scene = value as Partial<CreativeSceneDocument>;
  if (scene.schemaVersion !== 1 || !Array.isArray(scene.nodes) || !Array.isArray(scene.edges)) return null;
  if (!scene.viewport || typeof scene.viewport.x !== "number" || typeof scene.viewport.y !== "number" || typeof scene.viewport.zoom !== "number") return null;
  const validNodes = scene.nodes.every((node) => node && typeof node.id === "string" && CREATIVE_NODE_TYPES.includes(node.type));
  if (!validNodes) return null;
  return {
    schemaVersion: 1,
    nodes: scene.nodes,
    edges: scene.edges,
    viewport: scene.viewport,
    savedAt: typeof scene.savedAt === "string" ? scene.savedAt : new Date(0).toISOString(),
  };
}

export function generationTransitionAllowed(from: string, to: string) {
  const transitions: Record<string, string[]> = {
    draft: ["queued", "cancelled"], queued: ["processing", "cancelled", "failed"],
    processing: ["completed", "failed", "cancelled"], completed: [], failed: ["queued"], cancelled: ["queued"],
  };
  return transitions[from]?.includes(to) ?? false;
}

export function makeIdempotencyKey(canvasId: string, operation: string) {
  return `${canvasId}:${operation}:${crypto.randomUUID()}`;
}
