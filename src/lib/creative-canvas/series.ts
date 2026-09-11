import type { CreativeAspect, CreativeNodeType } from "./types";

/**
 * A series is generated one cell at a time against the ordinary generation
 * endpoint, from the browser.
 *
 * That is deliberate rather than a shortcut. Each cell keeps its own
 * idempotency key, its own `ai_generations` row, its own ledger entry and its
 * own retry, so a series inherits every guarantee a single generation already
 * has — budget, rate limiting, lineage, failure records. Batching it on the
 * server would mean one request holding a dozen provider calls inside a single
 * Edge Function invocation, which the platform's execution limit would cut off
 * halfway through, leaving paid work with nothing to show for it.
 */

/** One axis of the matrix: the elements that vary along it. */
export interface SeriesAxis {
  id: string;
  label: string;
  nodeType: CreativeNodeType;
  /** Text handed to the model for this element. */
  text: string;
  /** Set when the element is a picture, so it travels as a reference. */
  assetId?: string;
}

export interface SeriesCell {
  key: string;
  label: string;
  /** Ordered so a caller can lay the results out as a grid. */
  row: number;
  column: number;
  a: SeriesAxis;
  b?: SeriesAxis;
  instruction: string;
  referenceAssetIds: string[];
}

export interface SeriesPlan {
  id: string;
  cells: SeriesCell[];
  rows: number;
  columns: number;
  aspect: CreativeAspect;
}

/** Estimated spend, shown before a run rather than discovered afterwards. */
export const IMAGE_UNIT_COST_USD = 0.04;
export const estimateSeriesCost = (cells: number) => Number((cells * IMAGE_UNIT_COST_USD).toFixed(2));

/**
 * Expands two axes into every pairing.
 *
 * With one axis it degenerates to a plain list, which is what "six takes on one
 * idea" is — the same mechanism, one dimension.
 */
export function planSeries(
  brief: string,
  columnAxis: SeriesAxis[],
  rowAxis: SeriesAxis[],
  aspect: CreativeAspect = "square",
  seriesId: string = crypto.randomUUID(),
): SeriesPlan {
  const columns = columnAxis.length ? columnAxis : [];
  const rows = rowAxis.length ? rowAxis : [];
  const cells: SeriesCell[] = [];

  const compose = (a: SeriesAxis, b?: SeriesAxis) => {
    const parts = [brief.trim()];
    parts.push(`Creative direction — ${a.label}: ${a.text}`.trim());
    if (b) parts.push(`Subject — ${b.label}: ${b.text}`.trim());
    parts.push("Produce one finished, on-brand social image. No watermarks, no placeholder text.");
    return parts.filter(Boolean).join("\n\n");
  };

  columns.forEach((a, column) => {
    if (!rows.length) {
      cells.push({
        key: `${seriesId}:${column}:0`,
        label: a.label,
        row: 0,
        column,
        a,
        instruction: compose(a),
        referenceAssetIds: a.assetId ? [a.assetId] : [],
      });
      return;
    }
    rows.forEach((b, row) => {
      cells.push({
        key: `${seriesId}:${column}:${row}`,
        label: `${a.label} × ${b.label}`,
        row,
        column,
        a,
        b,
        instruction: compose(a, b),
        // At most four references travel with a request, and the subject's own
        // artwork matters more than the direction's mood board.
        referenceAssetIds: [b.assetId, a.assetId].filter((id): id is string => Boolean(id)).slice(0, 4),
      });
    });
  });

  return { id: seriesId, cells, rows: Math.max(rows.length, 1), columns: Math.max(columns.length, 1), aspect };
}

/**
 * Runs the plan with a ceiling on how many are in flight at once.
 *
 * The gateway allows two concurrent generations per person and ten a minute, so
 * a wide matrix is paced rather than fired all at once — otherwise the later
 * cells come back rate-limited and look like failures.
 */
export interface PacedOptions { concurrency?: number; minSpacingMs?: number; signal?: AbortSignal }

/**
 * Runs a list of paid calls a few at a time, spaced out.
 *
 * The gateway allows two concurrent generations per person and ten a minute, so
 * a wide run is paced rather than fired all at once — otherwise the later ones
 * come back rate-limited and look like failures. A failure is captured per item
 * rather than thrown, because the others are already paid for.
 */
export async function runPaced<T, R>(
  items: T[],
  run: (item: T, index: number) => Promise<R>,
  options: PacedOptions = {},
): Promise<Array<{ item: T; value?: R; error?: unknown }>> {
  const concurrency = Math.max(1, options.concurrency ?? 2);
  const spacing = options.minSpacingMs ?? 6_500;
  const results: Array<{ item: T; value?: R; error?: unknown }> = [];
  let next = 0;
  let lastStart = 0;

  const worker = async () => {
    for (;;) {
      if (options.signal?.aborted) return;
      const index = next++;
      if (index >= items.length) return;
      const wait = lastStart + spacing - Date.now();
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
      lastStart = Date.now();
      try {
        results[index] = { item: items[index], value: await run(items[index], index) };
      } catch (error) {
        results[index] = { item: items[index], error };
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

export async function runSeries<T>(
  cells: SeriesCell[],
  run: (cell: SeriesCell, index: number) => Promise<T>,
  options: PacedOptions = {},
): Promise<Array<{ cell: SeriesCell; value?: T; error?: unknown }>> {
  const results = await runPaced(cells, run, options);
  return results.map((entry) => ({ cell: entry.item, value: entry.value, error: entry.error }));
}
