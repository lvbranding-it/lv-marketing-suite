import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Camera, ImageIcon, RefreshCw, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useEventBySlug, type LVEvent } from "@/hooks/useEvents";
import { uploadEventPhoto } from "@/hooks/useEventPhotos";

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

// ── Types ─────────────────────────────────────────────────────────────────────

type Stage  = "select" | "preview" | "submitting" | "done" | "error";
type Source = "camera" | "selfie" | "gallery";

// ── Helpers ───────────────────────────────────────────────────────────────────

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload  = () => res(reader.result as string);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

function validateFile(file: File): string | null {
  if (!file.type.startsWith("image/")) return "This file type is not supported. Please use a photo.";
  if (file.size > MAX_BYTES) return `File is too large. Please choose a photo under 15 MB.`;
  return null;
}

// ── Capture button ────────────────────────────────────────────────────────────

function CaptureButton({
  label, icon, bg, border, textColor, onClick,
}: {
  label: string;
  icon: React.ReactNode;
  bg: string;
  border?: string;
  textColor: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="w-full py-[18px] rounded-2xl flex items-center justify-center gap-3 font-bold text-[17px] transition-opacity active:opacity-75 shadow-sm select-none"
      style={{
        backgroundColor: bg,
        border: border ? `2px solid ${border}` : "none",
        color: textColor,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

// ── Select stage ──────────────────────────────────────────────────────────────

function SelectStage({
  event, onFile, onError,
}: {
  event: LVEvent;
  onFile: (file: File, source: Source) => void;
  onError: (msg: string) => void;
}) {
  const selfieRef  = useRef<HTMLInputElement>(null);
  const rearRef    = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  const handle = (e: React.ChangeEvent<HTMLInputElement>, src: Source) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = validateFile(file);
    if (err) { onError(err); return; }
    onFile(file, src);
    e.target.value = "";
  };

  const { camera_mode, allow_camera_capture, allow_gallery_upload,
          selfie_button_label, rear_camera_button_label, gallery_button_label,
          primary_color, secondary_color } = event;

  const showSelfie  = allow_camera_capture && (camera_mode === "front" || camera_mode === "both");
  const showRear    = allow_camera_capture && (camera_mode === "rear"  || camera_mode === "both");
  const showGallery = allow_gallery_upload;

  return (
    <div className="flex flex-col items-center justify-between flex-1 px-6 pt-6 pb-10 gap-6">
      {/* Logo — the hero */}
      <div className="flex-1 flex flex-col items-center justify-center gap-4 w-full">
        {event.logo_url ? (
          <img
            src={event.logo_url}
            alt={event.name}
            className="w-full max-w-[280px] max-h-[260px] object-contain drop-shadow-md"
          />
        ) : (
          <h1
            className="text-4xl font-extrabold text-center leading-tight"
            style={{ color: primary_color }}
          >
            {event.name}
          </h1>
        )}

        {/* Subheadline — optional, very subtle */}
        {event.upload_subheadline && (
          <p className="text-sm text-center text-gray-400 max-w-xs leading-relaxed">
            {event.upload_subheadline}
          </p>
        )}
      </div>

      {/* Buttons */}
      <div className="w-full max-w-sm space-y-3">
        <p className="text-sm text-center text-gray-400 mb-1">How would you like to share?</p>

        {showSelfie && (
          <>
            <CaptureButton
              label={selfie_button_label}
              icon={<Camera size={20} />}
              bg={secondary_color}
              textColor="#ffffff"
              onClick={() => selfieRef.current?.click()}
            />
            <input ref={selfieRef} type="file" accept="image/*" capture="user" className="hidden"
              onChange={(e) => handle(e, "selfie")} />
          </>
        )}

        {showRear && (
          <>
            <CaptureButton
              label={rear_camera_button_label}
              icon={<Camera size={20} />}
              bg={primary_color}
              textColor="#ffffff"
              onClick={() => rearRef.current?.click()}
            />
            <input ref={rearRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={(e) => handle(e, "camera")} />
          </>
        )}

        {showGallery && (
          <>
            <CaptureButton
              label={gallery_button_label}
              icon={<ImageIcon size={20} />}
              bg="transparent"
              border={secondary_color}
              textColor={secondary_color}
              onClick={() => galleryRef.current?.click()}
            />
            <input ref={galleryRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => handle(e, "gallery")} />
          </>
        )}
      </div>
    </div>
  );
}

// ── Preview stage ─────────────────────────────────────────────────────────────

function PreviewStage({
  event, previewUrl, onRetake, onSubmit, submitting,
}: {
  event:       LVEvent;
  previewUrl:  string;
  onRetake:    () => void;
  onSubmit:    (name: string, caption: string, consent: boolean) => void;
  submitting:  boolean;
}) {
  const [name, setName]       = useState("");
  const [caption, setCaption] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors]   = useState<{ name?: string; caption?: string }>({});

  const handleSubmit = () => {
    const errs: typeof errors = {};
    if (event.require_name    && !name.trim())    errs.name    = "Name is required.";
    if (event.require_caption && !caption.trim()) errs.caption = "Caption is required.";
    if (Object.keys(errs).length) { setErrors(errs); return; }
    onSubmit(name, caption, consent);
  };

  const { primary_color, secondary_color } = event;

  return (
    <div className="flex flex-col flex-1 overflow-y-auto">
      {/* Photo preview */}
      <div className="relative bg-black w-full" style={{ maxHeight: "50vh" }}>
        <img src={previewUrl} alt="Preview" className="w-full h-full object-contain" style={{ maxHeight: "50vh" }} />
      </div>

      <div className="px-6 py-5 space-y-4 flex-1">
        {/* Retake */}
        <button
          onClick={onRetake}
          className="w-full py-3 rounded-2xl border-2 text-sm font-semibold text-gray-500 flex items-center justify-center gap-2 transition-colors hover:bg-gray-50 active:opacity-75"
          style={{ borderColor: "#e5e7eb" }}
        >
          <RefreshCw size={16} /> Retake / Choose Another
        </button>

        {/* Name */}
        {(event.require_name || true) && (
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">
              Your Name
              {!event.require_name && <span className="text-gray-400 font-normal"> (optional)</span>}
            </label>
            <input
              type="text"
              placeholder="First name"
              value={name}
              onChange={(e) => { setName(e.target.value); setErrors(p => ({ ...p, name: undefined })); }}
              className="w-full h-11 px-4 rounded-xl border border-gray-200 text-sm outline-none focus:ring-2 focus:ring-offset-1 bg-white"
              style={{ focusRingColor: secondary_color } as React.CSSProperties}
            />
            {errors.name && <p className="text-xs text-red-500">{errors.name}</p>}
          </div>
        )}

        {/* Caption */}
        {(event.require_caption || true) && (
          <div className="space-y-1">
            <label className="text-sm font-medium text-gray-700">
              Caption
              {!event.require_caption && <span className="text-gray-400 font-normal"> (optional)</span>}
            </label>
            <textarea
              placeholder="Add a caption…"
              rows={2}
              value={caption}
              onChange={(e) => { setCaption(e.target.value); setErrors(p => ({ ...p, caption: undefined })); }}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 text-sm outline-none resize-none bg-white"
            />
            {errors.caption && <p className="text-xs text-red-500">{errors.caption}</p>}
          </div>
        )}

        {/* Consent */}
        {event.require_consent && (
          <label className="flex items-start gap-3 cursor-pointer">
            <div className="mt-0.5 shrink-0">
              <input
                type="checkbox"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300"
                style={{ accentColor: secondary_color }}
              />
            </div>
            <span className="text-xs text-gray-400 leading-relaxed">
              By submitting, I authorize LV Branding and the event organizers to display this photo on event screens and related event media.
            </span>
          </label>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting || (event.require_consent && !consent)}
          className="w-full py-[18px] rounded-2xl font-bold text-[17px] text-white flex items-center justify-center gap-2 transition-opacity disabled:opacity-50 active:opacity-75 shadow-sm"
          style={{ backgroundColor: secondary_color }}
        >
          {submitting
            ? <><Loader2 size={20} className="animate-spin" /> Sending…</>
            : "Submit Photo 🎉"
          }
        </button>
      </div>
    </div>
  );
}

// ── Done stage ────────────────────────────────────────────────────────────────

function DoneStage({ event }: { event: LVEvent }) {
  const { primary_color, secondary_color, logo_url, name, auto_approve, confirmation_message } = event;

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 px-8 py-10 text-center">
      {logo_url ? (
        <img src={logo_url} alt={name} className="w-40 max-h-32 object-contain opacity-80" />
      ) : null}

      <div className="w-20 h-20 rounded-full flex items-center justify-center"
        style={{ backgroundColor: `${secondary_color}20` }}>
        <CheckCircle2 size={44} style={{ color: secondary_color }} />
      </div>

      <div className="space-y-2">
        <h2 className="text-2xl font-extrabold" style={{ color: primary_color }}>
          {auto_approve ? "You're on the big screen! 🎉" : "Photo received! 🎉"}
        </h2>
        <p className="text-gray-400 text-base leading-relaxed max-w-xs mx-auto">
          {confirmation_message ??
            (auto_approve
              ? "Your photo may appear on the big screen shortly. Enjoy the show!"
              : "Our team will review it quickly. Watch the big screen — your moment may appear soon!"
            )
          }
        </p>
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────

export default function EventUploadPage() {
  const { eventSlug } = useParams<{ eventSlug: string }>();
  const { data: event, isLoading, isError } = useEventBySlug(eventSlug);

  const [stage, setStage]         = useState<Stage>("select");
  const [file, setFile]           = useState<File | null>(null);
  const [source, setSource]       = useState<Source>("gallery");
  const [previewUrl, setPreviewUrl] = useState("");
  const [errorMsg, setErrorMsg]   = useState("");

  const handleFile = async (f: File, src: Source) => {
    setFile(f); setSource(src);
    setPreviewUrl(await fileToDataUrl(f));
    setStage("preview");
  };

  const handleRetake = () => {
    setFile(null); setPreviewUrl(""); setStage("select");
  };

  const handleError = (msg: string) => {
    setErrorMsg(msg); setStage("error");
  };

  const handleSubmit = async (name: string, caption: string, consent: boolean) => {
    if (!event || !file) return;
    setStage("submitting");
    try {
      await uploadEventPhoto({
        eventId:    event.id,
        orgId:      event.org_id,
        file,
        source:     source === "selfie" ? "camera" : source,
        name, caption, consent,
        autoApprove: event.auto_approve,
      });
      setStage("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setStage("error");
    }
  };

  // Loading
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8F7F5] flex flex-col items-center justify-center gap-6 p-8">
        <Skeleton className="w-56 h-44 rounded-2xl" />
        <div className="w-full max-w-sm space-y-3">
          <Skeleton className="h-14 rounded-2xl" />
          <Skeleton className="h-14 rounded-2xl" />
          <Skeleton className="h-14 rounded-2xl" />
        </div>
      </div>
    );
  }

  // Not found
  if (isError || !event) {
    return (
      <div className="min-h-screen bg-[#F8F7F5] flex flex-col items-center justify-center gap-4 text-center p-6">
        <AlertCircle size={40} className="text-red-400" />
        <p className="text-lg font-semibold text-gray-800">Event not found</p>
        <p className="text-sm text-gray-400">This link may have expired or the event may be inactive.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F8F7F5] flex flex-col" style={{ fontFamily: "'Fira Sans', sans-serif" }}>
      {stage === "select" && (
        <SelectStage event={event} onFile={handleFile} onError={handleError} />
      )}

      {(stage === "preview" || stage === "submitting") && previewUrl && (
        <PreviewStage
          event={event}
          previewUrl={previewUrl}
          onRetake={handleRetake}
          onSubmit={handleSubmit}
          submitting={stage === "submitting"}
        />
      )}

      {stage === "done" && <DoneStage event={event} />}

      {stage === "error" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-8 text-center">
          <AlertCircle size={44} className="text-red-400" />
          <p className="text-lg font-semibold text-gray-800">Something went wrong</p>
          <p className="text-sm text-gray-400">{errorMsg}</p>
          <button
            onClick={() => setStage("select")}
            className="px-8 py-4 rounded-2xl font-bold text-white text-base active:opacity-75"
            style={{ backgroundColor: event.secondary_color }}
          >
            Try Again
          </button>
        </div>
      )}

      <footer className="text-center py-5 text-xs text-gray-300">
        Powered by LV Branding Event Experiences
      </footer>
    </div>
  );
}
