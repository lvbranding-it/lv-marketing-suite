import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Play, Pause, SkipForward, SkipBack, QrCode as QrCodeIcon,
  Image as ImageIcon, Monitor, Star, ChevronDown, ChevronUp,
  Settings,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEventBySlug } from "@/hooks/useEvents";
import { useApprovedEventPhotos, getPhotoUrl, type EventPhoto } from "@/hooks/useEventPhotos";
import { cn } from "@/lib/utils";

// ── Types ─────────────────────────────────────────────────────────────────────

type ScreenMode = "slideshow" | "holding" | "qr" | "featured";

// ── Loading/idle placeholders ─────────────────────────────────────────────────

function HoldingScreen({ headline, subheadline, primaryColor, secondaryColor, logoUrl }: {
  headline?: string | null;
  subheadline?: string | null;
  primaryColor: string;
  secondaryColor: string;
  logoUrl?: string | null;
}) {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 text-white"
      style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)` }}
    >
      {logoUrl && <img src={logoUrl} alt="" className="h-24 w-auto object-contain opacity-90 mb-2" />}
      <div className="text-center px-8">
        <h1 className="text-5xl font-extrabold mb-3 drop-shadow-lg">{headline ?? "Live Event Experience"}</h1>
        {subheadline && <p className="text-2xl opacity-80 font-light">{subheadline}</p>}
      </div>
      <p className="text-lg opacity-60 animate-pulse mt-4">
        Photos will appear here soon. Scan the QR code and share your moment.
      </p>
    </div>
  );
}

function QRScreen({ slug, primaryColor, secondaryColor, headline, logoUrl }: {
  slug: string;
  primaryColor: string;
  secondaryColor: string;
  headline?: string | null;
  logoUrl?: string | null;
}) {
  const uploadUrl = `${window.location.origin}/event/${slug}/upload`;
  const qrSrc     = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&format=png&color=FFFFFF&bgcolor=${primaryColor.replace("#","")}&data=${encodeURIComponent(uploadUrl)}`;

  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 text-white"
      style={{ background: `linear-gradient(135deg, ${primaryColor} 0%, ${secondaryColor} 100%)` }}
    >
      {logoUrl && <img src={logoUrl} alt="" className="h-16 w-auto object-contain opacity-90" />}
      <h2 className="text-4xl font-bold text-center drop-shadow">{headline ?? "Share Your Moment"}</h2>
      <div className="bg-white/10 backdrop-blur-sm p-5 rounded-3xl border border-white/20">
        <img src={qrSrc} alt="QR Code" className="w-56 h-56 rounded-xl" />
      </div>
      <p className="text-2xl font-semibold opacity-90">Scan to see your photo on the big screen</p>
      <p className="text-base opacity-50 font-mono">{uploadUrl}</p>
    </div>
  );
}

// ── Photo slide ───────────────────────────────────────────────────────────────

function PhotoSlide({ photo, event, visible }: {
  photo: EventPhoto;
  event: ReturnType<typeof useEventBySlug>["data"];
  visible: boolean;
}) {
  if (!event) return null;
  const url = getPhotoUrl(photo.image_path);

  return (
    <div className={cn(
      "absolute inset-0 transition-opacity duration-700",
      visible ? "opacity-100" : "opacity-0 pointer-events-none"
    )}>
      {/* Photo — fills the inner area */}
      <img src={url} alt="" className="absolute inset-0 w-full h-full object-contain bg-black" />

      {/* Caption overlay */}
      {event.show_captions && (photo.caption || (event.show_names && photo.attendee_name)) && (
        <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/80 to-transparent px-6 py-4">
          {event.show_names && photo.attendee_name && (
            <p className="text-white font-semibold text-xl">{photo.attendee_name}</p>
          )}
          {event.show_captions && photo.caption && (
            <p className="text-white/90 text-lg">{photo.caption}</p>
          )}
        </div>
      )}
    </div>
  );
}

// ── Operator controls ─────────────────────────────────────────────────────────

