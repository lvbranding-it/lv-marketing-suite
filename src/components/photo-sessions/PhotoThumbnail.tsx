import { useState } from "react";
import { Trash2, MessageSquare, ChevronDown } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import PhotoStatusBadge from "./PhotoStatusBadge";
import { useSignedUrl, useUpdatePhotoStatus, useDeletePhoto } from "@/hooks/usePhotoSessions";
import type { SessionPhoto, PhotoStatus } from "@/integrations/supabase/types";

const STATUS_OPTIONS: { value: PhotoStatus; label: string }[] = [
  { value: "not_selected",      label: "Not Selected" },
  { value: "selected",          label: "Selected" },
  { value: "editing",           label: "Editing" },
  { value: "ready",             label: "Ready" },
  { value: "ready_for_download", label: "Ready for Download" },
];

interface PhotoThumbnailProps {
  photo: SessionPhoto;
  photoNumber?: number;
  comments?: { id: string; body: string; author_label: string }[];
  onClick: () => void;
}

export default function PhotoThumbnail({ photo, photoNumber, comments = [], onClick }: PhotoThumbnailProps) {
  const { data: signedUrl, isLoading } = useSignedUrl(photo.storage_path);
  const updateStatus = useUpdatePhotoStatus();
  const deletePhoto  = useDeletePhoto();
  const [imgError, setImgError] = useState(false);

  const handleStatusChange = (status: PhotoStatus) => {
    updateStatus.mutate({ photoId: photo.id, sessionId: photo.session_id, status });
  };

  const handleDelete = () => {
    deletePhoto.mutate({
      photoId: photo.id,
      sessionId: photo.session_id,
      storagePath: photo.storage_path,
    });
  };

  return (
    <div className="group rounded-lg overflow-hidden border border-border hover:border-primary/40 transition-colors bg-card">
      {/* Image */}
      <div className="relative aspect-square bg-muted cursor-pointer" onClick={onClick}>
        {isLoading ? (
          <Skeleton className="absolute inset-0" />
        ) : signedUrl && !imgError ? (
          <img
            src={signedUrl}
            alt={photo.file_name}
            className="absolute inset-0 w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-muted-foreground text-xs p-2 text-center">
            {photo.file_name}
          </div>
        )}

        {/* Photo number badge — top left */}
        {photoNumber !== undefined && (
          <div className="absolute top-1.5 left-1.5 bg-black/60 text-white text-[10px] font-semibold rounded px-1.5 py-0.5 leading-none backdrop-blur-sm">
            #{photoNumber}
          </div>
        )}

        {/* Status badge — bottom left */}
        <div className="absolute bottom-1.5 left-1.5" onClick={(e) => e.stopPropagation()}>
          <PhotoStatusBadge status={photo.status} />
        </div>

        {/* Controls overlay — top right, visible on hover */}
        <div
          className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Status dropdown */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="secondary" className="h-6 w-6">
                <ChevronDown size={12} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              {STATUS_OPTIONS.map((opt) => (
                <DropdownMenuItem
                  key={opt.value}
                  onClick={() => handleStatusChange(opt.value)}
                  className={photo.status === opt.value ? "font-semibold" : ""}
                >
                  {opt.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>

          {/* Comment button */}
          <Button size="icon" variant="secondary" className="h-6 w-6" onClick={onClick}>
            <MessageSquare size={12} />
          </Button>

          {/* Delete button */}
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button size="icon" variant="destructive" className="h-6 w-6">
                <Trash2 size={12} />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete photo?</AlertDialogTitle>
                <AlertDialogDescription>
                  This will permanently delete <strong>{photo.file_name}</strong> and all its comments.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                  Delete
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>

      {/* Filename */}
      <div className="px-2 py-1.5 border-t border-border">
        <p className="text-[10px] text-muted-foreground truncate" title={photo.file_name}>
          {photo.file_name}
        </p>
      </div>

      {/* Comments below the image */}
      {comments.length > 0 && (
        <div className="px-2 py-1.5 space-y-1 border-t border-border bg-muted/30">
          {comments.map((c) => (
            <div key={c.id} className="flex items-start gap-1.5 min-w-0">
              <MessageSquare size={10} className="text-muted-foreground shrink-0 mt-0.5" />
              <div className="min-w-0">
                <span className="text-[10px] font-medium text-muted-foreground">{c.author_label}: </span>
                <span className="text-[10px] text-foreground line-clamp-2">{c.body}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
