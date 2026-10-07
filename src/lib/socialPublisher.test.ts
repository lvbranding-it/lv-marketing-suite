import { describe, expect, it } from "vitest";
import { canEditPost, formatsForMedia, postLink, minutesUntil, utcToZonedLocal, validateSocialDraft, zonedDateTimeToUtc } from "./socialPublisher";

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

describe("media and format", () => {
  const video = new File(["x"], "burger.mov", { type: "video/quicktime" });
  const image = new File(["x"], "a.jpg", { type: "image/jpeg" });

  it("picks Video and Reel for one video, Carousel for several files, and leaves text posts alone", () => {
    expect(formatsForMedia([video], { facebook: "image", instagram: "image" })).toEqual({ facebook: "video", instagram: "reel" });
    expect(formatsForMedia([image], { facebook: "video", instagram: "reel" })).toEqual({ facebook: "image", instagram: "image" });
    expect(formatsForMedia([image, image], { facebook: "image", instagram: "image" })).toEqual({ facebook: "image", instagram: "carousel" });
    expect(formatsForMedia([video], { facebook: "link", instagram: "image" })).toEqual({ facebook: "link", instagram: "reel" });
    expect(formatsForMedia([], { facebook: "text", instagram: "image" })).toEqual({ facebook: "text", instagram: "image" });
  });

  it("names a video left set to Image, which Facebook would refuse at publishing time", () => {
    const errors = validateSocialDraft({
      title: "First Post", accountIds: ["fb", "ig"], captions: { facebook: "Hi", instagram: "Hi" },
      formats: { facebook: "image", instagram: "image" }, files: [video],
    });
    expect(errors).toEqual([
      "The Facebook version is set to Image, but the media is a video. Choose Video.",
      "The Instagram version is set to Feed image, but the media is a video. Choose Reel.",
    ]);
  });
});

describe("schedule lead time", () => {
  it("counts minutes in the workspace time zone", () => {
    const now = Date.parse("2026-10-02T12:39:30Z"); // 7:39:30 AM in Chicago
    expect(minutesUntil("2026-10-02T07:40", "America/Chicago", now)).toBeCloseTo(0.5);
    expect(minutesUntil("not a time", "America/Chicago", now)).toBe(-Infinity);
  });

  it("refuses a time less than 2 minutes away, which the database would refuse", () => {
    const soon = new Date(Date.now() + 60_000);
    const pad = (n: number) => String(n).padStart(2, "0");
    const local = `${soon.getFullYear()}-${pad(soon.getMonth() + 1)}-${pad(soon.getDate())}T${pad(soon.getHours())}:${pad(soon.getMinutes())}`;
    const errors = validateSocialDraft({
      title: "First Post", accountIds: ["fb"], captions: { facebook: "Hi" }, formats: { facebook: "text" }, files: [], scheduledLocal: local,
    });
    expect(errors).toEqual(["Choose a publishing time at least 2 minutes from now."]);
  });
});

describe("editing", () => {
  it("reads a scheduled time back in the workspace time zone", () => {
    expect(utcToZonedLocal("2026-10-07T16:15:00Z", "America/Chicago")).toBe("2026-10-07T11:15");
    expect(utcToZonedLocal("2026-12-22T05:05:00Z", "America/Chicago")).toBe("2026-12-21T23:05");
  });

  it("lets anyone edit a draft, managers anything not yet published, and nobody a published post", () => {
    expect(canEditPost("draft", false, false)).toBe(true);
    expect(canEditPost("scheduled", false, false)).toBe(false);
    expect(canEditPost("scheduled", false, true)).toBe(true);
    expect(canEditPost("failed", false, true)).toBe(true);
    expect(canEditPost("partially_published", true, true)).toBe(false);
    expect(canEditPost("published", true, true)).toBe(false);
    expect(canEditPost("canceled", false, true)).toBe(false);
  });
});

describe("postLink", () => {
  it("completes Facebook's path for videos and leaves full links alone", () => {
    expect(postLink("/reel/1765800574645621/", "facebook")).toBe("https://www.facebook.com/reel/1765800574645621/");
    expect(postLink("https://www.instagram.com/p/DeMxDS2lHOm/", "instagram")).toBe("https://www.instagram.com/p/DeMxDS2lHOm/");
    expect(postLink(null, "facebook")).toBeNull();
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
