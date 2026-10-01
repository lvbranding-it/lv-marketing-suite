import PhotoThumbnail from "./PhotoThumbnail";
import { Images } from "lucide-react";
import { useSessionComments } from "@/hooks/usePhotoSessions";
import type { SessionPhoto } from "@/integrations/supabase/types";

interface SessionPhotoGridProps {
  photos: SessionPhoto[];
  sessionId?: string;
  onPhotoClick: (photo: SessionPhoto) => void;
}

export default function SessionPhotoGrid({ photos, sessionId, onPhotoClick }: SessionPhotoGridProps) {
  const { data: allComments = [] } = useSessionComments(sessionId);

  // Build a map of photo_id → comments[]
  const commentsByPhoto = allComments.reduce<Record<string, { id: string; body: string; author_label: string }[]>>(
    (acc, c) => {
      if (!acc[c.photo_id]) acc[c.photo_id] = [];
      acc[c.photo_id].push({ id: c.id, body: c.body, author_label: c.author_label });
      return acc;
    },
    {}
  );

  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <span className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground"><Images size={22} aria-hidden /></span>
        <p className="text-muted-foreground text-sm">No photos in this view.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
      {photos.map((photo, i) => (
        <PhotoThumbnail
          key={photo.id}
          photo={photo}
          photoNumber={i + 1}
          comments={commentsByPhoto[photo.id] ?? []}
          onClick={() => onPhotoClick(photo)}
        />
      ))}
    </div>
  );
}
