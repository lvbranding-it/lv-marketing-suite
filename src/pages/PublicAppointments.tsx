import { useEffect, useMemo, useState } from "react";
import { CalendarDays, CheckCircle2, Clock3, ExternalLink, Loader2, UserRound } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import LVLogo from "@/components/LVLogo";

type PublicHost = { id: string; display_name: string; avatar_url?: string | null; is_default: boolean };
type PublicPage = {
  id: string;
  slug: string;
  title: string;
  description: string;
  timezone: string;
  duration_minutes: number;
  brand_color: string;
  confirmation_message: string;
  confirmation_url: string;
  hosts: PublicHost[];
};
type Slot = { starts_at: string; ends_at: string };

const dateKey = (iso: string, timezone: string) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" })
    .format(new Date(iso));

const dateLabel = (iso: string, timezone: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short", month: "short", day: "numeric" })
    .format(new Date(iso));

const dateParts = (iso: string, timezone: string) => ({
  weekday: new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(new Date(iso)),
  monthDay: new Intl.DateTimeFormat("en-US", { timeZone: timezone, month: "short", day: "numeric" }).format(new Date(iso)),
});

const timeLabel = (iso: string, timezone: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" })
    .format(new Date(iso));

function cleanError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error ?? "");
  if (message.includes("EMAIL_ALREADY_BOOKED")) return "This email already has an active appointment. Please contact us if you need to reschedule.";
  if (message.includes("SLOT_UNAVAILABLE")) return "That time was just taken. Please choose another available time.";
  return "We could not complete the booking. Please try again.";
}

