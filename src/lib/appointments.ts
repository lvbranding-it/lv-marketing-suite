type CalendarDownload = {
  id: string;
  startsAt: string;
  endsAt: string;
  hostName: string;
  meetingUrl?: string | null;
  status?: "TENTATIVE" | "CONFIRMED" | "CANCELLED";
  language?: "en" | "es";
};

const icsDate = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const icsText = (value: string) => value.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");

export function appointmentCalendarFile(appointment: CalendarDownload) {
  const spanish = appointment.language === "es";
  const description = [
    spanish ? `Consulta de proyecto con ${appointment.hostName}.` : `Project consultation with ${appointment.hostName}.`,
    appointment.meetingUrl ? `${spanish ? "Enlace" : "Join"}: ${appointment.meetingUrl}` : "",
  ].filter(Boolean).join("\n");
  return [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:-//LV Branding//Appointment Calendar//${spanish ? "ES" : "EN"}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${icsText(appointment.id)}@lvbranding.com`,
    `DTSTAMP:${icsDate(new Date().toISOString())}`,
    `DTSTART:${icsDate(appointment.startsAt)}`,
    `DTEND:${icsDate(appointment.endsAt)}`,
    `SUMMARY:${icsText(spanish ? "Consulta de proyecto con LV Branding" : "LV Branding project consultation")}`,
    `DESCRIPTION:${icsText(description)}`,
    `STATUS:${appointment.status || "CONFIRMED"}`,
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

export function downloadAppointmentCalendar(appointment: CalendarDownload) {
  const blob = new Blob([appointmentCalendarFile(appointment)], { type: "text/calendar;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "lv-branding-consultation.ics";
  link.click();
  URL.revokeObjectURL(url);
}

export function zonedDateTimeToIso(localDate: string, localTime: string, timezone: string) {
  const [year, month, day] = localDate.split("-").map(Number);
  const [hour, minute] = localTime.split(":").map(Number);
  const target = Date.UTC(year, month - 1, day, hour, minute);
  let guess = target;
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  });
  for (let pass = 0; pass < 3; pass += 1) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
    const rendered = Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day), Number(parts.hour), Number(parts.minute));
    guess += target - rendered;
  }
  return new Date(guess).toISOString();
}

export function localDateTime(iso: string, timezone: string) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(iso)).map((part) => [part.type, part.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

/**
 * Today's date where the booking page is, as "YYYY-MM-DD". The booking page
 * asked for availability from the UTC date, which in Chicago is already
 * tomorrow from 7 PM (6 PM in winter), so evening visitors lost the rest of
 * today's times.
 */
export function dateIn(timezone: string, at: Date = new Date()) {
  return localDateTime(at.toISOString(), timezone).date;
}

/** The earliest time a slot can start with this much notice, as a reader would say it in the page's time zone. */
export function earliestBookable(noticeHours: number, timezone: string, now = Date.now()) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(now + Math.max(0, noticeHours) * 3_600_000));
}
