import { useState } from "react";
import { CheckCircle2, MessageSquare, ZoomIn } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { SessionPhoto } from "@/integrations/supabase/types";

interface ClientPhotoCardProps {
  photo: SessionPhoto;
  onToggle: (photo: SessionPhoto) => void;
  onViewPhoto: (photo: SessionPhoto) => void;  // opens lightbox
  onComment: (photo: SessionPhoto) => void;
  disabled: boolean;   // limit reached and photo is not_selected
  signedUrl: string | null;
  commentCount: number;
}

export default function ClientPhotoCard({
  photo,
  onToggle,
  onViewPhoto,
  onComment,
  disabled,
  signedUrl,
  commentCount,
}: ClientPhotoCardProps) {
  const isSelected = photo.status === "selected";
  const [imgError, setImgError] = useState(false);

  return (
    <div
      className={`
        relative rounded-xl overflow-hidden aspect-square border-2 transition-all duration-150 group
        ${isSelected
          ? "border-primary shadow-lg shadow-primary/30"
          : disabled
          ? "border-border opacity-50"
          : "border-transparent hover:border-primary/30"
        }
      `}
    >
      {/* Image — click opens lightbox */}
      <div
        className={`absolute inset-0 cursor-pointer ${disabled && !isSelected ? "cursor-not-allowed" : ""}`}
        onClick={() => onViewPhoto(photo)}
      >
        {!signedUrl ? (
          <Skeleton className="absolute inset-0 rounded-none" />
        ) : !imgError ? (
          <img
            src={signedUrl}
            alt={photo.file_name}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="w-full h-full bg-muted flex items-center justify-center text-xs text-muted-foreground p-2 text-center">
            {photo.file_name}
          </div>
        )}
      </div>

      {/* Selected overlay — strong tint + checkmark so it's unmistakable */}
      {isSelected && (
        <div className="absolute inset-0 bg-primary/20 pointer-events-none" />
      )}

      {/* ── Top-right action buttons (always visible on mobile, hover on desktop) ── */}
      <div className="absolute top-1.5 right-1.5 flex gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        {/* Zoom / view button */}
        <button
          onClick={(e) => { e.stopPropagation(); onViewPhoto(photo); }}
          className="bg-black/50 hover:bg-black/70 rounded-full p-1.5 backdrop-blur-sm transition-colors"
          aria-label="View full size"
        >
          <ZoomIn size={13} className="text-white" />
        </button>

        {/* Comment button */}
        <button
          onClick={(e) => { e.stopPropagation(); onComment(photo); }}
          className="relative bg-black/50 hover:bg-black/70 rounded-full p-1.5 backdrop-blur-sm transition-colors"
          aria-label={commentCount > 0 ? `${commentCount} comments` : "Add comment"}
        >
          <MessageSquare size={13} className="text-white" />
          {commentCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-primary text-primary-foreground text-[9px] font-bold rounded-full min-w-[14px] h-[14px] flex items-center justify-center px-0.5 leading-none">
              {commentCount > 9 ? "9+" : commentCount}
            </span>
          )}
        </button>
      </div>

      {/* ── Bottom bar — select toggle + labels ── */}
      <div className="absolute bottom-0 left-0 right-0">
        {isSelected ? (
          // Selected state — always visible, clear CTA to deselect
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(photo); }}
            className="w-full flex items-center justify-center gap-1.5 bg-primary py-1.5 text-primary-foreground text-xs font-semibold transition-colors hover:bg-primary/90"
          >
            <CheckCircle2 size={13} />
            Selected — tap to remove
          </button>
        ) : disabled ? (
          // Limit reached, not selected — greyed out label
          <div className="w-full flex items-center justify-center bg-black/60 py-1.5">
            <span className="text-white/50 text-xs">Limit reached</span>
          </div>
        ) : (
          // Available — show on hover (desktop) always on mobile
          <button
            onClick={(e) => { e.stopPropagation(); onToggle(photo); }}
            className="w-full flex items-center justify-center gap-1 bg-black/50 py-1.5 text-white text-xs font-medium sm:opacity-0 sm:group-hover:opacity-100 transition-opacity hover:bg-black/70 backdrop-blur-sm"
          >
            Tap to select
          </button>
        )}
      </div>
    </div>
  );
}
