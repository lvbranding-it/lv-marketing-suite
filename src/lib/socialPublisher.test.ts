import { describe, expect, it } from "vitest";
import { validateSocialDraft, zonedDateTimeToUtc } from "./socialPublisher";

describe("social publisher validation", () => {
  it("requires a destination and channel content", () => {
    const errors = validateSocialDraft({ title: "", accountIds: [], captions: {}, formats: {}, files: [] });
    expect(errors).toContain("Add an internal title.");
    expect(errors).toContain("Select at least one destination.");
  });

  it("validates carousel media count", () => {
    const file = new File(["x"], "one.jpg", { type: "image/jpeg" });
    const errors = validateSocialDraft({
      title: "Launch", accountIds: ["ig"], captions: { instagram: "Caption" },
      formats: { instagram: "carousel" }, files: [file],
    });
    expect(errors).toContain("Instagram carousels require 2–10 media files.");
  });

  it("takes PNG images and MOV video for Instagram, which used to be refused", () => {
    const png = new File(["x"], "post.png", { type: "image/png" });
    const mov = new File(["x"], "reel.mov", { type: "video/quicktime" });
    expect(validateSocialDraft({
      title: "Launch", accountIds: ["ig"], captions: { instagram: "Caption" },
      formats: { instagram: "image" }, files: [png], sizes: [{ width: 1080, height: 1350 }],
    })).toEqual([]);
    expect(validateSocialDraft({
      title: "Launch", accountIds: ["ig"], captions: { instagram: "Caption" },
      formats: { instagram: "reel" }, files: [mov],
    })).toEqual([]);
  });

  it("refuses a feed image Instagram cannot take without cropping", () => {
    const story = new File(["x"], "story.jpg", { type: "image/jpeg" });
    const errors = validateSocialDraft({
      title: "Launch", accountIds: ["ig", "fb"], captions: { instagram: "Caption", facebook: "Caption" },
      formats: { instagram: "image", facebook: "image" }, files: [story], sizes: [{ width: 1080, height: 1920 }],
    });
    expect(errors).toEqual(["story.jpg is too tall for an Instagram feed post (1080×1920). Crop it to 4:5 or wider."]);
  });
});

describe("workspace timezone conversion", () => {
  it("converts Chicago daylight time to UTC", () => {
    expect(zonedDateTimeToUtc("2026-09-22T10:30", "America/Chicago")).toBe("2026-09-22T15:30:00.000Z");
  });

  it("converts Chicago standard time to UTC", () => {
    expect(zonedDateTimeToUtc("2026-12-22T10:30", "America/Chicago")).toBe("2026-12-22T16:30:00.000Z");
  });
});
