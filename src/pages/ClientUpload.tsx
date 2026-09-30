import React, { useState, useRef, useCallback, useEffect } from "react";
import { useParams } from "react-router-dom";
import { Upload, X, CheckCircle2, AlertCircle, Loader2, FileIcon, Film } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFileRequest } from "@/hooks/useFileRequests";
import { isVideoFile } from "@/lib/media/fileTypes";
import {
  CLIENT_FILE_MAX_BYTES,
  CLIENT_VIDEO_MAX_BYTES,
  formatBytes,
  sendClientFile,
  uploadProblem,
} from "@/lib/fileRequests/clientUpload";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

// LV Logo SVG component (circular badge logo)
function LVLogo({ size = 96 }: { size?: number }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 250.1 250.1" width={size} height={size}>
      <circle cx="125.05" cy="125.05" r="125.05" fill="#fff"/>
      <path fill="#cb2039" d="M125.05,16.67c-27.38,0-52.38,10.15-71.46,26.9v75.86c0,2.73,2.21,4.95,4.95,4.95h35.88c3.7.03,4.58,2.56,4.9,5.59.33,3.2.57,6.07,1.06,10.21.55,4.71-1.97,6.04-5.85,6.04h-57.49c-2.73,0-4.95-2.21-4.95-4.95v-71.95c-9.79,16.29-15.41,35.35-15.41,55.74,0,59.86,48.52,108.38,108.38,108.38.39,0,.77,0,1.16,0-3.84-30.87-11.01-75.15-14.66-104.58-.29-2.39,1.07-4.62,3.48-4.62h11.07c1.68,0,3.13,1.16,3.51,2.79,0,0,6.42,51,9.08,72.65.52,4.22,4.49,8.51,9.26-.05,12.67-22.75,28.78-51.64,41-72.55.86-1.47,2.4-2.72,4.1-2.7,5.12.07,12.08,0,15.73,0,3.37,0,4.57,2.3,3.48,4.45-15.39,30.22-42.66,69.2-59.08,100.94,46.23-12.38,80.27-54.56,80.27-104.7,0-59.86-48.52-108.38-108.38-108.38z"/>
    </svg>
  );
}

