import { useCallback, useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, Clock3, Copy, ExternalLink, Link2, Loader2, Plus, RefreshCw, Settings2, Trash2, Unplug, UserRound } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";

type PageRow = {
  id: string; org_id: string; slug: string; title: string; description: string; timezone: string;
  duration_minutes: number; buffer_minutes: number; minimum_notice_hours: number; booking_window_days: number;
  confirmation_message: string; confirmation_url: string; brand_color: string; is_active: boolean;
};
type HostRow = { id: string; page_id: string; org_id: string; user_id: string | null; display_name: string; email: string; avatar_url: string | null; is_enabled: boolean; is_default: boolean };
type AvailabilityRow = { id: string; host_id: string; weekday: number; start_time: string; end_time: string };
type BookingRow = { id: string; host_id: string; guest_name: string; guest_email: string; company: string | null; project_notes: string | null; starts_at: string; ends_at: string; status: string; meeting_url: string | null; provider: string | null };
type ConnectionRow = { host_id: string; provider: "google" | "microsoft"; account_email: string | null; connected_at: string };

const DAYS = [
  { value: 1, label: "Monday" }, { value: 2, label: "Tuesday" }, { value: 3, label: "Wednesday" },
  { value: 4, label: "Thursday" }, { value: 5, label: "Friday" }, { value: 6, label: "Saturday" }, { value: 7, label: "Sunday" },
];

const formatBooking = (iso: string, timezone: string) => new Intl.DateTimeFormat("en-US", {
  timeZone: timezone, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
}).format(new Date(iso));

