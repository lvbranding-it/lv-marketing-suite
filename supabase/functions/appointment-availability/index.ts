import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { calendarBusyRanges, overlaps } from "../_shared/appointment-calendar.ts";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type", "Access-Control-Allow-Methods": "POST, OPTIONS" };
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const input = await req.json().catch(() => ({}));
  if (!input.slug || !input.host_id || !input.from_date || !input.to_date) return json({ error: "Invalid availability request" }, 400);
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
  const { data: slots, error } = await db.rpc("get_appointment_available_slots", { p_slug: input.slug, p_host_id: input.host_id, p_from_date: input.from_date, p_to_date: input.to_date });
  if (error) return json({ error: "Availability could not be loaded" }, 500);
  const { data: connection } = await db.from("appointment_calendar_connections").select("*").eq("host_id", input.host_id).maybeSingle();
  if (!connection || !slots?.length) return json({ slots: slots || [] });
  try {
    const busy = await calendarBusyRanges(db, connection, slots[0].starts_at, slots[slots.length - 1].ends_at);
    return json({ slots: slots.filter((slot: any) => !busy.some((range: any) => overlaps(slot.starts_at, slot.ends_at, range.start, range.end))) });
  } catch (calendarError) {
    console.error("Provider availability failed", calendarError);
    // Internal Supabase conflicts are still authoritative. Returning these slots
    // keeps the page usable; booking performs a second provider check.
    return json({ slots, provider_warning: true });
  }
});

