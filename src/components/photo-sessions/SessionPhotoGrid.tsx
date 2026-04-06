import PhotoThumbnail from "./PhotoThumbnail";
import type { SessionPhoto } from "@/integrations/supabase/types";

interface SessionPhotoGridProps {
  photos: SessionPhoto[];
  onPhotoClick: (photo: SessionPhoto) => void;
}

export default function SessionPhotoGrid({ photos, onPhotoClick }: SessionPhotoGridProps) {
  if (photos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <p className="text-4xl mb-3">🖼️</p>
        <p className="text-muted-foreground text-sm">No photos in this view.</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2">
      {photos.map((photo) => (
        <PhotoThumbnail
          key={photo.id}
          photo={photo}
          onClick={() => onPhotoClick(photo)}
        />
      ))}
    </div>
  );
}
