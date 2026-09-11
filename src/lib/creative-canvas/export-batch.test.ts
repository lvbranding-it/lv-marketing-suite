import { describe, expect, it } from "vitest";
import { exportFileName, planExport, readingOrder, type ExportCandidate } from "./export-batch";

const art = (id: string, x: number, y: number, title = id): ExportCandidate =>
  ({ id, nodeType: "image", title, assetId: `asset-${id}`, x, y, height: 420 });

describe("readingOrder", () => {
  it("reads across a row before moving down", () => {
    // A 2x2 series, handed in deliberately as the wrong order.
    const order = readingOrder([
      { id: "d", x: 500, y: 500 }, { id: "b", x: 500, y: 0 },
      { id: "c", x: 0, y: 500 }, { id: "a", x: 0, y: 0 },
    ]);
    expect(order.map((item) => item.id)).toEqual(["a", "b", "c", "d"]);
    expect(order.map((item) => [item.row, item.column])).toEqual([[0, 0], [0, 1], [1, 0], [1, 1]]);
  });

  it("treats a slightly uneven row as one row", () => {
    // Dragged by hand, so nothing shares a top edge to the pixel.
    const order = readingOrder([{ id: "a", x: 0, y: 0 }, { id: "b", x: 500, y: 18 }, { id: "c", x: 1000, y: -9 }]);
    expect(order.every((item) => item.row === 0)).toBe(true);
    // Left to right, not by the few pixels of vertical drift between them.
    expect(order.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("does not let a staircase collapse into one endless row", () => {
    // Each card is 35px below the last: inside the band individually, but the
    // band is measured from the row's first card, so these are separate rows.
    const order = readingOrder([
      { id: "a", x: 0, y: 0 }, { id: "b", x: 0, y: 35 }, { id: "c", x: 0, y: 70 },
      { id: "d", x: 0, y: 105 }, { id: "e", x: 0, y: 140 },
    ]);
    expect(new Set(order.map((item) => item.row)).size).toBeGreaterThan(1);
    expect(order.map((item) => item.id)).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("bands a tall row by its own height rather than a fixed gap", () => {
    const order = readingOrder([{ id: "a", x: 0, y: 0, height: 900 }, { id: "b", x: 600, y: 300, height: 900 }]);
    expect(order.every((item) => item.row === 0)).toBe(true);
  });

  it("leaves the input untouched", () => {
    const input = [{ id: "b", x: 500, y: 0 }, { id: "a", x: 0, y: 0 }];
    readingOrder(input);
    expect(input.map((item) => item.id)).toEqual(["b", "a"]);
  });
});

describe("planExport", () => {
  it("exports several finished pieces as several files", () => {
    const plan = planExport([art("a", 0, 0), art("b", 500, 0), art("c", 0, 500)]);
    expect(plan.mode).toBe("batch");
    expect(plan.items.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("keeps a lone piece on the single path", () => {
    const plan = planExport([art("a", 0, 0)]);
    expect(plan.mode).toBe("single");
    expect(plan.items).toHaveLength(1);
  });

  it("composes when a frame is in the selection", () => {
    // The frame is how someone says "this arrangement is the artwork".
    const plan = planExport([art("a", 0, 0), art("b", 500, 0), { id: "f", nodeType: "export_frame", title: "Board", x: 0, y: 0 }]);
    expect(plan.mode).toBe("composite");
  });

  it("composes a mixed selection rather than splitting it up", () => {
    const plan = planExport([art("a", 0, 0), { id: "t", nodeType: "text", title: "Headline", x: 500, y: 0 }]);
    expect(plan.mode).toBe("composite");
  });

  it("composes artwork that has no stored asset yet", () => {
    // A generation still running has a card but nothing to deliver.
    const pending: ExportCandidate = { id: "p", nodeType: "generation", title: "Running", x: 0, y: 0 };
    expect(planExport([pending, art("a", 500, 0)]).mode).toBe("composite");
  });

  it("composes an empty selection", () => {
    expect(planExport([]).mode).toBe("composite");
  });
});

describe("exportFileName", () => {
  it("numbers from one and pads so a set sorts correctly", () => {
    expect(exportFileName(0, "Warm × Mug", "png")).toBe("01 Warm × Mug.png");
    expect(exportFileName(9, "Bold", "png")).toBe("10 Bold.png");
  });

  it("strips what a file system would reject", () => {
    expect(exportFileName(0, 'Spring/Summer: "Bold" <v2>', "png")).toBe("01 Spring Summer Bold v2.png");
  });

  it("never produces a nameless file", () => {
    expect(exportFileName(0, "   ", "png")).toBe("01 artwork.png");
    expect(exportFileName(1, "...", "png")).toBe("02 artwork.png");
  });

  it("does not let a trailing dot eat the extension", () => {
    expect(exportFileName(0, "Draft.", "png")).toBe("01 Draft.png");
  });

  it("keeps long titles to a sane length", () => {
    expect(exportFileName(0, "x".repeat(200), "png").length).toBeLessThanOrEqual(3 + 60 + 4);
  });
});

describe("planExport with sequence arrows", () => {
  const then = (source: string, target: string) => ({ source, target, kind: "sequence" as const });

  it("follows the running order instead of canvas position", () => {
    // Laid out on canvas as c, a, b — but wired as a carousel a → b → c.
    const plan = planExport(
      [art("c", 0, 0), art("a", 500, 0), art("b", 1000, 0)],
      [then("a", "b"), then("b", "c")],
    );
    expect(plan.mode).toBe("batch");
    expect(plan.ordering).toBe("sequence");
    expect(plan.items.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("numbers the files by the chain", () => {
    const plan = planExport([art("c", 0, 0, "Close"), art("a", 500, 0, "Hook")], [then("a", "c")]);
    expect(plan.items.map((item, index) => exportFileName(index, item.title, "png")))
      .toEqual(["01 Hook.png", "02 Close.png"]);
  });

  it("falls back to canvas position when the chain does not cover everything", () => {
    const plan = planExport([art("a", 0, 0), art("b", 500, 0), art("c", 1000, 0)], [then("a", "b")]);
    expect(plan.ordering).toBe("canvas");
    expect(plan.items.map((item) => item.id)).toEqual(["a", "b", "c"]);
  });

  it("ignores association arrows for ordering", () => {
    const plan = planExport([art("b", 0, 0), art("a", 500, 0)], [{ source: "a", target: "b" }]);
    expect(plan.ordering).toBe("canvas");
    expect(plan.items.map((item) => item.id)).toEqual(["b", "a"]);
  });
});
