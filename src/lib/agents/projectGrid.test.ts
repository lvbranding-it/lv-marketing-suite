import { describe, expect, it } from "vitest";
import { fitGrid, matchesProject, pageNumbers } from "./projectGrid";

describe("fitGrid", () => {
  it("fits whole cards only, across and down", () => {
    // 4 cards of 260 with 3 gaps of 12 take 1076; 5 would take 1348.
    expect(fitGrid(1100, 620)).toEqual({ columns: 4, rows: 3, pageSize: 12 });
    expect(fitGrid(1348, 620).columns).toBe(5);
    expect(fitGrid(1347, 620).columns).toBe(4);
  });

  it("gives a single column a scrolling page of eight", () => {
    expect(fitGrid(343, 470)).toEqual({ columns: 1, rows: 8, pageSize: 8 });
    expect(fitGrid(343, 1600).rows).toBe(10);
  });

  it("always shows at least one row", () => {
    expect(fitGrid(560, 40)).toEqual({ columns: 2, rows: 1, pageSize: 2 });
  });
});

describe("pageNumbers", () => {
  it("lists every page when there are few", () => {
    expect(pageNumbers(2, 3)).toEqual([1, 2, 3]);
  });

  it("keeps the ends and the neighbours, with gaps between", () => {
    expect(pageNumbers(6, 12)).toEqual([1, "gap", 5, 6, 7, "gap", 12]);
    expect(pageNumbers(1, 12)).toEqual([1, 2, "gap", 12]);
    expect(pageNumbers(12, 12)).toEqual([1, "gap", 11, 12]);
  });

  it("shows a single skipped page instead of a gap", () => {
    expect(pageNumbers(3, 9)).toEqual([1, 2, 3, 4, "gap", 9]);
  });
});

describe("matchesProject", () => {
  const project = { name: "Sefardíes por Venezuela", client_name: "Edgar Benaim", description: "Community campaign" };

  it("matches every word across name, client and description, ignoring accents", () => {
    expect(matchesProject(project, "sefardies")).toBe(true);
    expect(matchesProject(project, "edgar campaign")).toBe(true);
    expect(matchesProject(project, "edgar website")).toBe(false);
    expect(matchesProject(project, "  ")).toBe(true);
  });
});