function OperatorControls({ mode, setMode, paused, setPaused, onNext, onPrev, photoCount }: {
  mode: ScreenMode;
  setMode: (m: ScreenMode) => void;
  paused: boolean;
  setPaused: (v: boolean) => void;
  onNext: () => void;
  onPrev: () => void;
  photoCount: number;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {/* Toggle button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className="bg-black/70 backdrop-blur-sm text-white rounded-full p-3 shadow-lg hover:bg-black/90 transition-colors"
        title="Operator Controls"
      >
        <Settings size={20} />
      </button>

      {/* Panel */}
      {open && (
        <div className="absolute bottom-14 right-0 bg-black/80 backdrop-blur-sm text-white rounded-2xl p-4 w-72 shadow-2xl space-y-3 border border-white/10">
          <p className="text-xs font-semibold uppercase tracking-wider opacity-60 mb-1">Operator Controls</p>

          {/* Mode */}
          <div className="grid grid-cols-2 gap-1.5">
            {([
              { m: "slideshow", icon: <Play size={12} />,    label: "Slideshow" },
              { m: "holding",   icon: <Monitor size={12} />, label: "Holding" },
              { m: "qr",        icon: <QrCodeIcon size={12} />, label: "QR Code" },
              { m: "featured",  icon: <Star size={12} />,    label: "Featured" },
            ] as { m: ScreenMode; icon: React.ReactNode; label: string }[]).map(({ m, icon, label }) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-colors",
                  mode === m ? "bg-rose-600 text-white" : "bg-white/10 hover:bg-white/20"
                )}
              >
                {icon} {label}
              </button>
            ))}
          </div>

          {/* Playback */}
          <div className="flex items-center gap-2">
            <button onClick={onPrev}  className="flex-1 bg-white/10 hover:bg-white/20 rounded-lg p-2 flex items-center justify-center transition-colors"><SkipBack  size={14} /></button>
            <button onClick={() => setPaused(!paused)} className="flex-1 bg-white/10 hover:bg-white/20 rounded-lg p-2 flex items-center justify-center transition-colors">
              {paused ? <Play size={14} /> : <Pause size={14} />}
            </button>
            <button onClick={onNext}  className="flex-1 bg-white/10 hover:bg-white/20 rounded-lg p-2 flex items-center justify-center transition-colors"><SkipForward size={14} /></button>
          </div>

          <p className="text-[10px] opacity-40 text-center">{photoCount} approved photo{photoCount !== 1 ? "s" : ""}</p>
        </div>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EventLiveScreen() {
  const { eventSlug }               = useParams<{ eventSlug: string }>();
  const { data: event }             = useEventBySlug(eventSlug);
  const { data: photos = [], refetch } = useApprovedEventPhotos(event?.id);

  const [mode, setMode]             = useState<ScreenMode>("slideshow");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [paused, setPaused]         = useState(false);
  const intervalRef                 = useRef<ReturnType<typeof setInterval> | null>(null);

  const intervalSec = event?.slideshow_interval_seconds ?? 7;

  // ── Realtime subscription ─────────────────────────────────────────────────

  useEffect(() => {
    if (!event?.id) return;
    const channel = supabase
      .channel(`live-screen-${event.id}`)
      .on("postgres_changes", {
        event: "*",
        schema: "public",
        table: "event_photos",
        filter: `event_id=eq.${event.id}`,
      }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [event?.id, refetch]);

  // ── Slideshow timer ───────────────────────────────────────────────────────

  const advance = useCallback(() => {
    setCurrentIdx((i) => (photos.length > 1 ? (i + 1) % photos.length : 0));
  }, [photos.length]);

  const goBack = useCallback(() => {
    setCurrentIdx((i) => (photos.length > 1 ? (i - 1 + photos.length) % photos.length : 0));
  }, [photos.length]);

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!paused && mode === "slideshow" && photos.length > 1) {
      intervalRef.current = setInterval(advance, intervalSec * 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [paused, mode, photos.length, intervalSec, advance]);

  // Clamp index
  useEffect(() => {
    if (currentIdx >= photos.length && photos.length > 0) setCurrentIdx(0);
  }, [photos.length, currentIdx]);

  if (!event) {
    return (
      <div className="min-h-screen bg-black flex items-center justify-center text-white text-xl">
        Loading…
      </div>
    );
  }

  const { primary_color, secondary_color, logo_url, screen_headline, screen_subheadline, lower_third_text, sponsor_message, slug, show_logo, show_qr_code_on_screen, show_sponsors } = event;
  const currentPhoto = photos[currentIdx] ?? null;

  return (
    <div className="min-h-screen bg-black flex items-center justify-center overflow-hidden">
      {/* 4:3 container */}
      <div
        className="relative w-full"
        style={{ maxWidth: "min(100vw, 133.33vh)", aspectRatio: "4/3" }}
      >
        {/* ── Header bar ── */}
        <div
          className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between px-6 py-3"
          style={{ backgroundColor: primary_color, minHeight: "10%" }}
        >
          <div className="flex items-center gap-3">
            {show_logo && logo_url && (
              <img src={logo_url} alt="" className="h-10 w-auto object-contain" />
            )}
            <div>
              {screen_headline && (
                <p className="text-white font-extrabold text-xl leading-tight drop-shadow">{screen_headline}</p>
              )}
              {screen_subheadline && (
                <p className="text-white/70 text-sm leading-tight">{screen_subheadline}</p>
              )}
            </div>
          </div>
          {show_qr_code_on_screen && slug && (
            <div className="flex flex-col items-center gap-0.5 opacity-90">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=80x80&format=png&color=FFFFFF&bgcolor=${primary_color.replace("#", "")}&data=${encodeURIComponent(`${window.location.origin}/event/${slug}/upload`)}`}
                alt="QR"
                className="w-14 h-14 rounded"
              />
              <p className="text-white text-[8px] opacity-60">Scan to share</p>
            </div>
          )}
        </div>

        {/* ── Main content area ── */}
        <div className="absolute top-[10%] bottom-[12%] left-0 right-0 overflow-hidden">
          {mode === "holding" && (
            <HoldingScreen headline={screen_headline} subheadline={screen_subheadline} primaryColor={primary_color} secondaryColor={secondary_color} logoUrl={logo_url} />
          )}
          {mode === "qr" && (
            <QRScreen slug={slug} primaryColor={primary_color} secondaryColor={secondary_color} headline={screen_headline} logoUrl={logo_url} />
          )}
          {(mode === "slideshow" || mode === "featured") && (
            <>
              {photos.length === 0 ? (
                <HoldingScreen headline={screen_headline} subheadline={screen_subheadline} primaryColor={primary_color} secondaryColor={secondary_color} logoUrl={logo_url} />
              ) : (
                photos.map((photo, i) => (
                  <PhotoSlide
                    key={photo.id}
                    photo={photo}
                    event={event}
                    visible={i === currentIdx}
                  />
                ))
              )}
            </>
          )}
        </div>

        {/* ── Footer bar ── */}
        <div
          className="absolute bottom-0 left-0 right-0 z-20 flex items-center justify-between px-5 py-2"
          style={{ backgroundColor: secondary_color, minHeight: "12%" }}
        >
          {/* Lower third */}
          <div className="flex-1 min-w-0">
            {lower_third_text && (
              <p className="text-white font-semibold text-lg truncate drop-shadow">{lower_third_text}</p>
            )}
            {show_sponsors && sponsor_message && (
              <p className="text-white/60 text-sm">{sponsor_message}</p>
            )}
          </div>

          {/* Progress dots */}
          {mode === "slideshow" && photos.length > 1 && (
            <div className="flex items-center gap-1.5 shrink-0 ml-4">
              {photos.slice(0, 12).map((_, i) => (
                <div
                  key={i}
                  onClick={() => setCurrentIdx(i)}
                  className={cn(
                    "rounded-full transition-all cursor-pointer",
                    i === currentIdx ? "w-3 h-3 bg-white" : "w-2 h-2 bg-white/30"
                  )}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Operator controls */}
      <OperatorControls
        mode={mode}
        setMode={setMode}
        paused={paused}
        setPaused={setPaused}
        onNext={advance}
        onPrev={goBack}
        photoCount={photos.length}
      />
    </div>
  );
}
