import { describe, expect, it } from "vitest";
import { copyPath, fitLongEdge, photoFiles } from "./previews";

describe("fitLongEdge", () => {
  it("shrinks the longest side to the limit and keeps the shape", () => {
    expect(fitLongEdge({ width: 6000, height: 4000 }, 600)).toEqual({ width: 600, height: 400 });
    expect(fitLongEdge({ width: 4000, height: 6000 }, 1600)).toEqual({ width: 1067, height: 1600 });
  });

  it("never enlarges a small photo", () => {
    expect(fitLongEdge({ width: 500, height: 300 }, 1600)).toEqual({ width: 500, height: 300 });
  });
});

describe("copy paths", () => {
  it("keeps each copy beside its original", () => {
    expect(copyPath("org/session/uuid-DSC_0001.jpg", "thumb")).toBe("org/session/uuid-DSC_0001.jpg.thumb.jpg");
    expect(photoFiles("org/session/a.png")).toEqual(["org/session/a.png", "org/session/a.png.thumb.jpg", "org/session/a.png.preview.jpg"]);
  });
});
