import { useRef, useState } from "react";
import { useParams } from "react-router-dom";
import { Camera, ImageIcon, RefreshCw, CheckCircle2, Loader2, AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useEventBySlug, type LVEvent } from "@/hooks/useEvents";
import { uploadEventPhoto } from "@/hooks/useEventPhotos";

// ── Types ─────────────────────────────────────────────────────────────────────

type Stage = "select" | "preview" | "submitting" | "done" | "error";
type Source = "camera" | "selfie" | "gallery";

const MAX_BYTES = 15 * 1024 * 1024; // 15 MB

// ── Helpers ───────────────────────────────────────────────────────────────────

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload  = () => res(reader.result as string);
    reader.onerror = rej;
    reader.readAsDataURL(file);
  });
}

function isValidImageFile(file: File): string | null {
  const validTypes = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"];
  if (!validTypes.includes(file.type) && !file.type.startsWith("image/")) {
    return "This file type is not supported. Please use a photo.";
  }
  if (file.size > MAX_BYTES) {
    return "This file is too large. Please choose a photo under 15 MB.";
  }
  return null;
}

// ── Branded header ────────────────────────────────────────────────────────────

function EventHeader({ event }: { event: LVEvent }) {
  return (
    <header
      className="px-6 py-5 flex flex-col items-center gap-3 text-center"
      style={{ backgroundColor: event.primary_color }}
    >
      {event.show_logo && event.logo_url && (
        <img src={event.logo_url} alt={event.name} className="h-14 w-auto object-contain" />
      )}
      <div>
        <h1 className="text-xl font-bold" style={{ color: event.accent_color }}>
          {event.upload_headline}
        </h1>
        {event.upload_subheadline && (
          <p className="text-sm mt-1 opacity-80" style={{ color: event.accent_color }}>
            {event.upload_subheadline}
          </p>
        )}
      </div>
    </header>
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
  const selfieRef   = useRef<HTMLInputElement>(null);
  const rearRef     = useRef<HTMLInputElement>(null);
  const galleryRef  = useRef<HTMLInputElement>(null);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>, source: Source) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const err = isValidImageFile(file);
    if (err) { onError(err); return; }
    onFile(file, source);
    e.target.value = "";
  };

  const { camera_mode, allow_camera_capture, allow_gallery_upload } = event;
  const showSelfie  = allow_camera_capture && (camera_mode === "front"  || camera_mode === "both");
  const showRear    = allow_camera_capture && (camera_mode === "rear"   || camera_mode === "both");
  const showGallery = allow_gallery_upload;

  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-4 px-6 py-8">
      <p className="text-muted-foreground text-sm text-center">How would you like to share?</p>

      <div className="w-full max-w-xs space-y-3">
        {showSelfie && (
          <>
            <button
              onClick={() => selfieRef.current?.click()}
              className="w-full py-4 rounded-2xl flex items-center justify-center gap-3 font-semibold text-white transition-opacity active:opacity-80 shadow-md"
              style={{ backgroundColor: "#CB2039" }}
            >
              <Camera size={20} /> {event.selfie_button_label}
            </button>
            <input ref={selfieRef} type="file" accept="image/*" capture="user" className="hidden" onChange={(e) => handleInput(e, "selfie")} />
          </>
        )}
        {showRear && (
          <>
            <button
              onClick={() => rearRef.current?.click()}
              className="w-full py-4 rounded-2xl flex items-center justify-center gap-3 font-semibold text-white transition-opacity active:opacity-80 shadow-md"
              style={{ backgroundColor: "#0B1F4D" }}
            >
              <Camera size={20} /> {event.rear_camera_button_label}
            </button>
            <input ref={rearRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => handleInput(e, "camera")} />
          </>
        )}
        {showGallery && (
          <>
            <button
              onClick={() => galleryRef.current?.click()}
              className="w-full py-4 rounded-2xl flex items-center justify-center gap-3 font-semibold border-2 transition-opacity active:opacity-80"
              style={{ borderColor: "#CB2039", color: "#CB2039" }}
            >
              <ImageIcon size={20} /> {event.gallery_button_label}
            </button>
            <input ref={galleryRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleInput(e, "gallery")} />
          </>
        )}
      </div>
    </div>
  );
}

