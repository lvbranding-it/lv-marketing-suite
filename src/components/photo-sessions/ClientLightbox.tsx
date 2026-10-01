import { useEffect, useCallback, useState } from "react";
import { X, ChevronLeft, ChevronRight, CheckCircle2, Circle, MessageSquare, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { ClientPhoto } from "@/hooks/usePhotoSessions";

interface ClientLightboxProps {
  photo: ClientPhoto | null;
  photos: ClientPhoto[];
  signedUrls: Record<string, string>;
  /** Large versions, shown over the grid preview once they have loaded. */
  largeUrls?: Record<string, string>;
  commentCountByPhotoId: Record<string, number>;
  onClose: () => void;
  onNavigate: (photo: ClientPhoto) => void;
  onToggle: (photo: ClientPhoto) => void;
  onComment: (photo: ClientPhoto) => void;
  disabled: boolean; // limit reached and this photo is not selected
  protectImages?: boolean; // block right-click / long-press save until editing is done
}

export default function ClientLightbox({
  photo,
  photos,
  signedUrls,
  largeUrls = {},
  commentCountByPhotoId,
  onClose,
  onNavigate,
  onToggle,
  onComment,
  disabled,
  protectImages = false,
}: ClientLightboxProps) {
  const currentIndex = photo ? photos.findIndex((p) => p.id === photo.id) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < photos.length - 1;
  const isSelected = photo?.status === "selected";
  const commentCount = photo ? (commentCountByPhotoId[photo.id] ?? 0) : 0;
  const [loadedLarge, setLoadedLarge] = useState<string | null>(null);

  const goNext = useCallback(() => {
    if (hasNext) onNavigate(photos[currentIndex + 1]);
  }, [hasNext, currentIndex, photos, onNavigate]);

  const goPrev = useCallback(() => {
    if (hasPrev) onNavigate(photos[currentIndex - 1]);
  }, [hasPrev, currentIndex, photos, onNavigate]);

  // Keyboard navigation
  useEffect(() => {
    if (!photo) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") goNext();
      else if (e.key === "ArrowLeft") goPrev();
      else if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [photo, goNext, goPrev, onClose]);

  if (!photo) return null;

  const previewUrl = signedUrls[photo.id] || null;
  const largeUrl = largeUrls[photo.id] || null;
  const protectStyle = protectImages ? {
    WebkitTouchCallout: "none",
    WebkitUserSelect: "none",
    userSelect: "none",
    WebkitUserDrag: "none",
  } as React.CSSProperties : undefined;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex flex-col"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between gap-3 px-4 py-2 shrink-0">
        <div className="flex min-w-0 items-baseline gap-3">
          <span className="shrink-0 text-white/60 text-sm tabular-nums">
            {currentIndex + 1} / {photos.length}
          </span>
          <span className="truncate text-white/40 text-xs">{photo.file_name}</span>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {commentCount > 0 && (
            <Badge variant="secondary" className="bg-white/10 text-white border-white/20 gap-1">
              <MessageSquare size={12} />
              {commentCount} comment{commentCount !== 1 ? "s" : ""}
            </Badge>
          )}
          <button
            onClick={onClose}
            className="text-white/70 hover:text-white transition-colors p-1.5 rounded-full hover:bg-white/10"
            aria-label="Close"
          >
            <X size={22} />
          </button>
        </div>
      </div>

      {/* Image area */}
      <div className="flex-1 flex items-center justify-center relative min-h-0 px-2 sm:px-16">
        {/* Prev arrow */}
        {hasPrev && (
          <button
            onClick={goPrev}
            className="absolute left-2 top-1/2 z-10 -translate-y-1/2 text-white/70 hover:text-white bg-black/40 hover:bg-black/60 rounded-full p-2 transition-all"
            aria-label="Previous photo"
          >
            <ChevronLeft size={28} />
          </button>
        )}

        {/* Photo */}
        {/* The photo fills the space it has. The grid preview shows at once,
            stretched; the large version fades in over it once loaded. */}
        {previewUrl || largeUrl ? (
          <div key={photo.id} className="relative h-full w-full">
            {previewUrl && (
              <img
                src={previewUrl}
                alt={photo.file_name}
                className="absolute inset-0 h-full w-full object-contain select-none"
                draggable={false}
                onContextMenu={(e) => { if (protectImages) e.preventDefault(); }}
                style={protectStyle}
              />
            )}
            {largeUrl && (
              <img
                src={largeUrl}
                alt=""
                aria-hidden
                onLoad={() => setLoadedLarge(largeUrl)}
                className={`absolute inset-0 h-full w-full object-contain select-none transition-opacity duration-200 ${
                  loadedLarge === largeUrl ? "opacity-100" : "opacity-0"
                }`}
                draggable={false}
                onContextMenu={(e) => { if (protectImages) e.preventDefault(); }}
                style={protectStyle}
              />
            )}
            {/* Transparent overlay blocks long-press save on mobile */}
            {protectImages && (
              <div
                className="absolute inset-0"
                onContextMenu={(e) => e.preventDefault()}
                style={{ WebkitTouchCallout: "none" } as React.CSSProperties}
              />
            )}
          </div>
        ) : (
          <div className="w-64 h-64 bg-white/10 rounded-xl flex items-center justify-center text-white/40 text-sm">
            Loading…
          </div>
        )}

        {/* Next arrow */}
        {hasNext && (
          <button
            onClick={goNext}
            className="absolute right-2 top-1/2 z-10 -translate-y-1/2 text-white/70 hover:text-white bg-black/40 hover:bg-black/60 rounded-full p-2 transition-all"
            aria-label="Next photo"
          >
            <ChevronRight size={28} />
          </button>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="shrink-0 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] flex flex-col items-center gap-2">
        {/* Preview-only notice when photos are protected */}
        {protectImages && (
          <div className="flex items-center gap-1.5 bg-white/10 border border-white/20 text-white/60 text-xs rounded-full px-3 py-1">
            <Lock size={11} />
            Preview only · Download available after editing is complete
          </div>
        )}

        <div className="flex items-center gap-3">
          {/* Comment button */}
          <Button
            variant="outline"
            size="sm"
            className="bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white gap-1.5"
            onClick={() => onComment(photo)}
          >
            <MessageSquare size={15} />
            {commentCount > 0 ? `${commentCount} Comment${commentCount !== 1 ? "s" : ""}` : "Add Comment"}
          </Button>

          {/* Select / deselect button */}
          {isSelected ? (
            <Button
              size="sm"
              className="bg-primary text-primary-foreground hover:bg-primary/90 gap-1.5 min-w-[160px]"
              onClick={() => onToggle(photo)}
            >
              <CheckCircle2 size={16} />
              Selected — Tap to Deselect
            </Button>
          ) : (
            <Button
              size="sm"
              variant="outline"
              disabled={disabled}
              className={`gap-1.5 min-w-[160px] ${
                disabled
                  ? "bg-white/5 border-white/10 text-white/30 cursor-not-allowed"
                  : "bg-white/10 border-white/30 text-white hover:bg-white/20 hover:text-white"
              }`}
              onClick={() => !disabled && onToggle(photo)}
            >
              <Circle size={16} />
              {disabled ? "Limit Reached" : "Tap to Select"}
            </Button>
          )}
        </div>

        {/* Keyboard hint — desktop only */}
        <p className="hidden sm:block text-white/25 text-xs">
          ← → arrow keys to navigate · Esc to close
        </p>
      </div>
    </div>
  );
}
