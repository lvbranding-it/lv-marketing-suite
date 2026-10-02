import { describe, expect, it } from "vitest";
import { fitWidth, instagramRatioProblem, jpegFileName, needsInstagramCopy } from "./socialMedia";

describe("instagramRatioProblem", () => {
  it("accepts 4:5 portrait through 1.91:1 landscape", () => {
    expect(instagramRatioProblem({ width: 1080, height: 1350 }, "a.jpg")).toBeNull();
    expect(instagramRatioProblem({ width: 1080, height: 1080 }, "a.jpg")).toBeNull();
    expect(instagramRatioProblem({ width: 1910, height: 1000 }, "a.jpg")).toBeNull();
  });

  it("names a story-shaped image as too tall and a banner as too wide", () => {
    expect(instagramRatioProblem({ width: 1080, height: 1920 }, "story.png")).toBe(
      "story.png is too tall for an Instagram feed post (1080×1920). Crop it to 4:5 or wider.",
    );
    expect(instagramRatioProblem({ width: 3000, height: 1000 }, "banner.jpg")).toMatch(/^banner\.jpg is too wide/);
  });
});

describe("needsInstagramCopy", () => {
  it("copies other formats, oversized files and images over 1440 pixels wide", () => {
    expect(needsInstagramCopy({ type: "image/png", size: 1000 })).toBe(true);
    expect(needsInstagramCopy({ type: "image/webp", size: 1000 })).toBe(true);
    expect(needsInstagramCopy({ type: "image/jpeg", size: 9 * 1024 * 1024 })).toBe(true);
    expect(needsInstagramCopy({ type: "image/jpeg", size: 1000 }, { width: 4000, height: 3000 })).toBe(true);
    expect(needsInstagramCopy({ type: "image/jpeg", size: 1000 }, { width: 1080, height: 1350 })).toBe(false);
  });

  it("leaves video alone", () => {
    expect(needsInstagramCopy({ type: "video/mp4", size: 50 * 1024 * 1024 })).toBe(false);
  });
});

describe("fitWidth and jpegFileName", () => {
  it("scales down to the width limit and keeps the shape", () => {
    expect(fitWidth({ width: 4000, height: 5000 }, 1440)).toEqual({ width: 1440, height: 1800 });
    expect(fitWidth({ width: 1080, height: 1080 }, 1440)).toEqual({ width: 1080, height: 1080 });
  });

  it("swaps the extension for .jpg", () => {
    expect(jpegFileName("Launch Post.final.png")).toBe("Launch Post.final.jpg");
    expect(jpegFileName("photo")).toBe("photo.jpg");
  });
});
