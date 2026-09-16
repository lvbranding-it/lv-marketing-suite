/**
 * event-schedule-confirmation — public, idempotent booking email endpoint.
 *
 * The booking itself is created by the database RPC. This function can only
 * claim an existing UUID once, reads the private address with the service role,
 * and marks successful delivery in Supabase.
 */
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const SENDGRID_API_KEY = Deno.env.get("SENDGRID_API_KEY");
const FROM_EMAIL = "admin@lvbranding.com";
const FROM_NAME = "LV Branding";
const APP_URL = Deno.env.get("APP_URL") ?? "https://marketing.lvbranding.com";
const LV_LOGO_URL = `${APP_URL}/lv-logo.png`;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function bookingEmail(booking: Record<string, string>) {
  const location = [booking.event_location, booking.event_placement]
    .filter(Boolean)
    .map(escapeHtml)
    .join(" &middot; ");
  const theme = /^#[0-9a-f]{6}$/i.test(booking.theme_color) ? booking.theme_color : "#CB2039";

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Your event appointment is confirmed</title></head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5;">
    <tr><td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;">
        <tr><td align="center" style="padding-bottom:20px;"><img src="${LV_LOGO_URL}" alt="LV Branding" width="56" height="56" style="display:block;border:0;"></td></tr>
        <tr><td style="background:#fff;border:1px solid #e4e4e7;border-radius:16px;padding:32px;">
          <div style="width:44px;height:4px;border-radius:2px;background:${theme};margin-bottom:22px;"></div>
          <h1 style="margin:0 0 10px;font-size:24px;color:#111827;">Appointment confirmed</h1>
          <p style="margin:0 0 24px;font-size:15px;line-height:1.7;color:#4b5563;">Hello ${escapeHtml(booking.guest_name)}, your spot for <strong>${escapeHtml(booking.event_name)}</strong> is reserved.</p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f9fafb;border-radius:12px;padding:18px;">
            <tr><td style="padding:5px;color:#6b7280;font-size:13px;">Date</td><td align="right" style="padding:5px;color:#111827;font-size:14px;font-weight:700;">${escapeHtml(booking.booking_date)}</td></tr>
            <tr><td style="padding:5px;color:#6b7280;font-size:13px;">Time</td><td align="right" style="padding:5px;color:#111827;font-size:14px;font-weight:700;">${escapeHtml(booking.slot_time)}</td></tr>
            ${location ? `<tr><td style="padding:5px;color:#6b7280;font-size:13px;">Location</td><td align="right" style="padding:5px;color:#111827;font-size:14px;font-weight:700;">${location}</td></tr>` : ""}
          </table>
          <p style="margin:24px 0 0;font-size:13px;line-height:1.6;color:#6b7280;">Please keep this email for your records. We look forward to seeing you.</p>
        </td></tr>
        <tr><td align="center" style="padding-top:20px;font-size:11px;color:#9ca3af;">LV Branding &middot; <a href="https://www.lvbranding.com" style="color:#6b7280;">lvbranding.com</a></td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let bookingId = "";
  try {
    const body = await req.json();
    bookingId = String(body?.booking_id ?? "");
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(bookingId)) {
    return json({ error: "Invalid booking" }, 400);
  }

  const db = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error: claimError } = await db.rpc("claim_event_schedule_confirmation", {
    p_booking_id: bookingId,
  });
  if (claimError) {
    console.error("Booking confirmation claim failed:", claimError);
    return json({ error: "Unable to prepare confirmation" }, 500);
  }
  const booking = data?.[0] as Record<string, string> | undefined;
  if (!booking) return json({ ok: true, sent: false });

  if (!SENDGRID_API_KEY) {
    console.error("SENDGRID_API_KEY is not configured");
    await db.from("event_schedule_bookings").update({ confirmation_claimed_at: null }).eq("id", bookingId);
    return json({ ok: true, sent: false });
  }

  try {
    const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${SENDGRID_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: booking.guest_email, name: booking.guest_name }] }],
        from: { email: FROM_EMAIL, name: FROM_NAME },
        subject: `Appointment confirmed — ${booking.event_name}`,
        content: [{ type: "text/html", value: bookingEmail(booking) }],
        tracking_settings: { click_tracking: { enable: false, enable_text: false } },
      }),
    });
    if (response.status !== 202) {
      console.error("SendGrid booking confirmation error:", response.status, await response.text());
      await db.from("event_schedule_bookings").update({ confirmation_claimed_at: null }).eq("id", bookingId);
      return json({ error: "Confirmation email failed" }, 502);
    }
  } catch (error) {
    console.error("SendGrid booking confirmation network error:", error);
    await db.from("event_schedule_bookings").update({ confirmation_claimed_at: null }).eq("id", bookingId);
    return json({ error: "Confirmation email failed" }, 502);
  }

  const { error: markError } = await db
    .from("event_schedule_bookings")
    .update({ confirmation_sent_at: new Date().toISOString() })
    .eq("id", bookingId);
  if (markError) console.error("Unable to mark booking confirmation sent:", markError);

  return json({ ok: true, sent: true });
});
