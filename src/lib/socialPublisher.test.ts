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
});

describe("workspace timezone conversion", () => {
  it("converts Chicago daylight time to UTC", () => {
    expect(zonedDateTimeToUtc("2026-09-22T10:30", "America/Chicago")).toBe("2026-09-22T15:30:00.000Z");
  });

  it("converts Chicago standard time to UTC", () => {
    expect(zonedDateTimeToUtc("2026-12-22T10:30", "America/Chicago")).toBe("2026-12-22T16:30:00.000Z");
  });
});