// ── Preview stage ─────────────────────────────────────────────────────────────

function PreviewStage({
  event, previewUrl, file, source,
  onRetake, onSubmit, submitting,
}: {
  event: LVEvent;
  previewUrl: string;
  file: File;
  source: Source;
  onRetake: () => void;
  onSubmit: (name: string, caption: string, consent: boolean) => void;
  submitting: boolean;
}) {
  const [name, setName]         = useState("");
  const [caption, setCaption]   = useState("");
  const [consent, setConsent]   = useState(false);
  const [nameErr, setNameErr]   = useState("");
  const [capErr, setCapErr]     = useState("");

  const handleSubmit = () => {
    let ok = true;
    if (event.require_name && !name.trim()) { setNameErr("Name is required."); ok = false; }
    if (event.require_caption && !caption.trim()) { setCapErr("Caption is required."); ok = false; }
    if (!ok) return;
    onSubmit(name, caption, consent);
  };

  return (
    <div className="flex-1 flex flex-col overflow-y-auto">
      {/* Preview image */}
      <div className="relative bg-black">
        <img src={previewUrl} alt="Preview" className="w-full max-h-[45vh] object-contain" />
      </div>

      <div className="p-5 space-y-4">
        <p className="text-base font-semibold text-center">Looks good?</p>

        <button
          onClick={onRetake}
          className="w-full py-2.5 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted/40 flex items-center justify-center gap-2"
        >
          <RefreshCw size={15} /> Retake / Choose Another
        </button>

        {/* Optional fields */}
        {!event.require_name || true ? (
          <div className="space-y-1">
            <label className="text-sm font-medium">
              Your Name {event.require_name && <span className="text-destructive">*</span>}
              {!event.require_name && <span className="text-muted-foreground text-xs"> (optional)</span>}
            </label>
            <Input
              placeholder="First name"
              value={name}
              onChange={(e) => { setName(e.target.value); setNameErr(""); }}
              className={nameErr ? "border-destructive" : ""}
            />
            {nameErr && <p className="text-xs text-destructive">{nameErr}</p>}
          </div>
        ) : null}

        {!event.require_caption || true ? (
          <div className="space-y-1">
            <label className="text-sm font-medium">
              Caption {event.require_caption && <span className="text-destructive">*</span>}
              {!event.require_caption && <span className="text-muted-foreground text-xs"> (optional)</span>}
            </label>
            <Textarea
              placeholder="Add a caption…"
              rows={2}
              value={caption}
              onChange={(e) => { setCaption(e.target.value); setCapErr(""); }}
              className={cn("resize-none", capErr ? "border-destructive" : "")}
            />
            {capErr && <p className="text-xs text-destructive">{capErr}</p>}
          </div>
        ) : null}

        {/* Consent */}
        {event.require_consent && (
          <label className="flex items-start gap-3 cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => setConsent(e.target.checked)}
              className="mt-0.5 h-4 w-4 rounded border-border accent-rose-600"
            />
            <span className="text-xs text-muted-foreground leading-relaxed">
              By submitting this photo, I confirm I own or have permission to share it and authorize LV Branding and the event organizers to display it during the event and in related event media.
            </span>
          </label>
        )}

        {/* Submit */}
        <button
          onClick={handleSubmit}
          disabled={submitting || (event.require_consent && !consent)}
          className="w-full py-4 rounded-2xl font-bold text-white text-lg flex items-center justify-center gap-2 transition-opacity disabled:opacity-50"
          style={{ backgroundColor: "#CB2039" }}
        >
          {submitting
            ? <><Loader2 size={20} className="animate-spin" /> Sending…</>
            : "Submit Photo"
          }
        </button>
      </div>
    </div>
  );
}

// ── Done stage ────────────────────────────────────────────────────────────────

