import { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useToast } from "@/hooks/use-toast";
import { uploadDeliverable } from "@/hooks/usePhotoSessions";
import type { DeliverableQuality } from "@/integrations/supabase/types";
import { useQueryClient } from "@tanstack/react-query";

interface DeliverableUploadZoneProps {
  sessionId: string;
  orgId: string;
  quality: DeliverableQuality;
}

const MAX_BYTES = 50 * 1024 * 1024; // 50 MB

const ACCEPTED = [
  "image/jpeg", "image/jpg", "image/png", "image/webp",
  "image/tiff", "image/heic", "image/heif",
].join(",");

export default function DeliverableUploadZone({ sessionId, orgId, quality }: DeliverableUploadZoneProps) {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<Record<string, number>>({});
  const [uploading, setUploading] = useState(false);

  const label = quality === "hd" ? "HD" : "Low-res (LR)";

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    const oversized = list.filter((f) => f.size > MAX_BYTES);
    if (oversized.length) {
      toast({
        description: `${oversized.map((f) => f.name).join(", ")} exceed${oversized.length === 1 ? "s" : ""} the 50 MB limit.`,
        variant: "destructive",
      });
      return;
    }

    setUploading(true);
    const initial = Object.fromEntries(list.map((f) => [f.name, 0]));
    setProgress(initial);

    try {
      await Promise.all(
        list.map((file) =>
          uploadDeliverable(file, sessionId, orgId, quality, (name, pct) =>
            setProgress((p) => ({ ...p, [name]: pct }))
          )
        )
      );
      queryClient.invalidateQueries({ queryKey: ["session-deliverables", sessionId] });
      toast({ description: `${list.length} ${label} file${list.length !== 1 ? "s" : ""} uploaded.` });
    } catch {
      toast({ description: "One or more uploads failed.", variant: "destructive" });
    } finally {
      setUploading(false);
      setProgress({});
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  };

  const inProgress = Object.entries(progress);

  return (
    <div className="space-y-2">
      <div
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`
          relative flex flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed
          px-4 py-6 text-center transition-colors cursor-pointer
          ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/30"}
          ${uploading ? "pointer-events-none opacity-60" : ""}
        `}
        onClick={() => inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPTED}
          className="sr-only"
          onChange={(e) => e.target.files && handleFiles(e.target.files)}
        />

        {uploading ? (
          <Loader2 size={22} className="animate-spin text-muted-foreground" />
        ) : (
          <Upload size={22} className="text-muted-foreground" />
        )}

        <div className="space-y-0.5">
          <p className="text-sm font-medium text-foreground">
            {uploading ? "Uploading…" : `Upload ${label} files`}
          </p>
          <p className="text-xs text-muted-foreground">
            Drag &amp; drop or click · JPEG, PNG, WebP, TIFF, HEIC · max 50 MB each
          </p>
        </div>

        {!uploading && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="mt-1 h-7 text-xs pointer-events-none"
          >
            Choose files
          </Button>
        )}
      </div>

      {/* Per-file progress bars */}
      {inProgress.length > 0 && (
        <div className="space-y-1.5">
          {inProgress.map(([name, pct]) => (
            <div key={name} className="space-y-0.5">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span className="truncate max-w-[240px]">{name}</span>
                <span>{pct}%</span>
              </div>
              <Progress value={pct} className="h-1.5" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
