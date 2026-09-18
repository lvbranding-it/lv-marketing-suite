import { describe, expect, it, vi } from "vitest";
import { appointmentCalendarFile, localDateTime, zonedDateTimeToIso } from "./appointments";

describe("appointment calendar helpers", () => {
  it("creates a portable tentative calendar event", () => {
    vi.setSystemTime(new Date("2026-09-18T12:00:00Z"));
    const file = appointmentCalendarFile({
      id: "booking-1",
      startsAt: "2026-10-05T15:00:00Z",
      endsAt: "2026-10-05T15:30:00Z",
      hostName: "LV Branding’s Team",
      status: "TENTATIVE",
    });
    expect(file).toContain("DTSTART:20261005T150000Z");
    expect(file).toContain("STATUS:TENTATIVE");
    expect(file).toContain("UID:booking-1@lvbranding.com");
  });

  it("converts Central wall time across daylight-saving offsets", () => {
    expect(zonedDateTimeToIso("2026-07-06", "09:00", "America/Chicago")).toBe("2026-07-06T14:00:00.000Z");
    expect(zonedDateTimeToIso("2026-12-07", "09:00", "America/Chicago")).toBe("2026-12-07T15:00:00.000Z");
    expect(localDateTime("2026-12-07T15:00:00.000Z", "America/Chicago")).toEqual({ date: "2026-12-07", time: "09:00" });
  });
});