function DoneStage({ event }: { event: LVEvent }) {
  return (
    <div className="flex-1 flex flex-col items-center justify-center gap-6 px-6 py-10 text-center">
      <div className="w-20 h-20 rounded-full bg-emerald-100 flex items-center justify-center">
        <CheckCircle2 size={44} className="text-emerald-500" />
      </div>
      <div>
        <h2 className="text-2xl font-bold text-slate-800 mb-2">
          {event.auto_approve ? "You're on the big screen! 🎉" : "Photo received! 🎉"}
        </h2>
        <p className="text-muted-foreground text-base leading-relaxed max-w-sm">
          {event.confirmation_message ??
            (event.auto_approve
              ? "Your photo may appear on the big screen shortly. Enjoy the show!"
              : "Our team will review it. Watch the big screen — your moment may appear soon!"
            )
          }
        </p>
      </div>
      {event.show_qr_code_on_screen && (
        <p className="text-xs text-muted-foreground">Share with a friend — scan the QR on the big screen!</p>
      )}
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function EventUploadPage() {
  const { eventSlug }  = useParams<{ eventSlug: string }>();
  const { data: event, isLoading, isError } = useEventBySlug(eventSlug);

  const [stage, setStage]         = useState<Stage>("select");
  const [file, setFile]           = useState<File | null>(null);
  const [source, setSource]       = useState<Source>("gallery");
  const [previewUrl, setPreviewUrl] = useState<string>("");
  const [errorMsg, setErrorMsg]   = useState<string>("");

  const handleFile = async (f: File, src: Source) => {
    setFile(f);
    setSource(src);
    const url = await fileToDataUrl(f);
    setPreviewUrl(url);
    setStage("preview");
  };

  const handleRetake = () => {
    setFile(null);
    setPreviewUrl("");
    setStage("select");
  };

  const handleError = (msg: string) => {
    setErrorMsg(msg);
    setStage("error");
  };

  const handleSubmit = async (name: string, caption: string, consent: boolean) => {
    if (!event || !file) return;
    setStage("submitting");
    try {
      await uploadEventPhoto({
        eventId:     event.id,
        orgId:       event.org_id,
        file,
        source:      source === "selfie" ? "camera" : source,
        name,
        caption,
        consent,
        autoApprove: event.auto_approve,
      });
      setStage("done");
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Something went wrong. Please try again.");
      setStage("error");
    }
  };

  // Loading / not found
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#F8F7F5] flex flex-col">
        <Skeleton className="h-36 w-full" />
        <div className="p-6 space-y-4">
          <Skeleton className="h-14 rounded-2xl" />
          <Skeleton className="h-14 rounded-2xl" />
          <Skeleton className="h-14 rounded-2xl" />
        </div>
      </div>
    );
  }

  if (isError || !event) {
    return (
      <div className="min-h-screen bg-[#F8F7F5] flex flex-col items-center justify-center gap-4 text-center p-6">
        <AlertCircle size={40} className="text-destructive" />
        <p className="text-lg font-semibold">Event not found</p>
        <p className="text-sm text-muted-foreground">This link may have expired or the event may be inactive.</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8F7F5]">
      <EventHeader event={event} />

      {stage === "select" && (
        <SelectStage event={event} onFile={handleFile} onError={handleError} />
      )}
      {(stage === "preview" || stage === "submitting") && file && previewUrl && (
        <PreviewStage
          event={event}
          previewUrl={previewUrl}
          file={file}
          source={source}
          onRetake={handleRetake}
          onSubmit={handleSubmit}
          submitting={stage === "submitting"}
        />
      )}
      {stage === "done" && <DoneStage event={event} />}
      {stage === "error" && (
        <div className="flex-1 flex flex-col items-center justify-center gap-5 px-6 text-center">
          <AlertCircle size={40} className="text-destructive" />
          <p className="text-base font-semibold text-slate-800">Something went wrong</p>
          <p className="text-sm text-muted-foreground">{errorMsg}</p>
          <button
            onClick={() => setStage("select")}
            className="px-6 py-3 rounded-2xl font-semibold text-white"
            style={{ backgroundColor: "#CB2039" }}
          >
            Try Again
          </button>
        </div>
      )}

      <footer className="text-center py-5 text-xs text-muted-foreground">
        Powered by LV Branding Event Experiences
      </footer>
    </div>
  );
}
