import { describe, expect, it, vi } from "vitest";
import { appointmentCalendarFile, dateIn, earliestBookable, localDateTime, zonedDateTimeToIso } from "./appointments";

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

  it("localizes a Spanish calendar download", () => {
    const file = appointmentCalendarFile({
      id: "booking-2",
      startsAt: "2026-10-05T15:00:00Z",
      endsAt: "2026-10-05T15:30:00Z",
      hostName: "Equipo de LV Branding",
      language: "es",
    });
    expect(file).toContain("PRODID:-//LV Branding//Appointment Calendar//ES");
    expect(file).toContain("SUMMARY:Consulta de proyecto con LV Branding");
    expect(file).toContain("DESCRIPTION:Consulta de proyecto con Equipo de LV Branding.");
  });

  it("converts Central wall time across daylight-saving offsets", () => {
    expect(zonedDateTimeToIso("2026-07-06", "09:00", "America/Chicago")).toBe("2026-07-06T14:00:00.000Z");
    expect(zonedDateTimeToIso("2026-12-07", "09:00", "America/Chicago")).toBe("2026-12-07T15:00:00.000Z");
    expect(localDateTime("2026-12-07T15:00:00.000Z", "America/Chicago")).toEqual({ date: "2026-12-07", time: "09:00" });
  });
});

describe("booking dates", () => {
  it("gives today's date where the booking page is, not in UTC", () => {
    // 8 PM in Chicago on October 14 is already October 15 in UTC.
    const evening = new Date("2026-10-15T01:00:00Z");
    expect(dateIn("America/Chicago", evening)).toBe("2026-10-14");
    expect(evening.toISOString().slice(0, 10)).toBe("2026-10-15");
  });

  it("names the earliest bookable time for a notice period", () => {
    const now = Date.parse("2026-10-14T14:30:00Z"); // 9:30 AM in Chicago
    expect(earliestBookable(24, "America/Chicago", now)).toBe("Thu, Oct 15, 9:30 AM");
    expect(earliestBookable(2, "America/Chicago", now)).toBe("Wed, Oct 14, 11:30 AM");
  });
});
