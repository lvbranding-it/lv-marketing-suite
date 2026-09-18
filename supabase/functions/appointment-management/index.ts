import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { calendarBusyRanges, createCalendarEvent, deleteCalendarEvent, overlaps, updateCalendarEvent } from "../_shared/appointment-calendar.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const escapeHtml = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

async function notifyGuest(booking: any, page: any, host: any, action: string) {
  const sendgrid = Deno.env.get("SENDGRID_API_KEY");
  if (!sendgrid || !["approve", "update", "cancel"].includes(action)) return;
  const when = new Intl.DateTimeFormat("en-US", { timeZone: page.timezone, dateStyle: "full", timeStyle: "short" }).format(new Date(booking.starts_at));
  const approved = action === "approve";
  const cancelled = action === "cancel";
  const stillPending = action === "update" && booking.status === "pending";
  const subject = cancelled
    ? "Your LV Branding appointment was cancelled"
    : approved ? "Your LV Branding appointment is confirmed" : stillPending ? "Your LV Branding appointment request was updated" : "Your LV Branding appointment was updated";
  const heading = cancelled ? "Appointment cancelled" : approved ? "Appointment confirmed" : stillPending ? "Appointment request updated" : "Appointment updated";
  const details = cancelled
    ? `Your appointment scheduled for <strong>${escapeHtml(when)}</strong> has been cancelled.`
    : stillPending ? `Your pending appointment request is now for <strong>${escapeHtml(when)}</strong> with ${escapeHtml(host.display_name)}. We will email you again after it is reviewed.`
    : `Your project consultation with ${escapeHtml(host.display_name)} is scheduled for <strong>${escapeHtml(when)}</strong>.`;
  const meeting = !cancelled && booking.meeting_url ? `<p><a href="${escapeHtml(booking.meeting_url)}">Join your online meeting</a></p>` : "";
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: { Authorization: `Bearer ${sendgrid}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: booking.guest_email, name: booking.guest_name }] }],
      from: { email: "admin@lvbranding.com", name: "LV Branding" },
      subject,
      content: [{ type: "text/html", value: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:32px"><h1>${heading}</h1><p>Hi ${escapeHtml(booking.guest_name)},</p><p>${details}</p>${meeting}<p>Contact admin@lvbranding.com if you have any questions.</p></div>` }],
    }),
  });
  if (!response.ok) throw new Error(`Guest email failed (${response.status})`);
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (Number(req.headers.get("content-length") || 0) > 20_000) return json({ error: "Request too large" }, 413);

  const authorization = req.headers.get("Authorization") || "";
  const userClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
    auth: { persistSession: false }, global: { headers: { Authorization: authorization } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Authentication required" }, 401);

  const input = await req.json().catch(() => ({}));
  const action = String(input.action || "").toLowerCase();
  if (!input.booking_id || !["approve", "update", "cancel", "delete"].includes(action)) return json({ error: "Invalid appointment action" }, 400);

  const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
  const { data: before } = await db.from("appointment_bookings").select("*").eq("id", input.booking_id).maybeSingle();
  if (!before) return json({ error: "Appointment not found" }, 404);
  const { data: member } = await db.from("team_members").select("role").eq("org_id", before.org_id).eq("user_id", user.id).maybeSingle();
  if (!member || !["owner", "admin"].includes(member.role)) return json({ error: "Administrator access required" }, 403);

  if (action === "approve") {
    const { data: connection } = await db.from("appointment_calendar_connections").select("*").eq("host_id", before.host_id).maybeSingle();
    if (connection) {
      try {
        const busy = await calendarBusyRanges(db, connection, before.starts_at, before.ends_at);
        if (busy.some((range: any) => overlaps(before.starts_at, before.ends_at, range.start, range.end))) {
          return json({ error: "SLOT_UNAVAILABLE" }, 409);
        }
      } catch (calendarError) {
        console.error("Approval availability check failed", calendarError);
        return json({ error: "Connected calendar availability could not be verified" }, 503);
      }
    }
  }
  if (action === "delete" && before.provider_event_id) {
    const { data: connection } = await db.from("appointment_calendar_connections").select("*").eq("host_id", before.host_id).maybeSingle();
    if (connection) {
      try {
        await deleteCalendarEvent(db, connection, before.provider_event_id);
      } catch (calendarError) {
        console.error("Appointment event deletion failed", calendarError);
        return json({ error: "The connected calendar event could not be deleted" }, 502);
      }
    }
  }
  const { data, error } = await userClient.rpc("manage_appointment_booking", {
    p_booking_id: input.booking_id,
    p_action: action,
    p_host_id: input.host_id || null,
    p_guest_name: input.guest_name ?? null,
    p_guest_email: input.guest_email ?? null,
    p_guest_phone: input.guest_phone ?? null,
    p_company: input.company ?? null,
    p_project_notes: input.project_notes ?? null,
    p_starts_at: input.starts_at || null,
  });
  if (error) {
    const conflict = /SLOT|BOOKED|AVAILABLE/i.test(error.message);
    return json({ error: error.message }, conflict ? 409 : error.code === "42501" ? 403 : 400);
  }

  const booking = data as any;
  const { data: page } = await db.from("appointment_booking_pages").select("*").eq("id", booking.page_id).single();
  const { data: host } = await db.from("appointment_hosts").select("*").eq("id", booking.host_id).single();
  let warning = "";

  try {
    if (action === "cancel" && before?.provider_event_id) {
      const { data: connection } = await db.from("appointment_calendar_connections").select("*").eq("host_id", before.host_id).maybeSingle();
      if (connection) await deleteCalendarEvent(db, connection, before.provider_event_id);
    } else if (action === "approve" || (action === "update" && booking.status === "confirmed")) {
      const hostChanged = before && before.host_id !== booking.host_id;
      if (hostChanged && before.provider_event_id) {
        const { data: oldConnection } = await db.from("appointment_calendar_connections").select("*").eq("host_id", before.host_id).maybeSingle();
        if (oldConnection) await deleteCalendarEvent(db, oldConnection, before.provider_event_id);
        booking.provider_event_id = null;
        booking.meeting_url = null;
        booking.provider = null;
        await db.from("appointment_bookings").update({ provider: null, provider_event_id: null, meeting_url: null }).eq("id", booking.id);
      }
      const { data: connection } = await db.from("appointment_calendar_connections").select("*").eq("host_id", booking.host_id).maybeSingle();
      if (connection) {
        const event = booking.provider_event_id
          ? await updateCalendarEvent(db, connection, booking, page, host)
          : await createCalendarEvent(db, connection, booking, page, host);
        Object.assign(booking, { provider: event.provider, provider_event_id: event.eventId, meeting_url: event.meetingUrl, provider_sync_error: null });
        await db.from("appointment_bookings").update({
          provider: event.provider, provider_event_id: event.eventId,
          meeting_url: event.meetingUrl, provider_sync_error: null,
        }).eq("id", booking.id);
      } else if (hostChanged) {
        Object.assign(booking, { provider: null, provider_event_id: null, meeting_url: null });
        await db.from("appointment_bookings").update({ provider: null, provider_event_id: null, meeting_url: null, provider_sync_error: null }).eq("id", booking.id);
      }
    }
  } catch (calendarError) {
    warning = (calendarError as Error).message;
    console.error("Appointment calendar sync failed", calendarError);
    if (action !== "delete") await db.from("appointment_bookings").update({ provider_sync_error: warning.slice(0, 500) }).eq("id", booking.id);
  }

  try {
    await notifyGuest(booking, page, host, action);
    if (action === "approve") await db.from("appointment_bookings").update({ confirmation_sent_at: new Date().toISOString() }).eq("id", booking.id);
  } catch (emailError) {
    warning = [warning, (emailError as Error).message].filter(Boolean).join("; ");
    console.error("Appointment guest notification failed", emailError);
  }

  return json({ ok: true, booking, warning: warning || null });
});
