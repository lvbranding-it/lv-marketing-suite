import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import {
  Play, Pause, SkipForward, SkipBack,
  QrCode as QrCodeIcon, Monitor, Star, Settings,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useEventBySlug } from "@/hooks/useEvents";
import { useApprovedEventPhotos, getPhotoUrl, type EventPhoto } from "@/hooks/useEventPhotos";
import { cn } from "@/lib/utils";

// ── Ken Burns animations (CSS injected) ───────────────────────────────────────

const KB_CSS = `
  @keyframes kb1{0%{transform:scale(1) translate(0%,0%)}100%{transform:scale(1.09) translate(-2%,-1%)}}
  @keyframes kb2{0%{transform:scale(1.09) translate(-2%,-1%)}100%{transform:scale(1) translate(2%,1%)}}
  @keyframes kb3{0%{transform:scale(1.06) translate(-3%,0%)}100%{transform:scale(1.06) translate(3%,.5%)}}
  @keyframes kb4{0%{transform:scale(1.06) translate(3%,1%)}100%{transform:scale(1) translate(-1.5%,-1%)}}
  @keyframes kb5{0%{transform:scale(1) translate(1%,1%)}100%{transform:scale(1.08) translate(-1%,-2%)}}
`;
const KB_NAMES = ["kb1", "kb2", "kb3", "kb4", "kb5"];

// ── Types ─────────────────────────────────────────────────────────────────────

type ScreenMode = "slideshow" | "holding" | "qr" | "featured";

// ── Blur slide (background + centered photo) ──────────────────────────────────

