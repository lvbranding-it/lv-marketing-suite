import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, ExternalLink, Camera, Clock, CheckCircle2, Eye, Sparkles, QrCode, Edit } from "lucide-react";
import { format } from "date-fns";
import AppShell from "@/components/layout/AppShell";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useEvents, useEventPhotoCounts, type LVEvent } from "@/hooks/useEvents";

// ── Helpers ───────────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  draft:     "bg-slate-100 text-slate-600 border-slate-200",
  active:    "bg-emerald-50 text-emerald-700 border-emerald-200",
  paused:    "bg-amber-50 text-amber-700 border-amber-200",
  completed: "bg-blue-50 text-blue-700 border-blue-200",
};

function QRButton({ slug }: { slug: string }) {
  const url = `${window.location.origin}/event/${slug}/upload`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=512x512&format=png&data=${encodeURIComponent(url)}`;

  const handleDownload = async () => {
    const res  = await fetch(qrSrc);
    const blob = await res.blob();
    const a    = Object.assign(document.createElement("a"), {
      href:     URL.createObjectURL(blob),
      download: `${slug}-qr.png`,
    });
    document.body.appendChild(a); a.click(); a.remove();
    URL.revokeObjectURL(a.href);
  };

  return (
    <button
      onClick={(e) => { e.stopPropagation(); handleDownload(); }}
      title="Download QR Code"
      className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
    >
      <QrCode size={14} />
    </button>
  );
}

// ── Event card ────────────────────────────────────────────────────────────────

function EventCard({ event, counts }: {
  event: LVEvent;
  counts?: { total: number; pending: number; approved: number };
}) {
  const navigate    = useNavigate();
  const uploadUrl   = `${window.location.origin}/event/${event.slug}/upload`;
  const liveUrl     = `${window.location.origin}/event/${event.slug}/live-screen`;

  return (
    <div
      className="bg-card border border-border rounded-xl p-5 space-y-4 hover:shadow-md hover:border-primary/20 transition-all cursor-pointer"
      onClick={() => navigate(`/event-experiences/${event.id}`)}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          {event.logo_url ? (
            <img src={event.logo_url} alt="" className="w-10 h-10 rounded-lg object-cover border border-border shrink-0" />
          ) : (
            <div
              className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
              style={{ backgroundColor: event.secondary_color }}
            >
              <Sparkles size={18} className="text-white" />
            </div>
          )}
          <div className="min-w-0">
            <h3 className="text-sm font-semibold text-foreground truncate">{event.name}</h3>
            {event.event_date && (
              <p className="text-xs text-muted-foreground">
                {format(new Date(event.event_date + "T00:00:00"), "MMMM d, yyyy")}
              </p>
            )}
          </div>
        </div>
        <Badge variant="outline" className={cn("text-[10px] shrink-0", STATUS_STYLES[event.status])}>
          {event.status}
        </Badge>
      </div>

      {/* Venue */}
      {(event.venue_name || event.city) && (
        <p className="text-xs text-muted-foreground">
          {[event.venue_name, event.city, event.state].filter(Boolean).join(", ")}
        </p>
      )}

      {/* Stats */}
      <div className="flex items-center gap-4 text-xs">
        <span className="flex items-center gap-1 text-muted-foreground">
          <Camera size={11} /> {counts?.total ?? 0} uploaded
        </span>
        {(counts?.pending ?? 0) > 0 && (
          <span className="flex items-center gap-1 text-amber-600 font-medium">
            <Clock size={11} /> {counts!.pending} pending
          </span>
        )}
        <span className="flex items-center gap-1 text-emerald-600">
          <CheckCircle2 size={11} /> {counts?.approved ?? 0} approved
        </span>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-border/60" onClick={(e) => e.stopPropagation()}>
        <Button
          size="sm"
          variant="outline"
          className="h-7 text-xs gap-1 flex-1"
          onClick={() => navigate(`/event-experiences/${event.id}/photos`)}
        >
          <Eye size={11} /> Moderate
        </Button>
        <Button
          size="sm"
          className="h-7 text-xs gap-1 flex-1 bg-rose-600 hover:bg-rose-700 text-white"
          onClick={() => window.open(liveUrl, "_blank")}
        >
          <ExternalLink size={11} /> Live Screen
        </Button>
        <button
          title="Edit event"
          className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
          onClick={() => navigate(`/event-experiences/${event.id}`)}
        >
          <Edit size={14} />
        </button>
        <a
          href={uploadUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="Open upload page"
          className="p-1.5 rounded text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
        >
          <ExternalLink size={14} />
        </a>
        <QRButton slug={event.slug} />
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EventExperiences() {
  const navigate            = useNavigate();
  const { data: events = [], isLoading } = useEvents();
  const [statusFilter, setStatusFilter] = useState<string>("all");

  const ids     = events.map((e) => e.id);
  const { data: counts = {} } = useEventPhotoCounts(ids);

  const filtered = statusFilter === "all"
    ? events
    : events.filter((e) => e.status === statusFilter);

  const FILTERS = ["all", "active", "draft", "paused", "completed"];

  return (
    <AppShell>
      <Header
        title="Event Experiences"
        subtitle="Live event engagement — scan, capture, moderate, display"
        actions={
          <Button size="sm" onClick={() => navigate("/event-experiences/new")} className="gap-1.5">
            <Plus size={14} /> New Event
          </Button>
        }
      />

      <div className="p-3 sm:p-6 max-w-6xl mx-auto space-y-4">
        {/* Filters */}
        <div className="flex items-center gap-2 flex-wrap">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setStatusFilter(f)}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-medium transition-colors border",
                statusFilter === f
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground hover:border-foreground/30"
              )}
            >
              {f.charAt(0).toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-52 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-4">
            <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center">
              <Sparkles size={32} className="text-primary" />
            </div>
            <div>
              <p className="text-base font-semibold">No events yet</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                Create your first live event experience — attendees scan a QR code, upload photos, and see them on the big screen.
              </p>
            </div>
            <Button onClick={() => navigate("/event-experiences/new")} className="gap-1.5">
              <Plus size={14} /> Create First Event
            </Button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((event) => (
              <EventCard key={event.id} event={event} counts={counts[event.id]} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
