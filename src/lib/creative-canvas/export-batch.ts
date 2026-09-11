import { sequencePath, type GraphEdge } from "./graph";
import type { CreativeNodeType } from "./types";

/**
 * What an export produces, decided from the selection alone.
 *
 * A series lands on the canvas as a grid of separate objects, and a grid is not
 * one deliverable — it is nine. So selecting several finished pieces exports
 * each one at full size rather than flattening them into a contact sheet.
 * Selecting anything else, or a presentation frame, still composes: the frame is
 * how someone says "this arrangement is the artwork".
 *
 * The decision lives here, away from the DOM, because the rule is the part worth
 * being sure about.
 */

const ARTWORK_NODE_TYPES: ReadonlySet<CreativeNodeType> = new Set(["image", "reference", "generation"]);
export const isArtworkNode = (type: CreativeNodeType) => ARTWORK_NODE_TYPES.has(type);

export interface ExportCandidate {
  id: string;
  nodeType: CreativeNodeType;
  title: string;
  /** Set when the object owns stored artwork, which is what makes it deliverable. */
  assetId?: string;
  x: number;
  y: number;
  height?: number;
}

export interface ExportItem extends ExportCandidate {
  assetId: string;
  /** Grid position as read on the canvas, so page order matches what was seen. */
  row: number;
  column: number;
}

/** How the files were put in order, so the result can say which rule applied. */
export type ExportOrdering = "sequence" | "canvas";

export type ExportPlan =
  | { mode: "single"; items: [ExportItem]; ordering: ExportOrdering }
  | { mode: "batch"; items: ExportItem[]; ordering: ExportOrdering }
  | { mode: "composite"; items: []; ordering: ExportOrdering };

/** Objects within this many pixels vertically are read as the same row. */
export const ROW_BAND_PX = 40;

/**
 * Orders objects the way a person reads the canvas: across a row, then down.
 *
 * A row is a band rather than an exact y, because objects of different heights
 * in the same series row do not share a top edge to the pixel. The band is
 * measured from the first object in it, so a staircase of slightly descending
 * cards resolves into distinct rows instead of one ever-widening one.
 */
export function readingOrder<T extends { x: number; y: number; height?: number }>(
  items: T[],
): Array<T & { row: number; column: number }> {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows: T[][] = [];
  let bandTop = 0;
  let tolerance = 0;

  for (const item of sorted) {
    if (!rows.length || item.y - bandTop > tolerance) {
      rows.push([item]);
      bandTop = item.y;
      tolerance = Math.max(ROW_BAND_PX, (item.height ?? 0) / 2);
    } else {
      rows[rows.length - 1].push(item);
    }
  }

  return rows.flatMap((row, rowIndex) =>
    [...row]
      .sort((a, b) => a.x - b.x)
      .map((item, column) => ({ ...item, row: rowIndex, column })),
  );
}

/**
 * Decides between one deliverable, many, and a composition.
 *
 * Mixed selections compose. Someone who selected artwork together with its
 * headline and its rationale is looking at a layout, and handing them three
 * unrelated files instead would be answering a question they did not ask.
 *
 * Sequence arrows decide the order when they cover the whole selection, because
 * a carousel's running order is the point of it and canvas position may say
 * something different. Anything less than one unbroken chain falls back to
 * reading order rather than guessing.
 */
export function planExport(candidates: ExportCandidate[], edges: GraphEdge[] = []): ExportPlan {
  // A frame is an explicit instruction to compose, whatever else is selected.
  if (candidates.some((candidate) => candidate.nodeType === "export_frame")) return { mode: "composite", items: [], ordering: "canvas" };

  const artwork = candidates.filter((candidate) => isArtworkNode(candidate.nodeType) && candidate.assetId);
  if (!artwork.length || artwork.length !== candidates.length) return { mode: "composite", items: [], ordering: "canvas" };

  const chain = sequencePath(edges, artwork.map((candidate) => candidate.id));
  const items = (chain
    ? chain.map((id, index) => ({ ...artwork.find((candidate) => candidate.id === id)!, row: index, column: 0 }))
    : readingOrder(artwork)) as ExportItem[];

  if (items.length === 1) return { mode: "single", items: [items[0]], ordering: "canvas" };
  return { mode: "batch", items, ordering: chain ? "sequence" : "canvas" };
}

/**
 * A file name that survives a file system and sorts in the intended order.
 *
 * The number prefix is what keeps a set in sequence once it is unzipped, and it
 * also makes collisions impossible when two posts happen to share a title.
 */
export function exportFileName(index: number, title: string, extension: string) {
  const safe = (title || "")
    // Path separators, Windows-reserved characters and control codes.
    // eslint-disable-next-line no-control-regex
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60)
    // A trailing dot is dropped by Windows and would eat the extension.
    .replace(/[\s.]+$/, "");
  return `${String(index + 1).padStart(2, "0")} ${safe || "artwork"}.${extension}`;
}
