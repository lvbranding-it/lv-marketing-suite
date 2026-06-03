import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, X, Star, Trash2, Clock, Loader2, ExternalLink } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import AppShell from "@/components/layout/AppShell";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { useEvent } from "@/hooks/useEvents";
import { useEventPhotos, useUpdatePhotoStatus, useDeleteEventPhoto, getPhotoUrl, type EventPhoto } from "@/hooks/useEventPhotos";
import { cn } from "@/lib/utils";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_STYLES: Record<string, string> = {
  pending:  "bg-amber-50 text-amber-700 border-amber-200",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200",
  featured: "bg-rose-50 text-rose-700 border-rose-200",
  rejected: "bg-slate-100 text-slate-500 border-slate-200",
};

// ── Photo card ────────────────────────────────────────────────────────────────

function PhotoCard({
  photo, onApprove, onReject, onFeature, onDelete, busy,
}: {
  photo: EventPhoto;
  onApprove: () => void;
  onReject:  () => void;
  onFeature: () => void;
  onDelete:  () => void;
  busy: boolean;
}) {
  const [imgLoaded, setImgLoaded] = useState(false);
  const photoUrl = getPhotoUrl(photo.image_path);

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden group">
      {/* Image */}
      <div className="relative aspect-square bg-muted overflow-hidden">
        {!imgLoaded && <Skeleton className="absolute inset-0" />}
        <img
          src={photoUrl}
          alt={photo.attendee_name ?? "Photo"}
          className={cn("w-full h-full object-cover transition-opacity", imgLoaded ? "opacity-100" : "opacity-0")}
          onLoad={() => setImgLoaded(true)}
        />
        {/* Status badge */}
        <Badge
          variant="outline"
          className={cn("absolute top-2 left-2 text-[10px]", STATUS_STYLES[photo.status])}
        >
          {photo.status}
        </Badge>
        {/* Source badge */}
        <Badge
          variant="outline"
          className="absolute top-2 right-2 text-[10px] bg-black/40 text-white border-white/20 backdrop-blur-sm"
        >
          {photo.upload_source}
        </Badge>
      </div>

      {/* Info */}
      <div className="p-3 space-y-1.5">
        {photo.attendee_name && (
          <p className="text-sm font-medium truncate">{photo.attendee_name}</p>
        )}
        {photo.caption && (
          <p className="text-xs text-muted-foreground line-clamp-2">{photo.caption}</p>
        )}
        <p className="text-[10px] text-muted-foreground flex items-center gap-1">
          <Clock size={9} />
          {formatDistanceToNow(new Date(photo.uploaded_at), { addSuffix: true })}
        </p>
      </div>

      {/* Actions */}
      <div className="px-3 pb-3 flex items-center gap-1.5">
        {photo.status !== "approved" && photo.status !== "featured" && (
          <Button size="sm" className="flex-1 h-7 text-xs bg-emerald-600 hover:bg-emerald-700 text-white gap-1" onClick={onApprove} disabled={busy}>
            <Check size={11} /> Approve
          </Button>
        )}
        {photo.status !== "featured" && (
          <Button size="sm" variant="outline" className="flex-1 h-7 text-xs border-rose-300 text-rose-600 hover:bg-rose-50 gap-1" onClick={onFeature} disabled={busy}>
            <Star size={11} /> Feature
          </Button>
        )}
        {photo.status !== "rejected" && (
          <Button size="sm" variant="outline" className="h-7 text-xs text-muted-foreground gap-1 px-2" onClick={onReject} disabled={busy}>
            <X size={11} />
          </Button>
        )}
        <Button size="sm" variant="outline" className="h-7 text-xs text-destructive hover:bg-destructive/10 px-2" onClick={onDelete} disabled={busy}>
          <Trash2 size={11} />
        </Button>
        <a href={photoUrl} target="_blank" rel="noopener noreferrer" className="p-1.5 text-muted-foreground hover:text-primary">
          <ExternalLink size={11} />
        </a>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

type Tab = "pending" | "approved" | "featured" | "rejected" | "all";

export default function EventPhotoModeration() {
  const navigate           = useNavigate();
  const { eventId }        = useParams<{ eventId: string }>();
  const { toast }          = useToast();
  const { data: event }    = useEvent(eventId);
  const [tab, setTab]      = useState<Tab>("pending");
  const [deleteTarget, setDeleteTarget] = useState<EventPhoto | null>(null);
  const [busyIds, setBusyIds]           = useState<Set<string>>(new Set());

  const { data: photos = [], isLoading, refetch } = useEventPhotos(eventId, tab);
  const updateStatus = useUpdatePhotoStatus();
  const deletePhoto  = useDeleteEventPhoto();

  const setStatus = async (photo: EventPhoto, status: EventPhoto["status"]) => {
    setBusyIds((s) => new Set(s).add(photo.id));
    try {
      await updateStatus.mutateAsync({ id: photo.id, status, eventId: eventId! });
      refetch();
    } catch {
      toast({ variant: "destructive", description: "Failed to update photo." });
    } finally {
      setBusyIds((s) => { const n = new Set(s); n.delete(photo.id); return n; });
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deletePhoto.mutateAsync({ id: deleteTarget.id, imagePath: deleteTarget.image_path, eventId: eventId! });
      toast({ description: "Photo deleted." });
      refetch();
    } catch {
      toast({ variant: "destructive", description: "Failed to delete photo." });
    }
    setDeleteTarget(null);
  };

  const TABS: { key: Tab; label: string }[] = [
    { key: "pending",  label: "Pending" },
    { key: "approved", label: "Approved" },
    { key: "featured", label: "Featured" },
    { key: "rejected", label: "Rejected" },
    { key: "all",      label: "All" },
  ];

  return (
    <AppShell>
      <Header
        title={event ? `${event.name} — Photos` : "Photo Moderation"}
        subtitle="Review, approve, feature, or reject submitted photos"
        actions={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => navigate(`/event-experiences/${eventId}`)}>
              <ArrowLeft size={14} className="mr-1" /> Edit Event
            </Button>
            <a
              href={`${window.location.origin}/event/${event?.slug}/live-screen`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <Button size="sm" className="bg-rose-600 hover:bg-rose-700 text-white gap-1.5">
                <ExternalLink size={13} /> Live Screen
              </Button>
            </a>
          </div>
        }
      />

      <div className="p-3 sm:p-6 max-w-7xl mx-auto space-y-4">
        {/* Tabs */}
        <div className="flex items-center gap-1 flex-wrap">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border",
                tab === key
                  ? "bg-primary text-primary-foreground border-primary"
                  : "border-border text-muted-foreground hover:text-foreground"
              )}
            >
              {label}
            </button>
          ))}
          <Button variant="outline" size="sm" className="ml-auto h-7 text-xs gap-1" onClick={() => refetch()}>
            <Loader2 size={11} className={updateStatus.isPending ? "animate-spin" : ""} /> Refresh
          </Button>
        </div>

        {/* Grid */}
        {isLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {[1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="aspect-square rounded-xl" />)}
          </div>
        ) : photos.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center gap-3">
            <p className="text-4xl">📸</p>
            <p className="text-muted-foreground text-sm">No {tab !== "all" ? tab : ""} photos yet.</p>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
            {photos.map((photo) => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                busy={busyIds.has(photo.id)}
                onApprove={() => setStatus(photo, "approved")}
                onReject={() => setStatus(photo, "rejected")}
                onFeature={() => setStatus(photo, "featured")}
                onDelete={() => setDeleteTarget(photo)}
              />
            ))}
          </div>
        )}
      </div>

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this photo?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the photo from storage. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}
