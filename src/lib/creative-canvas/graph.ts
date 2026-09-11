/**
 * What a connection on the canvas means.
 *
 * There are two kinds of arrow, and they say different things.
 *
 * An `association` arrow runs from the object that informs to the object being
 * informed: `direction → product` reads as "this direction applies to this
 * product". Selecting the product and generating pulls the direction in with it,
 * without having to select both every time.
 *
 * A `sequence` arrow says "this comes before that" — slide 1 to slide 2 of a
 * carousel, or the beats of a campaign. It carries order, not direction, and is
 * deliberately excluded from the context walk: a first slide does not govern how
 * the second one is made, and treating it as direction would quietly turn every
 * carousel into a series of near-copies.
 */

export type CreativeEdgeKind = "association" | "sequence" | "reference";

export interface GraphEdge {
  source: string;
  target: string;
  /** Missing means `association`: the meaning every edge had before kinds existed. */
  kind?: CreativeEdgeKind;
}

export interface InheritedContext {
  id: string;
  /** Hops from the selected object. 1 is a direct connection. */
  depth: number;
  /** The downstream object this flowed into, for explaining the chain. */
  into: string;
}

/** Far enough for direction → concept → asset, short enough to stay predictable. */
export const MAX_INHERIT_DEPTH = 3;
/** A ceiling so one busy corner of a canvas cannot flood the request. */
export const MAX_INHERITED_NODES = 12;

/** Only this kind of arrow carries direction. */
const carriesDirection = (edge: GraphEdge) => (edge.kind ?? "association") !== "sequence";
const isSequence = (edge: GraphEdge) => edge.kind === "sequence";

/**
 * Walks upstream from the selected objects and returns what they inherit.
 *
 * Selected objects are never returned — the caller already has those. An object
 * excluded from AI context stops the walk at that point rather than being
 * skipped over, which makes the checkbox a way to mute a whole branch instead of
 * a single card. Cycles are safe: each object is visited once, at the shallowest
 * depth it is reachable by. Sequence arrows are not followed at all.
 */
export function collectInheritedContext(
  edges: GraphEdge[],
  selectedIds: string[],
  options: { isExcluded?: (id: string) => boolean; maxDepth?: number; maxNodes?: number } = {},
): InheritedContext[] {
  const maxDepth = options.maxDepth ?? MAX_INHERIT_DEPTH;
  const maxNodes = options.maxNodes ?? MAX_INHERITED_NODES;
  const isExcluded = options.isExcluded ?? (() => false);

  const incoming = new Map<string, string[]>();
  for (const edge of edges) {
    if (!edge?.source || !edge?.target || edge.source === edge.target) continue;
    if (!carriesDirection(edge)) continue;
    const list = incoming.get(edge.target);
    if (list) list.push(edge.source); else incoming.set(edge.target, [edge.source]);
  }

  const selected = new Set(selectedIds);
  const seen = new Set(selectedIds);
  const found: InheritedContext[] = [];
  let frontier = selectedIds.map((id) => ({ id, depth: 0 }));

  while (frontier.length && found.length < maxNodes) {
    const next: Array<{ id: string; depth: number }> = [];
    for (const node of frontier) {
      if (node.depth >= maxDepth) continue;
      for (const source of incoming.get(node.id) ?? []) {
        if (seen.has(source)) continue;
        seen.add(source);
        // A muted object contributes nothing and closes the path behind it.
        if (isExcluded(source)) continue;
        if (!selected.has(source)) {
          found.push({ id: source, depth: node.depth + 1, into: node.id });
          if (found.length >= maxNodes) break;
        }
        next.push({ id: source, depth: node.depth + 1 });
      }
      if (found.length >= maxNodes) break;
    }
    frontier = next;
  }

  return found;
}

/** Sequence links as predecessor/successor maps, ignoring anything malformed. */
function sequenceLinks(edges: GraphEdge[]) {
  const before = new Map<string, string>();
  const after = new Map<string, string>();
  const forked = new Set<string>();
  for (const edge of edges) {
    if (!edge?.source || !edge?.target || edge.source === edge.target || !isSequence(edge)) continue;
    // A step with two predecessors or two successors is not a running order, so
    // the whole node is marked ambiguous rather than one link silently winning.
    if (after.has(edge.source)) forked.add(edge.source);
    if (before.has(edge.target)) forked.add(edge.target);
    after.set(edge.source, edge.target);
    before.set(edge.target, edge.source);
  }
  return { before, after, forked };
}

/**
 * Reads a running order out of the sequence arrows over exactly these objects.
 *
 * Returns null unless they form one unbroken chain covering every one of them —
 * a fork, a gap or a loop means there is no single order to read, and guessing
 * one would put a carousel out of sequence without saying so. The caller falls
 * back to canvas position in that case.
 */
export function sequencePath(edges: GraphEdge[], ids: string[]): string[] | null {
  if (ids.length < 2) return null;
  const wanted = new Set(ids);
  if (wanted.size !== ids.length) return null;
  const scoped = edges.filter((edge) => edge && wanted.has(edge.source) && wanted.has(edge.target));
  const { before, after, forked } = sequenceLinks(scoped);
  if (forked.size) return null;

  const heads = ids.filter((id) => !before.has(id));
  if (heads.length !== 1) return null;

  const order: string[] = [];
  const seen = new Set<string>();
  let current: string | undefined = heads[0];
  while (current && !seen.has(current)) {
    seen.add(current);
    order.push(current);
    current = after.get(current);
  }
  return order.length === ids.length ? order : null;
}

/**
 * Where one object sits in its chain, for telling the model what comes before it.
 *
 * Walks back to the head and then forward to the tail. A fork or a loop anywhere
 * in the chain means there is no dependable position, so nothing is reported.
 */
export function sequencePosition(
  edges: GraphEdge[],
  id: string,
): { step: number; total: number; previousId?: string } | null {
  const { before, after, forked } = sequenceLinks(edges);
  if (!before.has(id) && !after.has(id)) return null;
  if (forked.has(id)) return null;

  const back = new Set<string>([id]);
  let head = id;
  for (;;) {
    const previous = before.get(head);
    if (!previous) break;
    // Arriving somewhere already walked means the chain closes on itself, and a
    // loop has no first step to count from.
    if (back.has(previous) || forked.has(previous)) return null;
    back.add(previous);
    head = previous;
  }

  const chain: string[] = [];
  const seen = new Set<string>();
  for (let current: string | undefined = head; current && !seen.has(current); current = after.get(current)) {
    if (forked.has(current)) return null;
    seen.add(current);
    chain.push(current);
  }

  const step = chain.indexOf(id);
  if (step < 0) return null;
  return { step: step + 1, total: chain.length, previousId: step > 0 ? chain[step - 1] : undefined };
}
