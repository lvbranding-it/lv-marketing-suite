import { describe, expect, it } from "vitest";
import { estimateSeriesCost, planSeries, runSeries, type SeriesAxis } from "./series";

const axis = (id: string, label: string, assetId?: string): SeriesAxis =>
  ({ id, label, nodeType: "creative_direction", text: `${label} treatment`, assetId });

describe("planSeries", () => {
  it("expands two axes into every pairing", () => {
    const plan = planSeries("Instagram launch", [axis("a1", "Warm"), axis("a2", "Bold")], [axis("b1", "Mug"), axis("b2", "Tote")], "square", "s1");
    expect(plan.cells).toHaveLength(4);
    expect(plan.cells.map((cell) => cell.label)).toEqual([
      "Warm × Mug", "Warm × Tote", "Bold × Mug", "Bold × Tote",
    ]);
    // Every cell must land in its own grid slot or the results stack up.
    expect(new Set(plan.cells.map((cell) => `${cell.row}:${cell.column}`)).size).toBe(4);
  });

  it("degenerates to a plain list when only one axis is given", () => {
    const plan = planSeries("Six takes", [axis("a1", "One"), axis("a2", "Two"), axis("a3", "Three")], [], "portrait");
    expect(plan.cells).toHaveLength(3);
    expect(plan.cells.every((cell) => cell.b === undefined)).toBe(true);
  });

  it("carries the brief and both elements into every instruction", () => {
    const [cell] = planSeries("Spring launch", [axis("a1", "Warm")], [axis("b1", "Mug")]).cells;
    expect(cell.instruction).toContain("Spring launch");
    expect(cell.instruction).toContain("Warm");
    expect(cell.instruction).toContain("Mug");
  });

  it("puts the subject's own artwork ahead of the direction's and caps references", () => {
    const [cell] = planSeries("x", [axis("a1", "Warm", "asset-a")], [axis("b1", "Mug", "asset-b")]).cells;
    expect(cell.referenceAssetIds).toEqual(["asset-b", "asset-a"]);
    expect(cell.referenceAssetIds.length).toBeLessThanOrEqual(4);
  });

  it("prices a run before it is committed to", () => {
    expect(estimateSeriesCost(12)).toBe(0.48);
  });
});

describe("runSeries", () => {
  it("never exceeds the concurrency ceiling", async () => {
    const plan = planSeries("x", [axis("a1", "1"), axis("a2", "2"), axis("a3", "3"), axis("a4", "4")], []);
    let inFlight = 0;
    let peak = 0;
    await runSeries(plan.cells, async () => {
      peak = Math.max(peak, ++inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight -= 1;
      return "ok";
    }, { concurrency: 2, minSpacingMs: 0 });
    expect(peak).toBeLessThanOrEqual(2);
  });

  it("keeps the rest of the series when one cell fails", async () => {
    const plan = planSeries("x", [axis("a1", "1"), axis("a2", "2"), axis("a3", "3")], []);
    const results = await runSeries(plan.cells, async (_cell, index) => {
      if (index === 1) throw new Error("provider refused");
      return `image-${index}`;
    }, { concurrency: 2, minSpacingMs: 0 });
    expect(results).toHaveLength(3);
    expect(results.filter((entry) => entry.value)).toHaveLength(2);
    expect((results[1].error as Error).message).toBe("provider refused");
  });

  it("returns results in plan order regardless of completion order", async () => {
    const plan = planSeries("x", [axis("a1", "1"), axis("a2", "2"), axis("a3", "3")], []);
    const results = await runSeries(plan.cells, async (cell, index) => {
      await new Promise((resolve) => setTimeout(resolve, index === 0 ? 20 : 1));
      return cell.label;
    }, { concurrency: 3, minSpacingMs: 0 });
    expect(results.map((entry) => entry.value)).toEqual(["1", "2", "3"]);
  });
});
