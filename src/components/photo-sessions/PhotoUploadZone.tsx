import { useRef, useState, useCallback } from "react";
import { Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useQueryClient } from "@tanstack/react-query";
import { uploadPhoto } from "@/hooks/usePhotoSessions";

const MAX_FILE_SIZE = 15 * 1024 * 1024; // 15 MB
const ACCEPTED_TYPES = ["image/jpeg", "image/jpg", "image/png", "image/webp", "image/heic", "image/heif"];

interface FileProgress {
  name: string;
  progress: number;
  error?: string;
}

interface PhotoUploadZoneProps {
  sessionId: string;
  orgId: string;
}

export default function PhotoUploadZone({ sessionId, orgId }: PhotoUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [fileProgress, setFileProgress] = useState<FileProgress[]>([]);
  const [uploading, setUploading] = useState(false);
  const queryClient = useQueryClient();

  const processFiles = useCallback(async (files: File[]) => {
    const validFiles = files.filter((f) => {
      if (!ACCEPTED_TYPES.includes(f.type)) return false;
      if (f.size > MAX_FILE_SIZE) return false;
      return true;
    });

    if (validFiles.length === 0) return;

    setUploading(true);
    setFileProgress(validFiles.map((f) => ({ name: f.name, progress: 0 })));

    const results = await Promise.allSettled(
      validFiles.map(async (file, idx) => {
        try {
          await uploadPhoto(file, sessionId, orgId, (_, progress) => {
            setFileProgress((prev) =>
              prev.map((fp, i) => (i === idx ? { ...fp, progress } : fp))
            );
          });
        } catch (err) {
          setFileProgress((prev) =>
            prev.map((fp, i) =>
              i === idx ? { ...fp, error: "Upload failed", progress: 0 } : fp
            )
          );
          throw err;
        }
      })
    );

    // Invalidate after all uploads complete
    const anySuccess = results.some((r) => r.status === "fulfilled");
    if (anySuccess) {
      queryClient.invalidateQueries({ queryKey: ["session-photos", sessionId] });
    }

    // Clear progress after a short delay
    setTimeout(() => {
      setFileProgress([]);
      setUploading(false);
    }, 2000);
  }, [sessionId, orgId, queryClient]);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    processFiles(files);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    processFiles(files);
    // Reset input so same file can be uploaded again if needed
    e.target.value = "";
  };

  return (
    <div className="space-y-3">
      <div
        onDrop={handleDrop}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onClick={() => !uploading && inputRef.current?.click()}
        className={`
          border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors
          ${dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50 hover:bg-muted/40"}
          ${uploading ? "pointer-events-none opacity-60" : ""}
        `}
      >
        <Upload size={28} className="mx-auto mb-2 text-muted-foreground" />
        <p className="text-sm font-medium text-foreground">
          {dragging ? "Drop photos here" : "Drop photos or click to upload"}
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          JPEG, PNG, WebP, HEIC — max 15 MB each
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept="image/*,.heic,.heif"
          className="hidden"
          onChange={handleFileInput}
        />
      </div>

      {/* Upload progress */}
      {fileProgress.length > 0 && (
        <div className="space-y-2">
          {fileProgress.map((fp, i) => (
            <div key={i} className="bg-muted rounded-lg p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs text-foreground truncate flex-1 mr-2">{fp.name}</span>
                {fp.error ? (
                  <span className="text-xs text-destructive flex items-center gap-1">
                    <X size={12} /> Failed
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">{fp.progress}%</span>
                )}
              </div>
              {!fp.error && (
                <Progress value={fp.progress} className="h-1.5" />
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