export default function AppointmentSchedulerAdmin() {
  const { org, loading: orgLoading } = useOrg();
  const { user } = useAuth();
  const { toast } = useToast();
  const [page, setPage] = useState<PageRow | null>(null);
  const [hosts, setHosts] = useState<HostRow[]>([]);
  const [availability, setAvailability] = useState<AvailabilityRow[]>([]);
  const [bookings, setBookings] = useState<BookingRow[]>([]);
  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState("");
  const [hostDraft, setHostDraft] = useState({ display_name: "", email: "" });
  const [blockDraft, setBlockDraft] = useState({ host_id: "", date: "", start: "09:00", end: "09:30", reason: "" });
  const [availabilityDraft, setAvailabilityDraft] = useState({ host_id: "", weekdays: [1, 2, 3, 4, 5], start: "09:00", end: "17:00" });

  const load = useCallback(async () => {
    if (!org?.id) return;
    setLoading(true);
    const ensure = await (supabase as any).rpc("ensure_appointment_booking_page", {
      p_org_id: org.id,
      p_slug: "lv-branding-consultation",
      p_admin_email: "admin@lvbranding.com",
    });
    if (ensure.error) {
      toast({ variant: "destructive", title: "Appointment calendar unavailable", description: ensure.error.message });
      setLoading(false);
      return;
    }
    const pageResult = await (supabase as any).from("appointment_booking_pages").select("*").eq("org_id", org.id).single();
    if (pageResult.error) {
      toast({ variant: "destructive", title: "Could not load calendar", description: pageResult.error.message });
      setLoading(false);
      return;
    }
    const nextPage = pageResult.data as PageRow;
    const [hostsResult, availabilityResult, bookingsResult, connectionsResult] = await Promise.all([
      (supabase as any).from("appointment_hosts").select("*").eq("page_id", nextPage.id).order("is_default", { ascending: false }).order("display_name"),
      (supabase as any).from("appointment_host_availability").select("*").eq("org_id", org.id).order("weekday"),
      (supabase as any).from("appointment_bookings").select("*").eq("org_id", org.id).order("starts_at", { ascending: true }),
      (supabase as any).rpc("appointment_calendar_connection_status", { p_org_id: org.id }),
    ]);
    setPage(nextPage);
    setHosts(hostsResult.data || []);
    setAvailability(availabilityResult.data || []);
    setBookings(bookingsResult.data || []);
    setConnections(connectionsResult.data || []);
    const loadedHosts = (hostsResult.data || []) as HostRow[];
    const loadedAvailability = (availabilityResult.data || []) as AvailabilityRow[];
    const firstHost = loadedHosts[0]?.id || "";
    setBlockDraft((draft) => ({ ...draft, host_id: draft.host_id || firstHost }));
    setAvailabilityDraft((draft) => {
      const hostId = loadedHosts.some((host) => host.id === draft.host_id) ? draft.host_id : firstHost;
      const rows = loadedAvailability.filter((row) => row.host_id === hostId);
      return {
        host_id: hostId,
        weekdays: rows.map((row) => row.weekday),
        start: rows[0]?.start_time?.slice(0, 5) || "09:00",
        end: rows[0]?.end_time?.slice(0, 5) || "17:00",
      };
    });
    setLoading(false);
  }, [org?.id, toast]);

  useEffect(() => { if (!orgLoading) void load(); }, [orgLoading, load]);

  const publicUrl = page ? `${window.location.origin}/book/${page.slug}` : "";
  const embedCode = page ? `<iframe src="${publicUrl}?embed=1" title="Schedule a consultation with LV Branding" width="100%" height="820" style="border:0;border-radius:24px" loading="lazy"></iframe>` : "";

  const copy = async (value: string, label: string) => {
    await navigator.clipboard.writeText(value);
    setCopied(label);
    setTimeout(() => setCopied(""), 1800);
  };

  const savePage = async () => {
    if (!page) return;
    setSaving(true);
    const { id, org_id: _orgId, ...updates } = page;
    const { error } = await (supabase as any).from("appointment_booking_pages").update(updates).eq("id", id);
    setSaving(false);
    toast(error ? { variant: "destructive", title: "Settings were not saved", description: error.message } : { title: "Calendar settings saved" });
    if (!error) void load();
  };

  const addHost = async () => {
    if (!page || !org || !hostDraft.display_name.trim() || !hostDraft.email.trim()) return;
    const { data, error } = await (supabase as any).from("appointment_hosts").insert({
      page_id: page.id, org_id: org.id, display_name: hostDraft.display_name.trim(), email: hostDraft.email.trim().toLowerCase(), is_enabled: true, is_default: false,
    }).select("id").single();
    if (error) return toast({ variant: "destructive", title: "Team member was not added", description: error.message });
    await (supabase as any).from("appointment_host_availability").insert([1, 2, 3, 4, 5].map((weekday) => ({ host_id: data.id, org_id: org.id, weekday, start_time: "09:00", end_time: "17:00" })));
    setHostDraft({ display_name: "", email: "" });
    toast({ title: "Team member added", description: "Weekday availability defaults to 9:00 AM–5:00 PM." });
    void load();
  };

  const updateHost = async (host: HostRow, updates: Partial<HostRow>) => {
    if (!page) return;
    if (updates.is_default) {
      await (supabase as any).from("appointment_hosts").update({ is_default: false }).eq("page_id", page.id).neq("id", host.id);
    }
    const { error } = await (supabase as any).from("appointment_hosts").update(updates).eq("id", host.id);
    if (error) toast({ variant: "destructive", title: "Team member was not updated", description: error.message });
    else void load();
  };

  const removeHost = async (host: HostRow) => {
    if (host.is_default) return toast({ variant: "destructive", title: "Choose a different default before removing Admin." });
    const { error } = await (supabase as any).from("appointment_hosts").delete().eq("id", host.id);
    if (error) toast({ variant: "destructive", title: "Team member was not removed", description: "Hosts with appointments are retained for booking history. Disable this host instead." });
    else void load();
  };

  const saveAvailability = async () => {
    if (!org || !availabilityDraft.host_id || !availabilityDraft.weekdays.length) return;
    setSaving(true);
    const remove = await (supabase as any).from("appointment_host_availability").delete().eq("host_id", availabilityDraft.host_id);
    const add = remove.error ? remove : await (supabase as any).from("appointment_host_availability").insert(availabilityDraft.weekdays.map((weekday) => ({
      host_id: availabilityDraft.host_id, org_id: org.id, weekday, start_time: availabilityDraft.start, end_time: availabilityDraft.end,
    })));
    setSaving(false);
    toast(add.error ? { variant: "destructive", title: "Availability was not saved", description: add.error.message } : { title: "Availability saved" });
    if (!add.error) void load();
  };

  const addBlock = async () => {
    if (!org || !page || !blockDraft.host_id || !blockDraft.date) return;
    if (blockDraft.end <= blockDraft.start) return toast({ variant: "destructive", title: "The end time must be after the start time." });
    const { error } = await (supabase as any).rpc("create_appointment_busy_block", {
      p_host_id: blockDraft.host_id, p_local_date: blockDraft.date, p_start_time: blockDraft.start,
      p_end_time: blockDraft.end, p_reason: blockDraft.reason || null,
    });
    toast(error ? { variant: "destructive", title: "Time was not blocked", description: error.message } : { title: "Time blocked" });
    if (!error) setBlockDraft((draft) => ({ ...draft, date: "", reason: "" }));
  };

  const connectCalendar = async (host: HostRow, provider: "google" | "microsoft") => {
    const { data, error } = await supabase.functions.invoke("appointment-calendar-oauth", { body: { action: "start", provider, host_id: host.id } });
    if (error || !data?.url) return toast({ variant: "destructive", title: `${provider === "google" ? "Google" : "Microsoft 365"} connection needs configuration`, description: data?.error || error?.message || "Add the provider credentials to Supabase, then try again." });
    window.location.assign(data.url);
  };

  const disconnect = async (hostId: string) => {
    const { error } = await (supabase as any).rpc("disconnect_appointment_calendar", { p_host_id: hostId });
    toast(error ? { variant: "destructive", title: "Calendar was not disconnected", description: error.message } : { title: "Calendar disconnected" });
    if (!error) void load();
  };

  const upcoming = useMemo(() => bookings.filter((booking) => booking.status === "confirmed" && new Date(booking.ends_at) >= new Date()), [bookings]);
  const past = useMemo(() => bookings.filter((booking) => booking.status !== "confirmed" || new Date(booking.ends_at) < new Date()), [bookings]);

  if (loading || orgLoading) return <AppShell><div className="grid min-h-[60vh] place-items-center"><Loader2 className="animate-spin text-muted-foreground" /></div></AppShell>;
  if (!page) return <AppShell><Header title="Appointment Calendar" subtitle="The scheduler could not be initialized." /></AppShell>;

  return (
    <AppShell>
      <Header title="Appointment Calendar" subtitle="Schedule website prospects, route them to your team, and keep calendars in sync." />
      <div className="space-y-6 p-4 sm:p-6">
        <div className="grid gap-4 lg:grid-cols-[1fr_auto]">
          <div className="rounded-2xl border bg-card p-5">
            <div className="flex flex-wrap items-center gap-3">
              <div className="grid h-11 w-11 place-items-center rounded-xl bg-primary/10 text-primary"><CalendarDays size={22} /></div>
              <div className="min-w-0 flex-1"><p className="font-semibold">Public booking page</p><p className="truncate text-sm text-muted-foreground">{publicUrl}</p></div>
              <Badge variant={page.is_active ? "default" : "secondary"}>{page.is_active ? "Live" : "Paused"}</Badge>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => copy(publicUrl, "link")} className="gap-2">{copied === "link" ? <Check size={15} /> : <Copy size={15} />} Copy link</Button>
              <Button variant="outline" size="sm" asChild className="gap-2"><a href={publicUrl} target="_blank" rel="noreferrer"><ExternalLink size={15} /> Preview</a></Button>
              <Button variant="outline" size="sm" onClick={() => copy(embedCode, "embed")} className="gap-2">{copied === "embed" ? <Check size={15} /> : <Copy size={15} />} Copy website embed</Button>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:w-64">
            <div className="rounded-2xl border bg-card p-4"><p className="text-2xl font-bold">{upcoming.length}</p><p className="text-xs text-muted-foreground">Upcoming</p></div>
            <div className="rounded-2xl border bg-card p-4"><p className="text-2xl font-bold">{hosts.filter((host) => host.is_enabled).length}</p><p className="text-xs text-muted-foreground">Active hosts</p></div>
          </div>
        </div>

        <Tabs defaultValue="appointments">
          <TabsList className="h-auto flex-wrap justify-start">
            <TabsTrigger value="appointments">Appointments</TabsTrigger>
            <TabsTrigger value="team">Team & calendars</TabsTrigger>
            <TabsTrigger value="availability">Availability</TabsTrigger>
            <TabsTrigger value="settings">Page settings</TabsTrigger>
          </TabsList>

          <TabsContent value="appointments" className="mt-5 space-y-4">
            {upcoming.length === 0 ? <div className="rounded-2xl border border-dashed p-12 text-center text-muted-foreground"><CalendarDays className="mx-auto mb-3" /><p>No upcoming appointments yet.</p></div> : upcoming.map((booking) => {
              const host = hosts.find((item) => item.id === booking.host_id);
              return <article key={booking.id} className="rounded-2xl border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div><h3 className="font-semibold">{booking.guest_name}</h3><p className="text-sm text-muted-foreground">{booking.guest_email}{booking.company ? ` · ${booking.company}` : ""}</p>{booking.project_notes && <p className="mt-3 max-w-2xl text-sm">{booking.project_notes}</p>}</div>
                  <div className="text-right"><p className="font-medium">{formatBooking(booking.starts_at, page.timezone)}</p><p className="text-sm text-muted-foreground">with {host?.display_name || "Team member"}</p>{booking.meeting_url && <a href={booking.meeting_url} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1 text-sm text-primary">Join meeting <ExternalLink size={13} /></a>}</div>
                </div>
              </article>;
            })}
            {past.length > 0 && <details className="rounded-2xl border bg-card"><summary className="cursor-pointer p-5 font-medium">Past and cancelled ({past.length})</summary><div className="border-t p-5 text-sm text-muted-foreground">{past.map((booking) => <p key={booking.id} className="py-1">{booking.guest_name} · {formatBooking(booking.starts_at, page.timezone)} · {booking.status}</p>)}</div></details>}
          </TabsContent>

          <TabsContent value="team" className="mt-5 space-y-5">
            <div className="grid gap-4 lg:grid-cols-2">
              {hosts.map((host) => {
                const connection = connections.find((item) => item.host_id === host.id);
                return <article key={host.id} className="rounded-2xl border bg-card p-5">
                  <div className="flex items-start gap-3"><div className="grid h-10 w-10 place-items-center rounded-full bg-muted"><UserRound size={18} /></div><div className="min-w-0 flex-1"><div className="flex flex-wrap items-center gap-2"><p className="font-semibold">{host.display_name}</p>{host.is_default && <Badge>Default</Badge>}</div><p className="truncate text-sm text-muted-foreground">{host.email}</p></div><Switch checked={host.is_enabled} onCheckedChange={(checked) => updateHost(host, { is_enabled: checked })} /></div>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {!host.is_default && <Button size="sm" variant="outline" onClick={() => updateHost(host, { is_default: true })}>Make default</Button>}
                    {connection ? <><Badge variant="outline" className="gap-1.5"><Link2 size={12} /> {connection.provider === "google" ? "Google" : "Microsoft 365"} · {connection.account_email}</Badge><Button size="sm" variant="ghost" onClick={() => disconnect(host.id)}><Unplug size={14} className="mr-1" /> Disconnect</Button></> : <><Button size="sm" variant="outline" onClick={() => connectCalendar(host, "google")}>Connect Google</Button><Button size="sm" variant="outline" onClick={() => connectCalendar(host, "microsoft")}>Connect Microsoft 365</Button></>}
                    {!host.is_default && <Button size="sm" variant="ghost" className="text-destructive" onClick={() => removeHost(host)}><Trash2 size={14} /></Button>}
                  </div>
                </article>;
              })}
            </div>
            <div className="rounded-2xl border bg-card p-5"><h3 className="font-semibold">Add a team member</h3><p className="mt-1 text-sm text-muted-foreground">Only enabled people appear on the public booking page. Admin remains the default until you change it.</p><div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto]"><Input placeholder="Display name" value={hostDraft.display_name} onChange={(e) => setHostDraft({ ...hostDraft, display_name: e.target.value })} /><Input type="email" placeholder="team@lvbranding.com" value={hostDraft.email} onChange={(e) => setHostDraft({ ...hostDraft, email: e.target.value })} /><Button onClick={addHost} className="gap-2"><Plus size={16} /> Add</Button></div></div>
          </TabsContent>

          <TabsContent value="availability" className="mt-5 grid gap-5 xl:grid-cols-2">
            <div className="rounded-2xl border bg-card p-5"><h3 className="font-semibold">Weekly hours</h3><div className="mt-4 space-y-4"><div><Label>Team member</Label><Select value={availabilityDraft.host_id} onValueChange={(value) => { const rows = availability.filter((row) => row.host_id === value); setAvailabilityDraft({ host_id: value, weekdays: rows.map((row) => row.weekday), start: rows[0]?.start_time?.slice(0,5) || "09:00", end: rows[0]?.end_time?.slice(0,5) || "17:00" }); }}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent>{hosts.map((host) => <SelectItem key={host.id} value={host.id}>{host.display_name}</SelectItem>)}</SelectContent></Select></div><div><Label>Available days</Label><div className="mt-2 flex flex-wrap gap-2">{DAYS.map((day) => <button type="button" key={day.value} onClick={() => setAvailabilityDraft((draft) => ({ ...draft, weekdays: draft.weekdays.includes(day.value) ? draft.weekdays.filter((value) => value !== day.value) : [...draft.weekdays, day.value].sort() }))} className={`rounded-lg border px-3 py-2 text-sm ${availabilityDraft.weekdays.includes(day.value) ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>{day.label.slice(0,3)}</button>)}</div></div><div className="grid grid-cols-2 gap-3"><div><Label>Start</Label><Input type="time" value={availabilityDraft.start} onChange={(e) => setAvailabilityDraft({ ...availabilityDraft, start: e.target.value })} className="mt-1.5" /></div><div><Label>End</Label><Input type="time" value={availabilityDraft.end} onChange={(e) => setAvailabilityDraft({ ...availabilityDraft, end: e.target.value })} className="mt-1.5" /></div></div><Button onClick={saveAvailability} disabled={saving}>Save weekly hours</Button></div></div>
            <div className="rounded-2xl border bg-card p-5"><h3 className="font-semibold">Block time</h3><p className="mt-1 text-sm text-muted-foreground">Use this for vacations, internal meetings, or any time that should not be bookable.</p><div className="mt-4 space-y-4"><div><Label>Team member</Label><Select value={blockDraft.host_id} onValueChange={(value) => setBlockDraft({ ...blockDraft, host_id: value })}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent>{hosts.map((host) => <SelectItem key={host.id} value={host.id}>{host.display_name}</SelectItem>)}</SelectContent></Select></div><div><Label>Date</Label><Input type="date" value={blockDraft.date} onChange={(e) => setBlockDraft({ ...blockDraft, date: e.target.value })} className="mt-1.5" /></div><div className="grid grid-cols-2 gap-3"><div><Label>Start</Label><Input type="time" value={blockDraft.start} onChange={(e) => setBlockDraft({ ...blockDraft, start: e.target.value })} className="mt-1.5" /></div><div><Label>End</Label><Input type="time" value={blockDraft.end} onChange={(e) => setBlockDraft({ ...blockDraft, end: e.target.value })} className="mt-1.5" /></div></div><div><Label>Reason (private)</Label><Input value={blockDraft.reason} onChange={(e) => setBlockDraft({ ...blockDraft, reason: e.target.value })} className="mt-1.5" /></div><Button onClick={addBlock} variant="outline" className="gap-2"><Clock3 size={16} /> Block time</Button></div></div>
          </TabsContent>

          <TabsContent value="settings" className="mt-5">
            <div className="max-w-3xl rounded-2xl border bg-card p-5 sm:p-7"><div className="mb-6 flex items-center gap-3"><Settings2 className="text-primary" /><div><h3 className="font-semibold">Booking page settings</h3><p className="text-sm text-muted-foreground">Changes update the public link and website embed immediately.</p></div></div><div className="grid gap-5 sm:grid-cols-2">
              <div className="sm:col-span-2"><Label>Page title</Label><Input value={page.title} onChange={(e) => setPage({ ...page, title: e.target.value })} className="mt-1.5" /></div>
              <div className="sm:col-span-2"><Label>Description</Label><Textarea rows={3} value={page.description} onChange={(e) => setPage({ ...page, description: e.target.value })} className="mt-1.5" /></div>
              <div><Label>Appointment length</Label><Select value={String(page.duration_minutes)} onValueChange={(value) => setPage({ ...page, duration_minutes: Number(value) })}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent>{[15,20,30,45,60,90,120].map((value) => <SelectItem key={value} value={String(value)}>{value} minutes</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Buffer between appointments</Label><Select value={String(page.buffer_minutes)} onValueChange={(value) => setPage({ ...page, buffer_minutes: Number(value) })}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent>{[0,5,10,15,30,60].map((value) => <SelectItem key={value} value={String(value)}>{value} minutes</SelectItem>)}</SelectContent></Select></div>
              <div><Label>Minimum notice</Label><Input type="number" min={0} max={720} value={page.minimum_notice_hours} onChange={(e) => setPage({ ...page, minimum_notice_hours: Number(e.target.value) })} className="mt-1.5" /></div>
              <div><Label>Booking window (days)</Label><Input type="number" min={1} max={365} value={page.booking_window_days} onChange={(e) => setPage({ ...page, booking_window_days: Number(e.target.value) })} className="mt-1.5" /></div>
              <div><Label>Timezone</Label><Select value={page.timezone} onValueChange={(value) => setPage({ ...page, timezone: value })}><SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="America/Chicago">Central Time</SelectItem><SelectItem value="America/New_York">Eastern Time</SelectItem><SelectItem value="America/Denver">Mountain Time</SelectItem><SelectItem value="America/Los_Angeles">Pacific Time</SelectItem><SelectItem value="America/Mexico_City">Mexico City</SelectItem></SelectContent></Select></div>
              <div><Label>Brand color</Label><div className="mt-1.5 flex gap-2"><Input type="color" value={page.brand_color} onChange={(e) => setPage({ ...page, brand_color: e.target.value })} className="w-16 p-1" /><Input value={page.brand_color} onChange={(e) => setPage({ ...page, brand_color: e.target.value })} /></div></div>
              <div className="sm:col-span-2"><Label>After-booking link</Label><Input type="url" value={page.confirmation_url} onChange={(e) => setPage({ ...page, confirmation_url: e.target.value })} className="mt-1.5" /></div>
              <div className="sm:col-span-2 flex items-center justify-between rounded-xl border p-4"><div><p className="font-medium">Public booking is active</p><p className="text-sm text-muted-foreground">Turn this off to pause new appointments.</p></div><Switch checked={page.is_active} onCheckedChange={(checked) => setPage({ ...page, is_active: checked })} /></div>
            </div><Button onClick={savePage} disabled={saving} className="mt-6 gap-2">{saving ? <RefreshCw size={16} className="animate-spin" /> : <Check size={16} />} Save settings</Button></div>
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
