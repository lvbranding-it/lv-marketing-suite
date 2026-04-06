import { useState } from "react";
import { Trash2, ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useDeleteDeliverable, useDeliverableSignedUrl } from "@/hooks/usePhotoSessions";
import { useToast } from "@/hooks/use-toast";
import type { SessionDeliverable } from "@/integrations/supabase/types";

interface DeliverableGridProps {
  deliverables: SessionDeliverable[];
  sessionId: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// Individual row — fetches its own signed URL
function DeliverableRow({
  d,
  onDelete,
  deleting,
}: {
  d: SessionDeliverable;
  onDelete: (d: SessionDeliverable) => void;
  deleting: boolean;
}) {
  const { data: signedUrl, isLoading } = useDeliverableSignedUrl(d.storage_path);
  const [imgError, setImgError] = useState(false);

  return (
    <div className="flex items-center gap-3 px-3 py-2.5 bg-background hover:bg-muted/30 transition-colors">
      {/* Thumbnail */}
      <div className="w-10 h-10 rounded-md overflow-hidden shrink-0 bg-muted border border-border flex items-center justify-center">
        {isLoading ? (
          <Skeleton className="w-full h-full" />
        ) : signedUrl && !imgError ? (
          <img
            src={signedUrl}
            alt={d.file_name}
            className="w-full h-full object-cover"
            onError={() => setImgError(true)}
          />
        ) : (
          <ImageIcon size={15} className="text-muted-foreground" />
        )}
      </div>

      {/* Name + size */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{d.file_name}</p>
        <p className="text-xs text-muted-foreground">{formatBytes(d.file_size)}</p>
      </div>

      <Badge variant="outline" className="text-xs shrink-0">
        {d.quality.toUpperCase()}
      </Badge>

      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
        onClick={() => onDelete(d)}
        disabled={deleting}
      >
        <Trash2 size={13} />
      </Button>
    </div>
  );
}

export default function DeliverableGrid({ deliverables, sessionId }: DeliverableGridProps) {
  const { toast } = useToast();
  const deleteDeliverable = useDeleteDeliverable();

  if (deliverables.length === 0) return null;

  const hd = deliverables.filter((d) => d.quality === "hd");
  const lr = deliverables.filter((d) => d.quality === "lr");

  const handleDelete = async (d: SessionDeliverable) => {
    try {
      await deleteDeliverable.mutateAsync({ id: d.id, sessionId, storagePath: d.storage_path });
      toast({ description: `${d.file_name} removed.` });
    } catch {
      toast({ description: "Failed to remove file.", variant: "destructive" });
    }
  };

  const renderGroup = (label: string, files: SessionDeliverable[]) => {
    if (files.length === 0) return null;
    return (
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">{label}</p>
        <div className="border border-border rounded-xl divide-y divide-border overflow-hidden">
          {files.map((d) => (
            <DeliverableRow
              key={d.id}
              d={d}
              onDelete={handleDelete}
              deleting={deleteDeliverable.isPending}
            />
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      {renderGroup("HD Files", hd)}
      {renderGroup("Low-res (LR) Files", lr)}
      <p className="text-xs text-muted-foreground">
        {deliverables.length} file{deliverables.length !== 1 ? "s" : ""} ·{" "}
        {formatBytes(deliverables.reduce((s, d) => s + d.file_size, 0))} total
      </p>
    </div>
  );
}
