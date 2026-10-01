import { useRef, useState } from "react";
import { Upload, Loader2 } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { uploadDeliverable } from "@/hooks/usePhotoSessions";
import { useUploadBatch, type SkippedFile } from "@/hooks/useUploadBatch";
import { byFileName, deliverableProblem } from "@/lib/photo-sessions/uploads";
import type { DeliverableQuality } from "@/integrations/supabase/types";
import UploadBatchStatus from "./UploadBatchStatus";

interface DeliverableUploadZoneProps {
  sessionId: string;
  orgId: string;
  quality: DeliverableQuality;
}

/** Edited finals are larger than proofs; three at a time keeps each one moving. */
const CONCURRENT_UPLOADS = 3;

const ACCEPTED = [
  "image/jpeg", "image/jpg", "image/png", "image/webp",
  "image/tiff", "image/heic", "image/heif",
].join(",");

/**
 * Uploads edited files for the client to download. Files it cannot take are
 * named with the reason, the rest go up a few at a time, and any that fail stay
 * listed with a retry — a failure used to say only "one or more uploads failed".
 */
export default function DeliverableUploadZone({ sessionId, orgId, quality }: DeliverableUploadZoneProps) {
  const queryClient = useQueryClient();
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const label = quality === "hd" ? "HD" : "Low-res (LR)";

  const batch = useUploadBatch({
    concurrency: CONCURRENT_UPLOADS,
    upload: (entry) => uploadDeliverable(entry.file, sessionId, orgId, quality),
    onProgress: () => queryClient.invalidateQueries({ queryKey: ["session-deliverables", sessionId] }),
  });

  const handleFiles = (files: FileList | File[]) => {
    if (batch.running) return;
    const skipped: SkippedFile[] = [];
    const accepted: File[] = [];
    for (const file of Array.from(files)) {
      const problem = deliverableProblem(file);
      if (problem) skipped.push({ name: file.name, reason: problem });
      else accepted.push(file);
    }
    accepted.sort(byFileName);
    batch.start(accepted.map((file, index) => ({ file, order: index })), skipped);
    if (inputRef.current) inputRef.current.value = "";
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    if (e.dataTransfer.files.length) handleFiles(e.dataTransfer.files);
  };

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
          ${batch.running ? "pointer-events-none opacity-60" : ""}
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

        {batch.running ? (
          <Loader2 size={22} className="animate-spin text-muted-foreground" />
        ) : (
          <Upload size={22} className="text-muted-foreground" />
        )}

        <div className="space-y-0.5">
          <p className="text-sm font-medium text-foreground">
            {batch.running ? "Uploading…" : `Upload ${label} files`}
          </p>
          <p className="text-xs text-muted-foreground">
            Drag &amp; drop or click · JPEG, PNG, WebP, TIFF, HEIC · max 50 MB each
          </p>
        </div>

        {!batch.running && (
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

      <UploadBatchStatus
        noun={{ one: "file", many: "files" }}
        total={batch.total}
        done={batch.done}
        running={batch.running}
        failed={batch.failed}
        skipped={batch.skipped}
        onRetry={batch.retryFailed}
        onDismiss={batch.dismiss}
      />
    </div>
  );
}
