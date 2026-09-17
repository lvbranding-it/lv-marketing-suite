import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { calendarBusyRanges, createCalendarEvent, overlaps } from "../_shared/appointment-calendar.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json" } });
const escapeHtml = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  if (Number(req.headers.get("content-length") || 0) > 20_000) return json({ error: "Request too large" }, 413);
  const input = await req.json().catch(() => ({}));
  if (!input.slug || !input.host_id || !input.guest_name || !input.guest_email || !input.starts_at) return json({ error: "Missing booking information" }, 400);
  if (String(input.guest_name).length > 160 || String(input.guest_email).length > 320 || String(input.guest_phone || "").length > 60 || String(input.company || "").length > 200 || String(input.project_notes || "").length > 3000) return json({ error: "Booking information is too long" }, 400);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: page } = await db.from("appointment_booking_pages").select("*").eq("slug", input.slug).eq("is_active", true).maybeSingle();
  const { data: host } = await db.from("appointment_hosts").select("*").eq("id", input.host_id).eq("is_enabled", true).maybeSingle();
  if (!page || !host || host.page_id !== page.id) return json({ error: "Booking page unavailable" }, 404);
  const proposedEnd = new Date(new Date(input.starts_at).getTime() + page.duration_minutes * 60_000).toISOString();
  const { data: connection } = await db.from("appointment_calendar_connections").select("*").eq("host_id", host.id).maybeSingle();
  if (connection) {
    try {
      const busy = await calendarBusyRanges(db, connection, input.starts_at, proposedEnd);
      if (busy.some((range: any) => overlaps(input.starts_at, proposedEnd, range.start, range.end))) return json({ error: "SLOT_UNAVAILABLE" }, 409);
    } catch (error) {
      console.error("Final provider conflict check failed", error);
      return json({ error: "Calendar availability could not be verified. Please try again." }, 503);
    }
  }
  const { data: bookingId, error: bookingError } = await db.rpc("book_public_appointment", {
    p_slug: input.slug, p_host_id: input.host_id, p_guest_name: input.guest_name, p_guest_email: input.guest_email,
    p_guest_phone: input.guest_phone || "", p_company: input.company || "", p_project_notes: input.project_notes || "", p_starts_at: input.starts_at,
  });
  if (bookingError) return json({ error: bookingError.message }, bookingError.message.includes("SLOT") || bookingError.message.includes("EMAIL") ? 409 : 400);
  const { data: booking } = await db.from("appointment_bookings").select("*").eq("id", bookingId).single();
  if (connection && booking) {
    try {
      const event = await createCalendarEvent(db, connection, booking, page, host);
      await db.from("appointment_bookings").update({ provider: event.provider, provider_event_id: event.eventId, meeting_url: event.meetingUrl, provider_sync_error: null }).eq("id", bookingId);
      booking.meeting_url = event.meetingUrl;
    } catch (error) {
      console.error("Calendar event creation failed", error);
      await db.from("appointment_bookings").update({ provider_sync_error: (error as Error).message.slice(0, 500) }).eq("id", bookingId);
    }
  }
  const sendgrid = Deno.env.get("SENDGRID_API_KEY");
  if (sendgrid && booking) {
    const when = new Intl.DateTimeFormat("en-US", { timeZone: page.timezone, dateStyle: "full", timeStyle: "short" }).format(new Date(booking.starts_at));
    const meeting = booking.meeting_url ? `<p><a href="${escapeHtml(booking.meeting_url)}">Join your online meeting</a></p>` : "";
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", { method: "POST", headers: { Authorization: `Bearer ${sendgrid}`, "Content-Type": "application/json" }, body: JSON.stringify({
      personalizations: [{ to: [{ email: booking.guest_email, name: booking.guest_name }] }], from: { email: "admin@lvbranding.com", name: "LV Branding" },
      subject: "Your LV Branding project consultation is confirmed", content: [{ type: "text/html", value: `<div style="font-family:Arial,sans-serif;max-width:600px;margin:auto;padding:32px"><h1>Appointment confirmed</h1><p>Hi ${escapeHtml(booking.guest_name)},</p><p>Your project consultation with ${escapeHtml(host.display_name)} is scheduled for <strong>${escapeHtml(when)}</strong>.</p>${meeting}<p>We look forward to learning about your project.</p></div>` }],
    }) });
    if (response.status === 202) await db.from("appointment_bookings").update({ confirmation_sent_at: new Date().toISOString() }).eq("id", bookingId);
  }
  return json({ ok: true, booking_id: bookingId });
});
