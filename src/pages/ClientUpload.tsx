import React, { useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Upload, X, CheckCircle2, AlertCircle, Loader2, FileIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFileRequest } from "@/hooks/useFileRequests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
      <div style={{ position: "relative", zIndex: 1, textAlign: "center", paddingTop: "4rem", paddingBottom: "2rem" }}>
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
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

type FileStatus = "pending" | "uploading" | "done" | "error";

interface SelectedFile {
  file: File;
  status: FileStatus;
  errorMsg?: string;
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ClientUpload() {
  const { token } = useParams<{ token: string }>();
  const { data: request, isLoading, error } = useFileRequest(token ?? null);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((files: File[]) => {
    const newEntries: SelectedFile[] = files.map((f) => ({ file: f, status: "pending" }));
    setSelectedFiles((prev) => [...prev, ...newEntries]);
  }, []);

  const removeFile = (index: number) => {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  };

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim() || selectedFiles.length === 0 || !token) return;

    setIsUploading(true);
    const edgeFnUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/client-upload`;

    let allOk = true;

    for (let i = 0; i < selectedFiles.length; i++) {
      if (selectedFiles[i].status === "done") continue;

      setSelectedFiles((prev) =>
        prev.map((sf, idx) => (idx === i ? { ...sf, status: "uploading" } : sf))
      );

      const formData = new FormData();
      formData.append("token", token);
      formData.append("uploader_name", name.trim());
      formData.append("uploader_email", email.trim());
      if (message.trim()) formData.append("message", message.trim());
      formData.append("file", selectedFiles[i].file);

      try {
        const res = await fetch(edgeFnUrl, { method: "POST", body: formData });
        const json = await res.json();
        if (!res.ok || !json.ok) {
          throw new Error(json.error ?? "Upload failed");
        }
        setSelectedFiles((prev) =>
          prev.map((sf, idx) => (idx === i ? { ...sf, status: "done" } : sf))
        );
      } catch (err) {
        allOk = false;
        setSelectedFiles((prev) =>
          prev.map((sf, idx) =>
            idx === i
              ? { ...sf, status: "error", errorMsg: err instanceof Error ? err.message : "Upload failed" }
              : sf
          )
        );
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
                Thank you{name ? `, ${name}` : ""}. Your files have been delivered securely.
              </p>
            </div>
          </div>
        </div>
      </PageShell>
    );
  }

  const canSubmit = name.trim() && email.trim() && selectedFiles.length > 0 && !isUploading;

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

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Uploader info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.8)" }}>
                  Your name <span className="text-red-400">*</span>
                </label>
                <Input
                  placeholder="Jane Smith"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  disabled={isUploading}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-sm font-medium" style={{ color: "rgba(255,255,255,0.8)" }}>
                  Your email <span className="text-red-400">*</span>
                </label>
                <Input
                  type="email"
                  placeholder="jane@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={isUploading}
                />
              </div>
            </div>

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
              <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.4)" }}>Any file type · multiple files supported</p>
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
                {selectedFiles.map((sf, i) => (
                  <li
                    key={i}
                    className={cn(
                      "flex items-center gap-3 px-3 py-2.5 rounded-lg border text-sm",
                      sf.status === "done"
                        ? "bg-emerald-50 border-emerald-200"
                        : sf.status === "error"
                        ? "bg-red-50 border-red-200"
                        : sf.status === "uploading"
                        ? "bg-blue-50 border-blue-200"
                        : "bg-white border-gray-200"
                    )}
                  >
                    <FileIcon size={14} className="shrink-0 text-gray-400" />
                    <div className="flex-1 min-w-0">
                      <p className="truncate font-medium text-white">{sf.file.name}</p>
                      <p className="text-xs" style={{ color: "rgba(255,255,255,0.45)" }}>{formatBytes(sf.file.size)}</p>
                      {sf.status === "error" && sf.errorMsg && (
                        <p className="text-xs text-red-600 mt-0.5">{sf.errorMsg}</p>
                      )}
                    </div>
                    {sf.status === "uploading" && (
                      <Loader2 size={14} className="animate-spin text-blue-500 shrink-0" />
                    )}
                    {sf.status === "done" && (
                      <CheckCircle2 size={14} className="text-emerald-500 shrink-0" />
                    )}
                    {sf.status === "error" && (
                      <AlertCircle size={14} className="text-red-500 shrink-0" />
                    )}
                    {sf.status === "pending" && !isUploading && (
                      <button
                        type="button"
                        onClick={() => removeFile(i)}
                        className="text-gray-400 hover:text-gray-600 shrink-0"
                      >
                        <X size={14} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            )}

            <Button
              type="submit"
              className="w-full bg-red-600 hover:bg-red-700 text-white"
              disabled={!canSubmit}
            >
              {isUploading ? (
                <><Loader2 size={15} className="animate-spin mr-2" /> Uploading…</>
              ) : (
                <><Upload size={15} className="mr-2" /> Upload {selectedFiles.length > 0 ? `${selectedFiles.length} file${selectedFiles.length !== 1 ? "s" : ""}` : "Files"}</>
              )}
            </Button>
          </form>
        </div>

      </div>
    </div>
    </PageShell>
  );
}