function BlurSlide({
  photoUrl,
  kbIndex,
  intervalSec,
  visible,
  caption,
  attendeeName,
  showCaption,
  showName,
}: {
  photoUrl:    string;
  kbIndex:     number;
  intervalSec: number;
  visible:     boolean;
  caption:     string | null;
  attendeeName: string | null;
  showCaption: boolean;
  showName:    boolean;
}) {
  const kb = KB_NAMES[kbIndex % KB_NAMES.length];
  const dur = `${intervalSec + 1}s`;

  return (
    <div
      className="absolute inset-0 transition-opacity"
      style={{
        opacity:          visible ? 1 : 0,
        transitionDuration: "900ms",
        transitionTimingFunction: "ease-in-out",
      }}
    >
      {/* Blurred background — fills screen, eliminates black bars */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage:    `url(${photoUrl})`,
          backgroundSize:     "cover",
          backgroundPosition: "center",
          filter:             "blur(48px) brightness(0.55) saturate(1.3)",
          transform:          "scale(1.12)", // prevents blur edge bleed
        }}
      />

      {/* Centred photo with Ken Burns */}
      <div className="absolute inset-0 flex items-center justify-center overflow-hidden">
        <img
          src={photoUrl}
          alt=""
          draggable={false}
          style={{
            maxWidth:          "88vw",
            maxHeight:         "88vh",
            objectFit:         "contain",
            boxShadow:         "0 32px 80px rgba(0,0,0,.55)",
            borderRadius:      "4px",
            animation:         visible ? `${kb} ${dur} ease-in-out forwards` : "none",
          }}
        />
      </div>

      {/* Caption overlay */}
      {(showCaption && caption) || (showName && attendeeName) ? (
        <div
          className="absolute bottom-0 left-0 right-0 px-10 py-6 flex flex-col items-start gap-0.5"
          style={{
            background: "linear-gradient(to top, rgba(0,0,0,.75) 0%, transparent 100%)",
          }}
        >
          {showName && attendeeName && (
            <span className="text-white font-bold text-2xl drop-shadow-lg">{attendeeName}</span>
          )}
          {showCaption && caption && (
            <span className="text-white/80 text-xl drop-shadow">{caption}</span>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ── Holding screen ────────────────────────────────────────────────────────────

function HoldingScreen({
  primaryColor, secondaryColor, logoUrl, headline, subheadline,
}: {
  primaryColor:  string;
  secondaryColor: string;
  logoUrl?:      string | null;
  headline?:     string | null;
  subheadline?:  string | null;
}) {
  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-8"
      style={{
        background: `linear-gradient(140deg, ${primaryColor} 0%, ${secondaryColor} 100%)`,
      }}
    >
      {logoUrl && (
        <img src={logoUrl} alt="" className="h-28 w-auto object-contain opacity-90 drop-shadow-2xl" />
      )}
      <div className="text-center px-16">
        <h1 className="text-white font-extrabold text-6xl drop-shadow-lg mb-3">
          {headline ?? "Live Event Experience"}
        </h1>
        {subheadline && (
          <p className="text-white/70 text-3xl font-light">{subheadline}</p>
        )}
      </div>
      <p className="text-white/40 text-2xl animate-pulse mt-4">
        Scan the QR code and share your moment →
      </p>
    </div>
  );
}

// ── QR Screen ─────────────────────────────────────────────────────────────────

function QRScreen({
  slug, primaryColor, secondaryColor, headline, logoUrl,
}: {
  slug:           string;
  primaryColor:   string;
  secondaryColor: string;
  headline?:      string | null;
  logoUrl?:       string | null;
}) {
  const uploadUrl = `${window.location.origin}/event/${slug}/upload`;
  const qrSrc     = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&format=png&color=FFFFFF&bgcolor=${primaryColor.replace("#", "")}&data=${encodeURIComponent(uploadUrl)}`;

  return (
    <div
      className="absolute inset-0 flex flex-col items-center justify-center gap-8"
      style={{ background: `linear-gradient(140deg, ${primaryColor} 0%, ${secondaryColor} 100%)` }}
    >
      {logoUrl && <img src={logoUrl} alt="" className="h-20 w-auto object-contain opacity-90" />}
      <h2 className="text-white font-extrabold text-5xl text-center drop-shadow">{headline ?? "Share Your Moment"}</h2>
      <div className="bg-white/10 backdrop-blur p-6 rounded-3xl border border-white/20 shadow-2xl">
        <img src={qrSrc} alt="QR Code" className="w-72 h-72 rounded-2xl" />
      </div>
      <p className="text-white text-3xl font-semibold opacity-90">Scan to see your photo on the big screen</p>
      <p className="text-white/40 text-lg font-mono">{uploadUrl}</p>
    </div>
  );
}

// ── Operator controls ─────────────────────────────────────────────────────────

function OperatorControls({
  mode, setMode, paused, setPaused, onNext, onPrev, photoCount, visible,
}: {
  mode:       ScreenMode;
  setMode:    (m: ScreenMode) => void;
  paused:     boolean;
  setPaused:  (v: boolean) => void;
  onNext:     () => void;
  onPrev:     () => void;
  photoCount: number;
  visible:    boolean;
}) {
  return (
    <div
      className="fixed bottom-5 right-5 z-50 transition-all duration-500"
      style={{ opacity: visible ? 1 : 0, pointerEvents: visible ? "auto" : "none" }}
    >
      <div className="bg-black/75 backdrop-blur-md text-white rounded-2xl p-4 w-64 space-y-3 border border-white/10 shadow-2xl">
        <p className="text-[10px] font-bold uppercase tracking-widest text-white/40">Operator Controls</p>

        {/* Modes */}
        <div className="grid grid-cols-2 gap-1">
          {([
            { m: "slideshow", icon: <Play size={11} />,       label: "Slideshow" },
            { m: "holding",   icon: <Monitor size={11} />,    label: "Holding" },
            { m: "qr",        icon: <QrCodeIcon size={11} />, label: "QR Code" },
            { m: "featured",  icon: <Star size={11} />,       label: "Featured" },
          ] as { m: ScreenMode; icon: React.ReactNode; label: string }[]).map(({ m, icon, label }) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={cn(
                "flex items-center gap-1.5 px-2 py-2 rounded-lg text-xs font-medium transition-colors",
                mode === m ? "bg-white/20 text-white" : "text-white/50 hover:bg-white/10"
              )}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Playback */}
        <div className="flex gap-1.5">
          <button onClick={onPrev}  className="flex-1 bg-white/10 hover:bg-white/20 rounded-lg py-2 flex justify-center items-center transition-colors"><SkipBack  size={13} /></button>
          <button onClick={() => setPaused(!paused)} className="flex-1 bg-white/10 hover:bg-white/20 rounded-lg py-2 flex justify-center items-center transition-colors">
            {paused ? <Play size={13} /> : <Pause size={13} />}
          </button>
          <button onClick={onNext}  className="flex-1 bg-white/10 hover:bg-white/20 rounded-lg py-2 flex justify-center items-center transition-colors"><SkipForward size={13} /></button>
        </div>

        <p className="text-[9px] text-white/25 text-center">{photoCount} approved photo{photoCount !== 1 ? "s" : ""}</p>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function EventLiveScreen() {
  const { eventSlug }                   = useParams<{ eventSlug: string }>();
  const { data: event }                 = useEventBySlug(eventSlug);
  const { data: photos = [], refetch }  = useApprovedEventPhotos(event?.id);

  const [mode, setMode]             = useState<ScreenMode>("slideshow");
  const [currentIdx, setCurrentIdx] = useState(0);
  const [prevIdx, setPrevIdx]       = useState<number | null>(null);
  const [kbCount, setKbCount]       = useState(0); // increments each slide to cycle KB anim
  const [paused, setPaused]         = useState(false);
  const [showControls, setShowControls] = useState(false);

  const intervalRef    = useRef<ReturnType<typeof setInterval> | null>(null);
  const controlsTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);
  const transTimer     = useRef<ReturnType<typeof setTimeout> | null>(null);

  const TRANS_MS = 900; // must match CSS transition duration
  const intervalSec = event?.slideshow_interval_seconds ?? 7;

  // ── Realtime ──────────────────────────────────────────────────────────────

  useEffect(() => {
    if (!event?.id) return;
    const ch = supabase
      .channel(`live-${event.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "event_photos", filter: `event_id=eq.${event.id}` }, () => refetch())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [event?.id, refetch]);

  // ── Advance ───────────────────────────────────────────────────────────────

  const advance = useCallback(() => {
    if (photos.length < 2) return;
    setCurrentIdx((cur) => {
      const next = (cur + 1) % photos.length;
      setPrevIdx(cur);
      setKbCount((k) => k + 1);
      // Clear prev after transition completes
      if (transTimer.current) clearTimeout(transTimer.current);
      transTimer.current = setTimeout(() => setPrevIdx(null), TRANS_MS + 100);
      return next;
    });
  }, [photos.length]);

  const goBack = useCallback(() => {
    if (photos.length < 2) return;
    setCurrentIdx((cur) => {
      const next = (cur - 1 + photos.length) % photos.length;
      setPrevIdx(cur);
      setKbCount((k) => k + 1);
      if (transTimer.current) clearTimeout(transTimer.current);
      transTimer.current = setTimeout(() => setPrevIdx(null), TRANS_MS + 100);
      return next;
    });
  }, [photos.length]);

  // ── Auto-advance timer ────────────────────────────────────────────────────

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (!paused && mode === "slideshow" && photos.length > 1) {
      intervalRef.current = setInterval(advance, intervalSec * 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [paused, mode, photos.length, intervalSec, advance]);

  // Clamp index when photos list shrinks
  useEffect(() => {
    if (photos.length && currentIdx >= photos.length) setCurrentIdx(0);
  }, [photos.length, currentIdx]);

  // ── Mouse activity → show controls ───────────────────────────────────────

  const handleMouseMove = useCallback(() => {
    setShowControls(true);
    if (controlsTimer.current) clearTimeout(controlsTimer.current);
    controlsTimer.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────

  if (!event) {
    return (
      <div className="w-screen h-screen bg-black flex items-center justify-center text-white/30 text-xl select-none">
        Loading…
      </div>
    );
  }

  const {
    primary_color, secondary_color, logo_url, slug,
    screen_headline, screen_subheadline,
    show_captions, show_names, show_sponsors, show_logo,
    show_qr_code_on_screen, lower_third_text, sponsor_message,
  } = event;

  const cur  = photos[currentIdx] ?? null;
  const prev = prevIdx !== null ? photos[prevIdx] ?? null : null;

  const uploadUrl = `${window.location.origin}/event/${slug}/upload`;
  const qrSrc     = `https://api.qrserver.com/v1/create-qr-code/?size=128x128&format=png&color=FFFFFF&bgcolor=000000&data=${encodeURIComponent(uploadUrl)}`;

  return (
    <>
      {/* Inject Ken Burns keyframes */}
      <style>{KB_CSS}</style>

      <div
        className="w-screen h-screen overflow-hidden relative bg-black select-none cursor-none"
        onMouseMove={handleMouseMove}
      >
        {/* ── Slideshow / Featured mode ── */}
        {(mode === "slideshow" || mode === "featured") && (
          <>
            {photos.length === 0 ? (
              <HoldingScreen
                primaryColor={primary_color}
                secondaryColor={secondary_color}
                logoUrl={show_logo ? logo_url : null}
                headline={screen_headline}
                subheadline={screen_subheadline}
              />
            ) : (
              <>
                {/* Previous slide (fades out) */}
                {prev && (
                  <BlurSlide
                    key={`prev-${prevIdx}`}
                    photoUrl={getPhotoUrl(prev.image_path)}
                    kbIndex={kbCount - 1}
                    intervalSec={intervalSec}
                    visible={false}
                    caption={prev.caption}
                    attendeeName={prev.attendee_name}
                    showCaption={show_captions}
                    showName={show_names}
                  />
                )}

                {/* Current slide (fades in) */}
                {cur && (
                  <BlurSlide
                    key={`cur-${currentIdx}`}
                    photoUrl={getPhotoUrl(cur.image_path)}
                    kbIndex={kbCount}
                    intervalSec={intervalSec}
                    visible={true}
                    caption={cur.caption}
                    attendeeName={cur.attendee_name}
                    showCaption={show_captions}
                    showName={show_names}
                  />
                )}
              </>
            )}
          </>
        )}

        {/* ── Holding mode ── */}
        {mode === "holding" && (
          <HoldingScreen
            primaryColor={primary_color}
            secondaryColor={secondary_color}
            logoUrl={show_logo ? logo_url : null}
            headline={screen_headline}
            subheadline={screen_subheadline}
          />
        )}

        {/* ── QR mode ── */}
        {mode === "qr" && (
          <QRScreen
            slug={slug}
            primaryColor={primary_color}
            secondaryColor={secondary_color}
            headline={screen_headline}
            logoUrl={show_logo ? logo_url : null}
          />
        )}

        {/* ── Persistent overlays (non-header/footer) ── */}

        {/* Logo watermark — top left */}
        {show_logo && logo_url && mode === "slideshow" && photos.length > 0 && (
          <div className="absolute top-6 left-8 z-20 pointer-events-none">
            <img src={logo_url} alt="" className="h-12 w-auto object-contain opacity-70 drop-shadow-lg" />
          </div>
        )}

        {/* Lower third + sponsor — bottom strip */}
        {mode === "slideshow" && photos.length > 0 && (lower_third_text || (show_sponsors && sponsor_message)) && (
          <div
            className="absolute bottom-0 left-0 right-0 z-20 px-10 pb-5 pt-8 pointer-events-none"
            style={{ background: "linear-gradient(to top, rgba(0,0,0,.6) 0%, transparent 100%)" }}
          >
            {lower_third_text && (
              <p className="text-white font-semibold text-xl drop-shadow">{lower_third_text}</p>
            )}
            {show_sponsors && sponsor_message && (
              <p className="text-white/50 text-base">{sponsor_message}</p>
            )}
          </div>
        )}

        {/* QR corner — bottom right */}
        {show_qr_code_on_screen && mode === "slideshow" && photos.length > 0 && (
          <div className="absolute bottom-6 right-8 z-20 flex flex-col items-center gap-1 pointer-events-none">
            <img src={qrSrc} alt="QR" className="w-20 h-20 rounded-lg opacity-80" />
            <p className="text-white/40 text-[10px] font-medium">Scan to share</p>
          </div>
        )}

        {/* Progress dots — center bottom */}
        {mode === "slideshow" && photos.length > 1 && photos.length <= 16 && (
          <div className="absolute bottom-5 left-1/2 -translate-x-1/2 z-20 flex items-center gap-1.5 pointer-events-none">
            {photos.map((_, i) => (
              <div
                key={i}
                className="rounded-full transition-all duration-500"
                style={{
                  width:           i === currentIdx ? 10 : 5,
                  height:          i === currentIdx ? 10 : 5,
                  backgroundColor: i === currentIdx ? "rgba(255,255,255,.9)" : "rgba(255,255,255,.3)",
                }}
              />
            ))}
          </div>
        )}

        {/* Operator controls (appear on mouse move) */}
        <OperatorControls
          mode={mode}
          setMode={setMode}
          paused={paused}
          setPaused={setPaused}
          onNext={advance}
          onPrev={goBack}
          photoCount={photos.length}
          visible={showControls}
        />

        {/* Settings hint — top right, only visible on mouse move */}
        <div
          className="fixed top-4 right-4 z-50 transition-opacity duration-500 pointer-events-none"
          style={{ opacity: showControls ? 0.4 : 0 }}
        >
          <Settings size={16} className="text-white" />
        </div>
      </div>
    </>
  );
}
