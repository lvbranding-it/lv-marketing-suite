export type CalendarProvider = "google" | "microsoft";

type Connection = {
  id: string;
  host_id: string;
  provider: CalendarProvider;
  account_email: string | null;
  encrypted_access_token: string;
  encrypted_refresh_token: string | null;
  token_expires_at: string | null;
  calendar_id: string;
};

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function bytesToBase64(bytes: Uint8Array) {
  let value = "";
  for (const byte of bytes) value += String.fromCharCode(byte);
  return btoa(value);
}

function base64ToBytes(value: string) {
  const decoded = atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
}

async function encryptionKey() {
  const secret = Deno.env.get("CALENDAR_TOKEN_ENCRYPTION_KEY");
  if (!secret || secret.length < 24) throw new Error("Calendar token encryption is not configured");
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptToken(value: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await encryptionKey(), encoder.encode(value));
  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

export async function decryptToken(value: string) {
  const [iv, encrypted] = value.split(".");
  if (!iv || !encrypted) throw new Error("Invalid encrypted calendar token");
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: base64ToBytes(iv) }, await encryptionKey(), base64ToBytes(encrypted));
  return decoder.decode(clear);
}

export async function sha256(value: string) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", encoder.encode(value)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function credentials(provider: CalendarProvider) {
  if (provider === "google") return {
    clientId: Deno.env.get("GOOGLE_CALENDAR_CLIENT_ID") || "",
    clientSecret: Deno.env.get("GOOGLE_CALENDAR_CLIENT_SECRET") || "",
    tokenUrl: "https://oauth2.googleapis.com/token",
  };
  const tenant = Deno.env.get("MICROSOFT_CALENDAR_TENANT") || "common";
  return {
    clientId: Deno.env.get("MICROSOFT_CALENDAR_CLIENT_ID") || "",
    clientSecret: Deno.env.get("MICROSOFT_CALENDAR_CLIENT_SECRET") || "",
    tokenUrl: `https://login.microsoftonline.com/${tenant}/oauth2/v2.0/token`,
  };
}

export function requireProviderCredentials(provider: CalendarProvider) {
  const value = credentials(provider);
  if (!value.clientId || !value.clientSecret) throw new Error(`${provider === "google" ? "Google" : "Microsoft"} Calendar credentials are not configured`);
  return value;
}

export async function refreshCalendarAccess(db: any, connection: Connection) {
  if (connection.token_expires_at && new Date(connection.token_expires_at).getTime() > Date.now() + 120_000) {
    return decryptToken(connection.encrypted_access_token);
  }
  if (!connection.encrypted_refresh_token) throw new Error("Calendar connection must be renewed");
  const providerCredentials = requireProviderCredentials(connection.provider);
  const refreshToken = await decryptToken(connection.encrypted_refresh_token);
  const body = new URLSearchParams({
    client_id: providerCredentials.clientId,
    client_secret: providerCredentials.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  if (connection.provider === "microsoft") body.set("scope", "openid email offline_access User.Read Calendars.ReadWrite");
  const response = await fetch(providerCredentials.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!response.ok) throw new Error(`Calendar token refresh failed (${response.status})`);
  const tokens = await response.json();
  await db.from("appointment_calendar_connections").update({
    encrypted_access_token: await encryptToken(tokens.access_token),
    ...(tokens.refresh_token ? { encrypted_refresh_token: await encryptToken(tokens.refresh_token) } : {}),
    token_expires_at: new Date(Date.now() + Number(tokens.expires_in || 3600) * 1000).toISOString(),
  }).eq("id", connection.id);
  return tokens.access_token as string;
}

export async function calendarBusyRanges(db: any, connection: Connection, start: string, end: string) {
  const token = await refreshCalendarAccess(db, connection);
  if (connection.provider === "google") {
    const response = await fetch("https://www.googleapis.com/calendar/v3/freeBusy", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ timeMin: start, timeMax: end, items: [{ id: connection.calendar_id || "primary" }] }),
    });
    if (!response.ok) throw new Error(`Google availability failed (${response.status})`);
    const data = await response.json();
    return (data.calendars?.[connection.calendar_id || "primary"]?.busy || []).map((item: any) => ({ start: item.start, end: item.end }));
  }
  const url = new URL("https://graph.microsoft.com/v1.0/me/calendarView");
  url.searchParams.set("startDateTime", start);
  url.searchParams.set("endDateTime", end);
  url.searchParams.set("$select", "start,end,showAs,isCancelled");
  url.searchParams.set("$top", "1000");
  const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Prefer: 'outlook.timezone="UTC"' } });
  if (!response.ok) throw new Error(`Microsoft availability failed (${response.status})`);
  const data = await response.json();
  return (data.value || []).filter((item: any) => !item.isCancelled && item.showAs !== "free")
    .map((item: any) => ({ start: `${item.start.dateTime.replace(/Z$/, "")}Z`, end: `${item.end.dateTime.replace(/Z$/, "")}Z` }));
}

