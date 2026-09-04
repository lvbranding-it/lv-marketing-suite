import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useEventBySlug } from "@/hooks/useEvents";
import { useApprovedEventPhotos, getPhotoUrl, type EventPhoto } from "@/hooks/useEventPhotos";

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

type ScreenMode = "slideshow" | "holding" | "qr";

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

// ── QR Call-to-Action panel ───────────────────────────────────────────────────

function QRPanel({
  uploadUrl,
  headline,
  secondaryColor,
}: {
  uploadUrl:      string;
  headline:       string;
  secondaryColor: string;
}) {
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=600x600&format=png&color=000000&bgcolor=FFFFFF&qzone=2&data=${encodeURIComponent(uploadUrl)}`;

  return (
    <div
      className="absolute right-8 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-5 pointer-events-none"
      style={{
        background:           "rgba(0,0,0,.58)",
        backdropFilter:       "blur(16px)",
        WebkitBackdropFilter: "blur(16px)",
        border:               "1px solid rgba(255,255,255,.12)",
        borderRadius:         "24px",
        padding:              "28px 24px",
        width:                "260px",
      }}
    >
      {/* CTA headline */}
      <p
        className="text-center font-extrabold leading-tight"
        style={{ color: secondaryColor, fontSize: "20px" }}
      >
        {headline}
      </p>

      {/* QR code */}
      <div className="rounded-2xl overflow-hidden shadow-2xl" style={{ padding: "8px", background: "#fff" }}>
        <img src={qrSrc} alt="Scan to upload" width={210} height={210} className="block rounded-xl" />
      </div>

      {/* Sub-CTA */}
      <p className="text-white font-semibold text-sm text-center">Scan &amp; appear on screen</p>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function EventLiveScreen() {
  const { eventSlug }                  = useParams<{ eventSlug: string }>();
  const { data: event, isLoading }      = useEventBySlug(eventSlug);
  const { data: photos = [], refetch } = useApprovedEventPhotos(event?.id);

  const [currentIdx, setCurrentIdx] = useState(0);
  const [prevIdx, setPrevIdx]       = useState<number | null>(null);
  const [kbCount, setKbCount]       = useState(0);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const transTimer  = useRef<ReturnType<typeof setTimeout> | null>(null);

  const TRANS_MS    = 900;
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
      if (transTimer.current) clearTimeout(transTimer.current);
      transTimer.current = setTimeout(() => setPrevIdx(null), TRANS_MS + 100);
      return next;
    });
  }, [photos.length]);

  // ── Auto-advance ──────────────────────────────────────────────────────────

  useEffect(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    if (photos.length > 1) {
      intervalRef.current = setInterval(advance, intervalSec * 1000);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [photos.length, intervalSec, advance]);

  useEffect(() => {
    if (photos.length && currentIdx >= photos.length) setCurrentIdx(0);
  }, [photos.length, currentIdx]);

  // ── Render ────────────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="w-screen h-screen bg-black flex items-center justify-center text-white/30 text-xl select-none">
        Loading…
      </div>
    );
  }

  // Reached when the slug is unknown or the event is no longer active. This is
  // a screen projected in a room, so it has to say what is wrong: an empty black
  // display reads as broken hardware and someone goes looking for a loose cable.
  if (!event) {
    return (
      <div className="w-screen h-screen bg-black flex flex-col items-center justify-center gap-4 px-8 text-center select-none">
        <p className="text-3xl font-bold text-white/70">This event is not live right now.</p>
        <p className="max-w-xl text-lg leading-relaxed text-white/35">
          The live screen shows photos only while an event is active. Set it to
          active in Event Experiences, then refresh this page.
        </p>
        {eventSlug && (
          <p className="mt-2 font-mono text-sm text-white/20">{eventSlug}</p>
        )}
      </div>
    );
  }

  const {
    primary_color, secondary_color, logo_url, slug,
    screen_headline, screen_subheadline,
    show_captions, show_names, show_qr_code_on_screen,
    upload_headline,
  } = event;

  const cur  = photos[currentIdx] ?? null;
  const prev = prevIdx !== null ? (photos[prevIdx] ?? null) : null;

  const uploadUrl = `${window.location.origin}/event/${slug}/upload`;

  // CTA headline: prefer a punchy phrase, fall back to upload_headline
  const ctaHeadline = upload_headline || "See yourself on the big screen!";

  return (
    <>
      <style>{KB_CSS}</style>

      <div className="w-screen h-screen overflow-hidden relative bg-black select-none cursor-none">

        {/* ── Photo slideshow ── */}
        {photos.length === 0 ? (
          <HoldingScreen
            primaryColor={primary_color}
            secondaryColor={secondary_color}
            logoUrl={logo_url}
            headline={screen_headline}
            subheadline={screen_subheadline}
          />
        ) : (
          <>
            {/* Outgoing slide */}
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

            {/* Incoming slide */}
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

        {/* ── QR Call-to-Action panel (right side) ── */}
        {show_qr_code_on_screen && (
          <QRPanel
            uploadUrl={uploadUrl}
            headline={ctaHeadline}
            secondaryColor={secondary_color}
          />
        )}
      </div>
    </>
  );
}