// Shared page shell with branded background
function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col" style={{
      background: "linear-gradient(135deg, #0f0f0f 0%, #1a0a0d 40%, #1f0b10 60%, #0f0f0f 100%)",
    }}>
      {/* Decorative blobs */}
      <div style={{
        position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0,
      }}>
        <div style={{
          position: "absolute", top: "-20%", left: "-10%",
          width: "60vw", height: "60vw",
          background: "radial-gradient(circle, rgba(203,32,57,0.18) 0%, transparent 70%)",
          borderRadius: "50%",
        }} />
        <div style={{
          position: "absolute", bottom: "-20%", right: "-10%",
          width: "50vw", height: "50vw",
          background: "radial-gradient(circle, rgba(203,32,57,0.12) 0%, transparent 70%)",
          borderRadius: "50%",
        }} />
        {/* Subtle grid overlay */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: "linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }} />
      </div>

      {/* Logo header */}
      <div style={{ position: "relative", zIndex: 1, display: "flex", justifyContent: "center", paddingTop: "4rem", paddingBottom: "2rem" }}>
        <LVLogo size={88} />
      </div>

      {/* Content */}
      <div style={{ position: "relative", zIndex: 1, flex: 1, display: "flex", flexDirection: "column" }}>
        {children}
      </div>

      {/* Footer */}
      <div style={{ position: "relative", zIndex: 1, textAlign: "center", padding: "1.5rem 1rem", color: "rgba(255,255,255,0.35)", fontSize: "0.75rem" }}>
        Made With Love ❤️ by LV Branding
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────
/** "rejected" is a file that cannot be sent at all (too large, empty); it is never attempted. */
type FileStatus = "pending" | "uploading" | "done" | "error" | "rejected";

interface SelectedFile {
  id: string;
  file: File;
  status: FileStatus;
  /** Bytes sent so far, for the progress bar. */
  sent: number;
  errorMsg?: string;
  /** Set once the file is in storage, so a retry only has to record it. */
  storedPath?: string;
}

let nextFileId = 0;

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ClientUpload() {
  const { token } = useParams<{ token: string }>();
  const { data: request, isLoading, error } = useFileRequest(token ?? null);

  const [message, setMessage] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  /** Which file of the batch is being sent, for the button: "Sending 2 of 3". */
  const [batch, setBatch] = useState({ index: 0, total: 0 });
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: File[]) => {
    const newEntries: SelectedFile[] = files.map((f) => {
      const problem = uploadProblem(f);
      return {
        id: `file-${nextFileId++}`,
        file: f,
        status: problem ? "rejected" : "pending",
        sent: 0,
        errorMsg: problem ?? undefined,
      };
    });
    setSelectedFiles((prev) => [...prev, ...newEntries]);
  }, []);

  const removeFile = (id: string) => {
    setSelectedFiles((prev) => prev.filter((sf) => sf.id !== id));
  };

  const updateFile = (id: string, changes: Partial<SelectedFile>) => {
    setSelectedFiles((prev) => prev.map((sf) => (sf.id === id ? { ...sf, ...changes } : sf)));
  };

  // A video can take minutes to send. Closing the tab part-way loses it, so the
  // browser asks first.
  useEffect(() => {
    if (!isUploading) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isUploading]);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(true);
  };

  const handleDragLeave = () => setDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) addFiles(files);
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) addFiles(files);
    e.target.value = "";
  };

  const sendable = selectedFiles.filter((sf) => sf.status !== "done" && sf.status !== "rejected");
  const rejectedCount = selectedFiles.filter((sf) => sf.status === "rejected").length;
  const sentCount = selectedFiles.filter((sf) => sf.status === "done").length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (sendable.length === 0 || !token) return;

    setIsUploading(true);
    let allOk = true;

    for (const [index, entry] of sendable.entries()) {
      setBatch({ index, total: sendable.length });
      updateFile(entry.id, { status: "uploading", errorMsg: undefined, sent: entry.storedPath ? entry.file.size : 0 });

      try {
        await sendClientFile({
          token,
          file: entry.file,
          message,
          storedPath: entry.storedPath,
          onStored: (storedPath) => updateFile(entry.id, { storedPath }),
          onProgress: (sent) => updateFile(entry.id, { sent }),
        });
        updateFile(entry.id, { status: "done", sent: entry.file.size });
      } catch (err) {
        allOk = false;
        updateFile(entry.id, { status: "error", errorMsg: err instanceof Error ? err.message : "Upload failed" });
      }
    }

    setIsUploading(false);
    if (allOk) setSubmitted(true);
  };

  // ── States ─────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <PageShell>
        <div className="flex-1 flex items-center justify-center">
          <Loader2 size={32} className="animate-spin text-white/40" />
        </div>
      </PageShell>
    );
  }

  const isExpired = request?.expires_at && new Date(request.expires_at) < new Date();
  const isInactive = !request || request.status !== "active" || isExpired || error;

  if (isInactive) {
    return (
      <PageShell>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-sm w-full text-center space-y-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ background: "rgba(203,32,57,0.15)" }}>
              <AlertCircle size={32} className="text-red-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Link unavailable</h1>
              <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>
                {isExpired
                  ? "This upload link has expired."
                  : request?.status === "closed"
                  ? "This upload link has been closed."
                  : "This upload link is invalid or no longer active."}
              </p>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  if (submitted) {
    return (
      <PageShell>
        <div className="flex-1 flex items-center justify-center p-6">
          <div className="max-w-sm w-full text-center space-y-4">
            <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto" style={{ background: "rgba(16,185,129,0.15)" }}>
              <CheckCircle2 size={32} className="text-emerald-400" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white">Files received!</h1>
              <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>
                Thank you. {sentCount === 1 ? "Your file has" : sentCount === 2 ? "Both files have" : `All ${sentCount} files have`} been delivered securely.
              </p>
              {rejectedCount > 0 && (
                <p className="text-xs mt-2" style={{ color: "rgba(255,255,255,0.45)" }}>
                  {rejectedCount === 1 ? "1 file was" : `${rejectedCount} files were`} over the size limit and not sent.
                </p>
              )}
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  const canSubmit = sendable.length > 0 && !isUploading;

  return (
    <PageShell>
    <div className="py-6 px-4">
      <div className="max-w-xl mx-auto space-y-6">

        {/* Card */}
        <div className="rounded-2xl p-6 sm:p-8 space-y-6" style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.1)",
          backdropFilter: "blur(16px)",
        }}>
          {/* Request info */}
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-white">{request.title}</h1>
            {request.description && (
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.55)" }}>{request.description}</p>
            )}
          </div>

          {/* File format instructions */}
          <div className="rounded-xl p-5 text-center space-y-3" style={{ background: "rgba(203,32,57,0.1)", border: "1px solid rgba(203,32,57,0.25)" }}>
            <p className="text-sm font-medium text-white">
              To ensure your brand looks its best, please send your logo in one of the following formats:
            </p>
            <div className="flex flex-col sm:flex-row justify-center gap-3 text-sm">
              <div className="rounded-lg px-4 py-2.5" style={{ background: "rgba(255,255,255,0.07)" }}>
                <p className="text-xs font-semibold mb-1" style={{ color: "rgba(255,255,255,0.5)", letterSpacing: "0.08em" }}>PREFERRED (VECTOR)</p>
                <p className="font-mono font-bold text-white">.AI · .EPS · .PDF</p>
              </div>
              <div className="rounded-lg px-4 py-2.5" style={{ background: "rgba(255,255,255,0.07)" }}>
                <p className="text-xs font-semibold mb-1" style={{ color: "rgba(255,255,255,0.5)", letterSpacing: "0.08em" }}>ALTERNATIVE (HIGH-RES)</p>
                <p className="font-mono font-bold text-white">.PNG · .JPG <span className="text-xs font-normal" style={{ color: "rgba(255,255,255,0.5)" }}>min 300 dpi</span></p>
              </div>
            </div>
            <p className="text-xs leading-relaxed" style={{ color: "rgba(255,255,255,0.55)" }}>
              Help us make you look good! Since we're printing on a large scale, we can only use high-quality formats. Low-res files won't make the final cut — please send the best version you have!
            </p>
            <p className="text-xs font-semibold" style={{ color: "rgba(203,32,57,0.9)" }}>Thank you for your support!</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-1.5">
              <label className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.8)" }}>
                Message <span className="text-xs" style={{ color: "rgba(255,255,255,0.35)" }}>(optional)</span>
              </label>
              <Textarea
                placeholder="Any notes for the team…"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={2}
                disabled={isUploading}
              />
            </div>

            {/* Drop zone */}
            <div
              onClick={() => !isUploading && fileInputRef.current?.click()}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                "border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors",
                dragging
                  ? "border-red-500 bg-red-500/10"
                  : "border-white/20 hover:border-white/40",
                isUploading && "opacity-50 pointer-events-none"
              )}
            >
              <Upload size={28} className="mx-auto mb-3" style={{ color: "rgba(255,255,255,0.4)" }} />
              <p className="text-sm font-medium text-white">Drop files here or click to browse</p>
              <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>
                Any file type, including video · multiple files supported
              </p>
              <p className="text-xs mt-0.5" style={{ color: "rgba(255,255,255,0.4)" }}>
                Videos up to {formatBytes(CLIENT_VIDEO_MAX_BYTES)} · other files up to {formatBytes(CLIENT_FILE_MAX_BYTES)}
              </p>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileChange}
                disabled={isUploading}
              />
            </div>

            {/* File list */}
            {selectedFiles.length > 0 && (
              <ul className="space-y-2">
                {selectedFiles.map((sf) => {
                  const Icon = isVideoFile(sf.file) ? Film : FileIcon;
                  const failed = sf.status === "error" || sf.status === "rejected";
                  const pct = sf.file.size ? Math.min(100, Math.round((sf.sent / sf.file.size) * 100)) : 0;
                  return (
                    <li
                      key={sf.id}
                      className={cn(
                        "flex items-start gap-3 px-3 py-2.5 rounded-lg border text-sm",
                        sf.status === "done"
                          ? "bg-emerald-400/10 border-emerald-400/30"
                          : failed
                          ? "bg-red-400/10 border-red-400/30"
                          : sf.status === "uploading"
                          ? "bg-white/[0.08] border-white/25"
                          : "bg-white/5 border-white/10"
                      )}
                    >
                      <Icon size={16} className="mt-0.5 shrink-0" style={{ color: "rgba(255,255,255,0.5)" }} />
                      <div className="flex-1 min-w-0">
                        <p className="truncate font-medium text-white">{sf.file.name}</p>
                        <p className="text-xs tabular-nums" style={{ color: "rgba(255,255,255,0.5)" }}>
                          {sf.status === "uploading"
                            ? `${formatBytes(sf.sent)} of ${formatBytes(sf.file.size)} · ${pct}%`
                            : sf.status === "done"
                            ? `Sent · ${formatBytes(sf.file.size)}`
                            : formatBytes(sf.file.size)}
                        </p>
                        {sf.status === "uploading" && (
                          <div
                            className="mt-1.5 h-1 rounded-full overflow-hidden bg-white/10"
                            role="progressbar"
                            aria-label={`Sending ${sf.file.name}`}
                            aria-valuemin={0}
                            aria-valuemax={100}
                            aria-valuenow={pct}
                          >
                            <div className="h-full rounded-full bg-red-500 transition-[width] duration-300" style={{ width: `${pct}%` }} />
                          </div>
                        )}
                        {failed && sf.errorMsg && (
                          <p className="text-xs text-red-300 mt-0.5">{sf.errorMsg}</p>
                        )}
                      </div>
                      {sf.status === "uploading" && (
                        <Loader2 size={14} className="mt-0.5 animate-spin text-white/60 shrink-0" />
                      )}
                      {sf.status === "done" && (
                        <CheckCircle2 size={14} className="mt-0.5 text-emerald-400 shrink-0" />
                      )}
                      {failed && (
                        <AlertCircle size={14} className="mt-0.5 text-red-400 shrink-0" />
                      )}
                      {sf.status !== "done" && sf.status !== "uploading" && !isUploading && (
                        <button
                          type="button"
                          onClick={() => removeFile(sf.id)}
                          aria-label={`Remove ${sf.file.name}`}
                          className="mt-0.5 shrink-0 text-white/40 hover:text-white"
                        >
                          <X size={14} />
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}

            <div className="space-y-2">
              <Button
                type="submit"
                className="w-full bg-red-600 hover:bg-red-700 text-white"
                disabled={!canSubmit}
              >
                {isUploading ? (
                  <><Loader2 size={15} className="animate-spin mr-2" /> Uploading{batch.total > 1 ? ` ${batch.index + 1} of ${batch.total}` : ""}…</>
                ) : (
                  <><Upload size={15} className="mr-2" /> Upload {sendable.length > 0 ? `${sendable.length} file${sendable.length !== 1 ? "s" : ""}` : "Files"}</>
                )}
              </Button>
              {isUploading && (
                <p className="text-xs text-center" style={{ color: "rgba(255,255,255,0.5)" }}>
                  Keep this page open until every file shows Sent.
                </p>
              )}
            </div>
          </form>
        </div>

      </div>
    </div>
    </PageShell>
  );
}