export async function createCalendarEvent(db: any, connection: Connection, booking: any, page: any, host: any) {
  const token = await refreshCalendarAccess(db, connection);
  const description = [
    `New website prospect appointment with ${booking.guest_name}.`,
    booking.company ? `Company: ${booking.company}` : "",
    booking.guest_phone ? `Phone: ${booking.guest_phone}` : "",
    booking.project_notes ? `Project: ${booking.project_notes}` : "",
  ].filter(Boolean).join("\n");
  if (connection.provider === "google") {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendar_id || "primary")}/events`);
    url.searchParams.set("conferenceDataVersion", "1");
    url.searchParams.set("sendUpdates", "all");
    const response = await fetch(url, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        summary: `Project consultation — ${booking.guest_name}`,
        description,
        start: { dateTime: booking.starts_at, timeZone: page.timezone },
        end: { dateTime: booking.ends_at, timeZone: page.timezone },
        attendees: [{ email: booking.guest_email, displayName: booking.guest_name }],
        conferenceData: { createRequest: { requestId: booking.id, conferenceSolutionKey: { type: "hangoutsMeet" } } },
      }),
    });
    if (!response.ok) throw new Error(`Google event creation failed (${response.status})`);
    const event = await response.json();
    return { provider: "google", eventId: event.id, meetingUrl: event.hangoutLink || event.htmlLink || null };
  }
  const response = await fetch("https://graph.microsoft.com/v1.0/me/events", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: 'outlook.timezone="UTC"' },
    body: JSON.stringify({
      subject: `Project consultation — ${booking.guest_name}`,
      body: { contentType: "text", content: description },
      start: { dateTime: booking.starts_at.replace(/Z$/, ""), timeZone: "UTC" },
      end: { dateTime: booking.ends_at.replace(/Z$/, ""), timeZone: "UTC" },
      attendees: [{ emailAddress: { address: booking.guest_email, name: booking.guest_name }, type: "required" }],
      isOnlineMeeting: true,
      onlineMeetingProvider: "teamsForBusiness",
      transactionId: booking.id,
    }),
  });
  if (!response.ok) throw new Error(`Microsoft event creation failed (${response.status})`);
  const event = await response.json();
  return { provider: "microsoft", eventId: event.id, meetingUrl: event.onlineMeeting?.joinUrl || event.webLink || null };
}

export async function updateCalendarEvent(db: any, connection: Connection, booking: any, page: any, host: any) {
  if (!booking.provider_event_id) return createCalendarEvent(db, connection, booking, page, host);
  const token = await refreshCalendarAccess(db, connection);
  const description = [
    `Website prospect appointment with ${booking.guest_name}.`,
    booking.company ? `Company: ${booking.company}` : "",
    booking.guest_phone ? `Phone: ${booking.guest_phone}` : "",
    booking.project_notes ? `Project: ${booking.project_notes}` : "",
  ].filter(Boolean).join("\n");
  if (connection.provider === "google") {
    const response = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendar_id || "primary")}/events/${encodeURIComponent(booking.provider_event_id)}?sendUpdates=all`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          summary: `Project consultation — ${booking.guest_name}`,
          description,
          start: { dateTime: booking.starts_at, timeZone: page.timezone },
          end: { dateTime: booking.ends_at, timeZone: page.timezone },
          attendees: [{ email: booking.guest_email, displayName: booking.guest_name }],
        }),
      },
    );
    if (!response.ok) throw new Error(`Google event update failed (${response.status})`);
    const event = await response.json();
    return { provider: "google", eventId: event.id, meetingUrl: event.hangoutLink || event.htmlLink || booking.meeting_url || null };
  }
  const response = await fetch(`https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(booking.provider_event_id)}`, {
    method: "PATCH",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: 'outlook.timezone="UTC"' },
    body: JSON.stringify({
      subject: `Project consultation — ${booking.guest_name}`,
      body: { contentType: "text", content: description },
      start: { dateTime: booking.starts_at.replace(/Z$/, ""), timeZone: "UTC" },
      end: { dateTime: booking.ends_at.replace(/Z$/, ""), timeZone: "UTC" },
      attendees: [{ emailAddress: { address: booking.guest_email, name: booking.guest_name }, type: "required" }],
    }),
  });
  if (!response.ok) throw new Error(`Microsoft event update failed (${response.status})`);
  return { provider: "microsoft", eventId: booking.provider_event_id, meetingUrl: booking.meeting_url || null };
}

export async function deleteCalendarEvent(db: any, connection: Connection, eventId: string) {
  const token = await refreshCalendarAccess(db, connection);
  const url = connection.provider === "google"
    ? `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(connection.calendar_id || "primary")}/events/${encodeURIComponent(eventId)}?sendUpdates=all`
    : `https://graph.microsoft.com/v1.0/me/events/${encodeURIComponent(eventId)}`;
  const response = await fetch(url, { method: "DELETE", headers: { Authorization: `Bearer ${token}` } });
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    throw new Error(`${connection.provider === "google" ? "Google" : "Microsoft"} event deletion failed (${response.status})`);
  }
}

export function overlaps(startA: string, endA: string, startB: string, endB: string) {
  return new Date(startA) < new Date(endB) && new Date(endA) > new Date(startB);
}
