/**
 * Laying out the Agents landing: project cards in pages that fit the screen.
 *
 * The landing used to list six recent projects in a narrow column, leaving a
 * wide screen mostly empty and sending everything else to the sidebar's
 * switcher. Now every project is a card, and a page holds as many whole rows
 * as the space allows, so nothing is cut off at the bottom.
 */

export interface GridFit {
  columns: number;
  rows: number;
  pageSize: number;
}

/**
 * How many cards of a fixed height, at least `minCardWidth` wide, fit in the space.
 *
 * A single column, as on a phone, scrolls instead: a page of what fits there
 * was three cards, and paging through three at a time is slower than scrolling.
 */
export function fitGrid(
  width: number,
  height: number,
  {
    minCardWidth = 260,
    cardHeight = 148,
    gap = 12,
    singleColumnRows = 8,
  }: { minCardWidth?: number; cardHeight?: number; gap?: number; singleColumnRows?: number } = {},
): GridFit {
  const columns = Math.max(1, Math.floor((width + gap) / (minCardWidth + gap)));
  const fittingRows = Math.max(1, Math.floor((height + gap) / (cardHeight + gap)));
  const rows = columns === 1 ? Math.max(fittingRows, singleColumnRows) : fittingRows;
  return { columns, rows, pageSize: columns * rows };
}

/**
 * The page buttons to show: always the first and last, the current page and
 * its neighbours, and a gap wherever pages are skipped.
 */
export function pageNumbers(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const shown = new Set([1, total, current - 1, current, current + 1].filter((page) => page >= 1 && page <= total));
  const pages = [...shown].sort((a, b) => a - b);
  const result: (number | "gap")[] = [];
  pages.forEach((page, i) => {
    if (i > 0 && page - pages[i - 1] > 1) result.push(page - pages[i - 1] === 2 ? page - 1 : "gap");
    result.push(page);
  });
  return result;
}

const fold = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** Whether every word of the search appears in the project's name, client or description. */
export function matchesProject(
  project: { name: string; client_name?: string | null; description?: string | null },
  query: string,
): boolean {
  const words = fold(query).split(/\s+/).filter(Boolean);
  if (!words.length) return true;
  const text = fold([project.name, project.client_name, project.description].filter(Boolean).join(" "));
  return words.every((word) => text.includes(word));
}
