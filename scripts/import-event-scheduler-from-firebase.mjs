import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const EVENT_SCHEDULER_ORG_ID = process.env.EVENT_SCHEDULER_ORG_ID;
const FIREBASE_PROJECT_ID = process.env.FIREBASE_PROJECT_ID ?? "lv-branding-events";
const FIREBASE_WEB_API_KEY = process.env.FIREBASE_WEB_API_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !EVENT_SCHEDULER_ORG_ID) {
  throw new Error(
    "Set SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and EVENT_SCHEDULER_ORG_ID before importing.",
  );
}

const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const decodeValue = (value) => {
  if (!value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("nullValue" in value) return null;
  if ("arrayValue" in value) return (value.arrayValue.values ?? []).map(decodeValue);
  if ("mapValue" in value) return decodeFields(value.mapValue.fields ?? {});
  return null;
};

const decodeFields = (fields) =>
  Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, decodeValue(value)]));

async function readCollection(collection) {
  const documents = [];
  let pageToken = "";
  do {
    const url = new URL(
      `https://firestore.googleapis.com/v1/projects/${FIREBASE_PROJECT_ID}/databases/(default)/documents/${collection}`,
    );
    url.searchParams.set("pageSize", "300");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    if (FIREBASE_WEB_API_KEY) url.searchParams.set("key", FIREBASE_WEB_API_KEY);
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Unable to read legacy ${collection}: HTTP ${response.status}`);
    }
    const page = await response.json();
    for (const document of page.documents ?? []) {
      documents.push({
        legacyId: document.name.split("/").at(-1),
        ...decodeFields(document.fields ?? {}),
      });
    }
    pageToken = page.nextPageToken ?? "";
  } while (pageToken);
  return documents;
}

function normalizeTime(value) {
  const input = String(value ?? "").trim().toUpperCase();
  const twelveHour = input.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/);
  if (twelveHour) {
    let hour = Number(twelveHour[1]) % 12;
    if (twelveHour[3] === "PM") hour += 12;
    return `${String(hour).padStart(2, "0")}:${twelveHour[2]}`;
  }
  const twentyFourHour = input.match(/^(\d{1,2}):(\d{2})/);
  if (twentyFourHour) {
    return `${String(Number(twentyFourHour[1])).padStart(2, "0")}:${twentyFourHour[2]}`;
  }
  throw new Error("Unsupported legacy time value");
}

const legacyEvents = await readCollection("events");
const legacyBookings = await readCollection("bookings");

let featuredAssigned = false;
const importedEvents = [];
for (const event of legacyEvents) {
  const dates = Array.isArray(event.dates) ? event.dates.map(String) : [];
  const timeSlots = Array.isArray(event.timeSlots) ? event.timeSlots.map(String) : [];
  if (!event.name || dates.length === 0 || timeSlots.length === 0) {
    console.warn(`Skipping invalid legacy event ${event.legacyId}`);
    continue;
  }
  const shouldFeature = !featuredAssigned && Boolean(event.isFeatured);
  featuredAssigned ||= shouldFeature;
  const { data, error } = await db
    .from("event_schedule_events")
    .upsert(
      {
        org_id: EVENT_SCHEDULER_ORG_ID,
        name: String(event.name),
        location: String(event.location ?? ""),
        placement: String(event.placement ?? ""),
        theme_color: /^#[0-9a-f]{6}$/i.test(String(event.themeColor))
          ? String(event.themeColor)
          : "#f97316",
        dates,
        time_slots: timeSlots,
        logo_url: event.logoUrl ? String(event.logoUrl) : null,
        is_featured: shouldFeature,
        is_active: true,
        legacy_source_id: event.legacyId,
      },
      { onConflict: "legacy_source_id" },
    )
    .select("id, name, legacy_source_id")
    .single();
  if (error) throw new Error(`Unable to import event ${event.legacyId}: ${error.message}`);
  importedEvents.push(data);
}

if (!featuredAssigned && importedEvents[0]) {
  const { error } = await db
    .from("event_schedule_events")
    .update({ is_featured: true })
    .eq("id", importedEvents[0].id);
  if (error) throw new Error(`Unable to feature imported event: ${error.message}`);
}

const eventByName = new Map(importedEvents.map((event) => [event.name, event]));
let importedBookingCount = 0;
let skippedBookingCount = 0;
for (const booking of legacyBookings) {
  const event = eventByName.get(booking.eventName) ?? (importedEvents.length === 1 ? importedEvents[0] : null);
  if (!event || !booking.name || !booking.email || !booking.date || !booking.time) {
    skippedBookingCount += 1;
    console.warn(`Skipping incomplete legacy booking ${booking.legacyId}`);
    continue;
  }
  let slotTime;
  try {
    slotTime = normalizeTime(booking.time);
  } catch {
    skippedBookingCount += 1;
    console.warn(`Skipping legacy booking with invalid time ${booking.legacyId}`);
    continue;
  }
  const { error } = await db.from("event_schedule_bookings").upsert(
    {
      org_id: EVENT_SCHEDULER_ORG_ID,
      event_id: event.id,
      guest_name: String(booking.name),
      guest_email: String(booking.email).trim().toLowerCase(),
      booking_date: String(booking.date),
      slot_time: slotTime,
      checked_in: Boolean(booking.checkedIn),
      legacy_source_id: booking.legacyId,
    },
    { onConflict: "legacy_source_id" },
  );
  if (error) {
    skippedBookingCount += 1;
    console.warn(`Skipping conflicting legacy booking ${booking.legacyId}: ${error.code}`);
  } else {
    importedBookingCount += 1;
  }
}

console.log(
  `Imported ${importedEvents.length} events and ${importedBookingCount} bookings; skipped ${skippedBookingCount} bookings.`,
);