export default function PublicAppointments() {
  const slug = window.location.pathname.split("/").filter(Boolean)[1] || "lv-branding-consultation";
  const embedded = new URLSearchParams(window.location.search).get("embed") === "1";
  const [page, setPage] = useState<PublicPage | null>(null);
  const [hostId, setHostId] = useState("");
  const [slots, setSlots] = useState<Slot[]>([]);
  const [selectedDate, setSelectedDate] = useState("");
  const [selectedStart, setSelectedStart] = useState("");
  const [loading, setLoading] = useState(true);
  const [slotsLoading, setSlotsLoading] = useState(false);
  const [visibleDateCount, setVisibleDateCount] = useState(10);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "", company: "", notes: "" });

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      const { data, error: loadError } = await (supabase as any).rpc("get_public_appointment_page", { p_slug: slug });
      if (!active) return;
      if (loadError || !data) {
        setError("This booking page is not available.");
      } else {
        const next = data as PublicPage;
        setPage(next);
        setHostId(next.hosts.find((host) => host.is_default)?.id || next.hosts[0]?.id || "");
      }
      setLoading(false);
    })();
    return () => { active = false; };
  }, [slug]);

  useEffect(() => {
    if (!page || !hostId) return;
    let active = true;
    (async () => {
      setSlotsLoading(true);
      setSelectedDate("");
      setSelectedStart("");
      setVisibleDateCount(10);
      setError("");
      const from = new Date();
      const to = new Date(Date.now() + 90 * 86400000);
      const payload = {
        slug: page.slug,
        host_id: hostId,
        from_date: from.toISOString().slice(0, 10),
        to_date: to.toISOString().slice(0, 10),
      };
      // The Edge Function adds connected Google/Microsoft busy time. Falling
      // back to the database RPC keeps Supabase-only scheduling fully usable.
      const edge = await supabase.functions.invoke("appointment-availability", { body: payload });
      let rows: Slot[] = edge.data?.slots || [];
      if (edge.error) {
        const fallback = await (supabase as any).rpc("get_appointment_available_slots", {
          p_slug: page.slug,
          p_host_id: hostId,
          p_from_date: payload.from_date,
          p_to_date: payload.to_date,
        });
        rows = fallback.data || [];
        if (fallback.error) setError("Availability could not be loaded. Please try again.");
      }
      if (active) {
        setSlots(rows);
        setSlotsLoading(false);
      }
    })();
    return () => { active = false; };
  }, [page, hostId]);

  const grouped = useMemo(() => {
    if (!page) return [] as Array<{ key: string; label: string; slots: Slot[] }>;
    const groups = new Map<string, Slot[]>();
    for (const slot of slots) {
      const key = dateKey(slot.starts_at, page.timezone);
      groups.set(key, [...(groups.get(key) || []), slot]);
    }
    return [...groups].map(([key, values]) => ({ key, label: dateLabel(values[0].starts_at, page.timezone), slots: values }));
  }, [page, slots]);

  const visibleSlots = grouped.find((group) => group.key === selectedDate)?.slots || [];
  const selectedSlot = slots.find((slot) => slot.starts_at === selectedStart);
  const selectedHost = page?.hosts.find((host) => host.id === hostId);
  const publicDescription = page?.description === "Choose a team member and a time that works for you."
    ? "Choose a date and time that works for you."
    : page?.description;

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!page || !selectedStart || !hostId) return;
    setSubmitting(true);
    setError("");
    const payload = {
      slug: page.slug,
      host_id: hostId,
      guest_name: form.name,
      guest_email: form.email,
      guest_phone: form.phone,
      company: form.company,
      project_notes: form.notes,
      starts_at: selectedStart,
    };
    const edge = await supabase.functions.invoke("appointment-booking", { body: payload });
    const bookingError: unknown = edge.error || edge.data?.error;
    setSubmitting(false);
    if (bookingError) {
      setError(cleanError(bookingError));
      return;
    }
    setConfirmed(true);
  };

  if (loading) return <main className="grid min-h-screen place-items-center bg-[#FBFAF8]"><Loader2 className="animate-spin text-[#CB2039]" /></main>;
  if (!page) return <main className="grid min-h-screen place-items-center bg-[#FBFAF8] p-6"><p className="text-[#514A4C]">{error}</p></main>;

  return (
    <main className={`min-h-screen overflow-x-hidden bg-[#FBFAF8] text-[#231F20] ${embedded ? "p-2" : "px-3 py-5 sm:px-6 sm:py-10 lg:py-14"}`}>
      <section className="mx-auto w-full max-w-7xl overflow-hidden rounded-[28px] border border-[#E8E1DE] bg-white shadow-[0_24px_70px_rgba(35,31,32,0.10)]">
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] lg:grid-cols-[320px_minmax(0,1fr)] xl:grid-cols-[360px_minmax(0,1fr)]">
          <aside className="relative min-w-0 overflow-hidden bg-[#231F20] p-6 text-white sm:p-8 lg:p-10">
            <div className="absolute inset-x-0 top-0 h-2" style={{ backgroundColor: page.brand_color }} />
            <div className="flex items-center justify-between gap-4 lg:block">
              <div className="flex items-center gap-3 lg:block">
                <LVLogo size={54} className="shrink-0 lg:mb-10" />
                <p className="text-xs font-semibold uppercase tracking-[0.24em] text-white/70 lg:mb-4">LV Branding</p>
              </div>
              <span className="hidden shrink-0 rounded-full border border-white/15 px-3 py-1.5 text-[11px] font-medium text-white/65 min-[480px]:inline-flex lg:hidden">Project consultation</span>
            </div>
            <div className="mt-7 max-w-sm lg:mt-0">
              <p className="mb-3 hidden text-[11px] font-semibold uppercase tracking-[0.22em] lg:block" style={{ color: page.brand_color }}>Project consultation</p>
              <h1 className="text-3xl font-bold leading-[1.05] tracking-[-0.035em] sm:text-4xl lg:text-[42px]">{page.title}</h1>
              <p className="mt-4 max-w-xs text-[15px] leading-7 text-white/70">{publicDescription}</p>
            </div>
            <div className="mt-7 grid gap-2.5 sm:grid-cols-3 lg:mt-10 lg:grid-cols-1">
              <p className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-sm text-white/80"><Clock3 size={17} style={{ color: page.brand_color }} /> {page.duration_minutes} minutes</p>
              <p className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-sm text-white/80"><CalendarDays size={17} style={{ color: page.brand_color }} /> Central Time</p>
              {selectedHost && <p className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-sm text-white/80"><UserRound size={17} style={{ color: page.brand_color }} /> With {selectedHost.display_name}</p>}
            </div>
          </aside>

          <div className="min-w-0 p-5 sm:p-8 lg:p-10 xl:p-12">
            {confirmed ? (
              <div className="flex min-h-[600px] flex-col items-center justify-center text-center">
                <span className="grid h-20 w-20 place-items-center rounded-full bg-[#CB2039]/10"><CheckCircle2 size={52} style={{ color: page.brand_color }} /></span>
                <p className="mt-7 text-xs font-semibold uppercase tracking-[0.2em]" style={{ color: page.brand_color }}>You are all set</p>
                <h2 className="mt-2 text-3xl font-bold tracking-tight text-[#231F20]">Appointment confirmed</h2>
                <p className="mt-3 max-w-md leading-7 text-[#6C6466]">{page.confirmation_message}</p>
                {selectedSlot && (
                  <div className="mt-7 rounded-2xl border border-[#E8E1DE] bg-[#FBFAF8] px-6 py-4 text-sm text-[#514A4C]">
                    <strong>{dateLabel(selectedSlot.starts_at, page.timezone)}</strong> at {timeLabel(selectedSlot.starts_at, page.timezone)} with {selectedHost?.display_name}
                  </div>
                )}
                <Button className="mt-8 h-12 gap-2 rounded-xl px-6 hover:opacity-90" style={{ backgroundColor: page.brand_color }} asChild>
                  <a href={page.confirmation_url || "https://www.lvbranding.com"} target="_top" rel="noopener noreferrer">
                    Visit LV Branding <ExternalLink size={16} />
                  </a>
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="min-w-0 space-y-8">
                <div className="min-w-0">
                  <div className="flex items-center gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: page.brand_color }}>2</span><div><Label className="text-base font-semibold text-[#231F20]">Choose a date</Label><p className="mt-0.5 text-xs text-[#82797B]">Available dates in Central Time.</p></div></div>
                  {slotsLoading ? <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500"><Loader2 size={16} className="animate-spin" /> Checking calendars…</div> :
                    grouped.length ? <><div className="mt-4 grid min-w-0 grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-5">{grouped.slice(0, visibleDateCount).map((group) => {
                      const parts = dateParts(group.slots[0].starts_at, page.timezone);
                      return <button key={group.key} type="button" onClick={() => { setSelectedDate(group.key); setSelectedStart(""); }}
                        style={selectedDate === group.key ? { borderColor: page.brand_color, backgroundColor: page.brand_color } : undefined}
                        className={`min-w-0 rounded-xl border px-2 py-3 text-center transition focus:outline-none focus:ring-2 focus:ring-[#CB2039]/25 ${selectedDate === group.key ? "text-white shadow-sm" : "border-[#E8E1DE] bg-white text-[#514A4C] hover:border-[#CB2039]/50 hover:bg-[#CB2039]/[0.03]"}`}>
                        <span className={`block text-[11px] font-semibold uppercase tracking-[0.12em] ${selectedDate === group.key ? "text-white/75" : "text-[#948A8C]"}`}>{parts.weekday}</span><span className="mt-0.5 block text-sm font-bold">{parts.monthDay}</span>
                      </button>;
                    })}</div>{visibleDateCount < grouped.length && <Button type="button" variant="ghost" size="sm" onClick={() => setVisibleDateCount((count) => count + 10)} className="mt-3 px-0 text-[#CB2039] hover:bg-transparent hover:text-[#A71930]">Show more dates</Button>}</> : <p className="mt-4 rounded-xl bg-[#FBFAF8] p-4 text-sm text-[#6C6466]">No open times are currently available.</p>}
                </div>

                {selectedDate && (
                  <div className="min-w-0 border-t border-[#EEE9E6] pt-7">
                    <div className="flex items-center gap-3"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: page.brand_color }}>3</span><div><Label className="text-base font-semibold text-[#231F20]">Choose a time</Label><p className="mt-0.5 text-xs text-[#82797B]">{visibleSlots[0] ? dateLabel(visibleSlots[0].starts_at, page.timezone) : "Available times"}</p></div></div>
                    <div className="mt-4 grid min-w-0 grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-4">
                      {visibleSlots.map((slot) => (
                        <button key={slot.starts_at} type="button" onClick={() => setSelectedStart(slot.starts_at)}
                          style={selectedStart === slot.starts_at ? { borderColor: page.brand_color, backgroundColor: page.brand_color } : undefined}
                          className={`min-w-0 rounded-xl border px-2 py-3 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[#CB2039]/25 ${selectedStart === slot.starts_at ? "text-white shadow-sm" : "border-[#E8E1DE] text-[#514A4C] hover:border-[#CB2039]/50 hover:bg-[#CB2039]/[0.03]"}`}>
                          {timeLabel(slot.starts_at, page.timezone)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {selectedStart && (
                  <div className="grid min-w-0 gap-4 border-t border-[#EEE9E6] pt-7 sm:grid-cols-2">
                    <div className="flex items-center gap-3 sm:col-span-2"><span className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold text-white" style={{ backgroundColor: page.brand_color }}>4</span><div><p className="text-base font-semibold text-[#231F20]">Tell us about your project</p><p className="mt-0.5 text-xs text-[#82797B]">We’ll send the confirmation to your email.</p></div></div>
                    <div className="sm:col-span-2"><Label htmlFor="appointment-name">Name</Label><Input id="appointment-name" required maxLength={160} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5 h-11 border-[#DDD5D2] focus-visible:ring-[#CB2039]" /></div>
                    <div><Label htmlFor="appointment-email">Email</Label><Input id="appointment-email" required type="email" maxLength={320} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1.5 h-11 border-[#DDD5D2] focus-visible:ring-[#CB2039]" /></div>
                    <div><Label htmlFor="appointment-phone">Phone</Label><Input id="appointment-phone" type="tel" maxLength={40} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1.5 h-11 border-[#DDD5D2] focus-visible:ring-[#CB2039]" /></div>
                    <div className="sm:col-span-2"><Label htmlFor="appointment-company">Company</Label><Input id="appointment-company" maxLength={160} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="mt-1.5 h-11 border-[#DDD5D2] focus-visible:ring-[#CB2039]" /></div>
                    <div className="sm:col-span-2"><Label htmlFor="appointment-notes">Project details</Label><Textarea id="appointment-notes" required maxLength={3000} rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1.5 border-[#DDD5D2] focus-visible:ring-[#CB2039]" placeholder="What are you hoping to build or improve?" /></div>
                  </div>
                )}

                {error && <p role="alert" className="rounded-xl border border-[#CB2039]/15 bg-[#CB2039]/[0.05] p-3 text-sm text-[#A71930]">{error}</p>}
                {selectedStart && <Button type="submit" disabled={submitting} className="h-12 w-full rounded-xl text-base font-semibold shadow-sm hover:opacity-90" style={{ backgroundColor: page.brand_color }}>{submitting ? <><Loader2 size={18} className="mr-2 animate-spin" /> Confirming…</> : "Schedule appointment"}</Button>}
                <div className="flex items-center justify-center gap-2 border-t border-[#EEE9E6] pt-5 text-center text-xs text-[#948A8C]"><span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: page.brand_color }} /> Secure scheduling by LV Branding</div>
              </form>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
