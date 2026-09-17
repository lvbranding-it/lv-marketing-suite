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

  if (loading) return <main className="min-h-screen grid place-items-center bg-zinc-50"><Loader2 className="animate-spin text-zinc-400" /></main>;
  if (!page) return <main className="min-h-screen grid place-items-center bg-zinc-50 p-6"><p className="text-zinc-600">{error}</p></main>;

  return (
    <main className={`min-h-screen bg-zinc-50 ${embedded ? "p-2" : "px-4 py-10 sm:py-16"}`}>
      <section className="mx-auto max-w-5xl overflow-hidden rounded-3xl border border-zinc-200 bg-white shadow-xl shadow-zinc-200/50">
        <div className="grid md:grid-cols-[0.85fr_1.4fr]">
          <aside className="p-7 text-white sm:p-10" style={{ background: `linear-gradient(145deg, ${page.brand_color}, #18181b 88%)` }}>
            <LVLogo size={48} className="mb-10" />
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.22em] text-white/65">LV Branding</p>
            <h1 className="text-3xl font-bold leading-tight sm:text-4xl">{page.title}</h1>
            <p className="mt-4 leading-relaxed text-white/75">{page.description}</p>
            <div className="mt-8 space-y-3 text-sm text-white/80">
              <p className="flex items-center gap-2"><Clock3 size={17} /> {page.duration_minutes} minutes</p>
              <p className="flex items-center gap-2"><CalendarDays size={17} /> Times shown in {page.timezone.replace("_", " ")}</p>
              {selectedHost && <p className="flex items-center gap-2"><UserRound size={17} /> With {selectedHost.display_name}</p>}
            </div>
          </aside>

          <div className="p-6 sm:p-10">
            {confirmed ? (
              <div className="flex min-h-[520px] flex-col items-center justify-center text-center">
                <CheckCircle2 size={70} className="text-emerald-500" />
                <h2 className="mt-6 text-3xl font-bold text-zinc-900">Appointment confirmed</h2>
                <p className="mt-3 max-w-md text-zinc-600">{page.confirmation_message}</p>
                {selectedSlot && (
                  <div className="mt-7 rounded-2xl bg-zinc-50 px-6 py-4 text-sm text-zinc-700">
                    <strong>{dateLabel(selectedSlot.starts_at, page.timezone)}</strong> at {timeLabel(selectedSlot.starts_at, page.timezone)} with {selectedHost?.display_name}
                  </div>
                )}
                <Button className="mt-8 gap-2" style={{ backgroundColor: page.brand_color }} asChild>
                  <a href={page.confirmation_url || "https://www.lvbranding.com"} target="_top" rel="noopener noreferrer">
                    Visit LV Branding <ExternalLink size={16} />
                  </a>
                </Button>
              </div>
            ) : (
              <form onSubmit={submit} className="space-y-7">
                <div>
                  <Label className="text-sm font-semibold">Choose a team member</Label>
                  <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    {page.hosts.map((host) => (
                      <button key={host.id} type="button" onClick={() => setHostId(host.id)}
                        className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${hostId === host.id ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 hover:border-zinc-400"}`}>
                        <span className={`grid h-9 w-9 place-items-center rounded-full ${hostId === host.id ? "bg-white/15" : "bg-zinc-100"}`}>
                          {host.avatar_url ? <img src={host.avatar_url} className="h-9 w-9 rounded-full object-cover" alt="" /> : <UserRound size={17} />}
                        </span>
                        <span><span className="block font-medium">{host.display_name}</span>{host.is_default && <span className="text-xs opacity-65">Recommended</span>}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <Label className="text-sm font-semibold">Choose a date</Label>
                  {slotsLoading ? <div className="mt-4 flex items-center gap-2 text-sm text-zinc-500"><Loader2 size={16} className="animate-spin" /> Checking calendars…</div> :
                    grouped.length ? <div className="mt-3 flex gap-2 overflow-x-auto pb-2">{grouped.slice(0, 14).map((group) => (
                      <button key={group.key} type="button" onClick={() => { setSelectedDate(group.key); setSelectedStart(""); }}
                        className={`min-w-[96px] rounded-xl border px-3 py-3 text-sm font-medium transition ${selectedDate === group.key ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 hover:border-zinc-400"}`}>
                        {group.label}
                      </button>
                    ))}</div> : <p className="mt-3 text-sm text-zinc-500">No open times are currently available.</p>}
                </div>

                {selectedDate && (
                  <div>
                    <Label className="text-sm font-semibold">Choose a time</Label>
                    <div className="mt-3 grid grid-cols-3 gap-2 sm:grid-cols-4">
                      {visibleSlots.map((slot) => (
                        <button key={slot.starts_at} type="button" onClick={() => setSelectedStart(slot.starts_at)}
                          className={`rounded-lg border px-2 py-2.5 text-sm font-medium ${selectedStart === slot.starts_at ? "border-zinc-900 bg-zinc-900 text-white" : "border-zinc-200 hover:border-zinc-400"}`}>
                          {timeLabel(slot.starts_at, page.timezone)}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {selectedStart && (
                  <div className="grid gap-4 border-t border-zinc-100 pt-6 sm:grid-cols-2">
                    <div className="sm:col-span-2"><Label htmlFor="appointment-name">Name</Label><Input id="appointment-name" required maxLength={160} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="mt-1.5" /></div>
                    <div><Label htmlFor="appointment-email">Email</Label><Input id="appointment-email" required type="email" maxLength={320} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1.5" /></div>
                    <div><Label htmlFor="appointment-phone">Phone</Label><Input id="appointment-phone" type="tel" maxLength={40} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} className="mt-1.5" /></div>
                    <div className="sm:col-span-2"><Label htmlFor="appointment-company">Company</Label><Input id="appointment-company" maxLength={160} value={form.company} onChange={(e) => setForm({ ...form, company: e.target.value })} className="mt-1.5" /></div>
                    <div className="sm:col-span-2"><Label htmlFor="appointment-notes">Tell us about your project</Label><Textarea id="appointment-notes" required maxLength={3000} rows={4} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="mt-1.5" /></div>
                  </div>
                )}

                {error && <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">{error}</p>}
                {selectedStart && <Button type="submit" disabled={submitting} className="h-12 w-full text-base" style={{ backgroundColor: page.brand_color }}>{submitting ? <><Loader2 size={18} className="mr-2 animate-spin" /> Confirming…</> : "Schedule appointment"}</Button>}
                <p className="text-center text-xs text-zinc-400">Secure scheduling powered by LV Branding</p>
              </form>
            )}
          </div>
        </div>
      </section>
    </main>
  );
}
