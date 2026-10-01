import { useRef, useState } from "react";
import { Upload } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { uploadPhoto } from "@/hooks/usePhotoSessions";
import { useUploadBatch, type SkippedFile } from "@/hooks/useUploadBatch";
import { byFileName, photoContentType, photoProblem } from "@/lib/photo-sessions/uploads";
import UploadBatchStatus from "./UploadBatchStatus";

/** Four at a time: fast on a good connection, and one slow file does not hold up the rest. */
const CONCURRENT_UPLOADS = 4;

interface PhotoUploadZoneProps {
  sessionId: string;
  orgId: string;
  /** Where the next photo goes in the session's order: one past the last photo already in it. */
  nextOrder: number;
}

/**
 * Adds a shoot to a session.
 *
 * Files are checked first and the ones that cannot go in are named with the
 * reason; the rest are numbered in file-name order — the order they were shot —
 * and uploaded four at a time. The grid fills in as they arrive.
 */
export default function PhotoUploadZone({ sessionId, orgId, nextOrder }: PhotoUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const queryClient = useQueryClient();

  const batch = useUploadBatch({
    concurrency: CONCURRENT_UPLOADS,
    upload: (entry) =>
      uploadPhoto(entry.file, sessionId, orgId, {
        displayOrder: entry.order,
        contentType: photoContentType(entry.file) ?? "image/jpeg",
      }),
    onProgress: () => queryClient.invalidateQueries({ queryKey: ["session-photos", sessionId] }),
  });

  const processFiles = (files: File[]) => {
    if (!files.length || batch.running) return;
    const skipped: SkippedFile[] = [];
    const accepted: File[] = [];
    for (const file of files) {
      const problem = photoProblem(file);
      if (problem) skipped.push({ name: file.name, reason: problem });
      else accepted.push(file);
    }
    accepted.sort(byFileName);
    batch.start(accepted.map((file, index) => ({ file, order: nextOrder + index })), skipped);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    processFiles(Array.from(e.dataTransfer.files));
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(Array.from(e.target.files ?? []));
    // Reset input so same file can be uploaded again if needed
    e.target.value = "";
  };

  return (
    <div className="space-y-3">
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onClick={() => !batch.running && inputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
          ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/40"}
          ${batch.running ? "pointer-events-none opacity-60" : ""}
        `}
      >
        <Upload size={28} className="mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">
          {dragging ? "Drop photos here" : "Drop photos or click to upload"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          JPEG, PNG or WebP — max 15 MB each. Shown in file-name order.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/jpeg,image/png,image/webp,.jpg,.jpeg,.png,.webp"
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      <UploadBatchStatus
        noun={{ one: "photo", many: "photos" }}
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
