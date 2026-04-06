import { useEffect, useCallback } from "react";
import { X, ChevronLeft, ChevronRight, CheckCircle2, Circle, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { SessionPhoto } from "@/integrations/supabase/types";

interface ClientLightboxProps {
  photo: SessionPhoto | null;
  photos: SessionPhoto[];
  signedUrls: Record<string, string>;
  commentCountByPhotoId: Record<string, number>;
  onClose: () => void;
  onNavigate: (photo: SessionPhoto) => void;
  onToggle: (photo: SessionPhoto) => void;
  onComment: (photo: SessionPhoto) => void;
  disabled: boolean; // limit reached and this photo is not selected
}

export default function ClientLightbox({
  photo,
  photos,
  signedUrls,
  commentCountByPhotoId,
  onClose,
  onNavigate,
  onToggle,
  onComment,
  disabled,
}: ClientLightboxProps) {
  const currentIndex = photo ? photos.findIndex((p) => p.id === photo.id) : -1;
  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < photos.length - 1;
  const isSelected = photo?.status === "selected";
  const commentCount = photo ? (commentCountByPhotoId[photo.id] ?? 0) : 0;

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

  const signedUrl = signedUrls[photo.id] ?? null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/90 flex flex-col"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Top bar */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <span className="text-white/60 text-sm">
          {currentIndex + 1} / {photos.length}
        </span>
        <div className="flex items-center gap-2">
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
      <div className="flex-1 flex items-center justify-center relative min-h-0 px-14">
        {/* Prev arrow */}
        {hasPrev && (
          <button
            onClick={goPrev}
            className="absolute left-2 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-black/40 hover:bg-black/60 rounded-full p-2 transition-all"
            aria-label="Previous photo"
          >
            <ChevronLeft size={28} />
          </button>
        )}

        {/* Photo */}
        {signedUrl ? (
          <img
            key={photo.id}
            src={signedUrl}
            alt={photo.file_name}
            className="max-h-full max-w-full object-contain rounded-lg select-none"
            draggable={false}
          />
        ) : (
          <div className="w-64 h-64 bg-white/10 rounded-xl flex items-center justify-center text-white/40 text-sm">
            Loading…
          </div>
        )}

        {/* Next arrow */}
        {hasNext && (
          <button
            onClick={goNext}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-white/70 hover:text-white bg-black/40 hover:bg-black/60 rounded-full p-2 transition-all"
            aria-label="Next photo"
          >
            <ChevronRight size={28} />
          </button>
        )}
      </div>

      {/* Bottom action bar */}
      <div className="shrink-0 px-4 py-4 flex flex-col items-center gap-3">
        {/* File name */}
        <p className="text-white/40 text-xs truncate max-w-xs">{photo.file_name}</p>

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
