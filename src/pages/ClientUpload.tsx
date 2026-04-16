import { useState, useRef, useCallback } from "react";
import { useParams } from "react-router-dom";
import { Upload, X, CheckCircle2, AlertCircle, Loader2, FileIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useFileRequest } from "@/hooks/useFileRequests";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

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
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 size={32} className="animate-spin text-gray-400" />
      </div>
    );
  }

  const isExpired = request?.expires_at && new Date(request.expires_at) < new Date();
  const isInactive = !request || request.status !== "active" || isExpired || error;

  if (isInactive) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="text-3xl font-black tracking-tight text-red-600">LV Branding</div>
          <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto">
            <AlertCircle size={32} className="text-red-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Link unavailable</h1>
            <p className="text-sm text-gray-500 mt-1">
              {isExpired
                ? "This upload link has expired."
                : request?.status === "closed"
                ? "This upload link has been closed."
                : "This upload link is invalid or no longer active."}
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (submitted) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="text-3xl font-black tracking-tight text-red-600">LV Branding</div>
          <div className="w-16 h-16 rounded-full bg-emerald-50 flex items-center justify-center mx-auto">
            <CheckCircle2 size={32} className="text-emerald-500" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Files received!</h1>
            <p className="text-sm text-gray-500 mt-1">
              Thank you{name ? `, ${name}` : ""}. Your files have been delivered securely.
            </p>
          </div>
        </div>
      </div>
    );
  }

  const canSubmit = name.trim() && email.trim() && selectedFiles.length > 0 && !isUploading;

  return (
    <div className="min-h-screen bg-gray-50 py-10 px-4">
      <div className="max-w-xl mx-auto space-y-6">
        {/* Branding */}
        <div className="text-center">
          <div className="text-3xl font-black tracking-tight text-red-600">LV Branding</div>
        </div>

        {/* Card */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-200 p-6 sm:p-8 space-y-6">
          {/* Request info */}
          <div className="space-y-1">
            <h1 className="text-xl font-bold text-gray-900">{request.title}</h1>
            {request.description && (
              <p className="text-sm text-gray-500">{request.description}</p>
            )}
          </div>

          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Uploader info */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-gray-700">
                  Your name <span className="text-red-500">*</span>
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
                <label className="text-sm font-medium text-gray-700">
                  Your email <span className="text-red-500">*</span>
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
              <label className="text-sm font-medium text-gray-700">
                Message <span className="text-gray-400 text-xs">(optional)</span>
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
                  ? "border-red-400 bg-red-50"
                  : "border-gray-300 hover:border-gray-400 bg-gray-50",
                isUploading && "opacity-50 pointer-events-none"
              )}
            >
              <Upload size={28} className="mx-auto text-gray-400 mb-3" />
              <p className="text-sm font-medium text-gray-700">Drop files here or click to browse</p>
              <p className="text-xs text-gray-400 mt-1">Any file type, multiple files supported</p>
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
                      <p className="truncate font-medium text-gray-800">{sf.file.name}</p>
                      <p className="text-xs text-gray-400">{formatBytes(sf.file.size)}</p>
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

        <p className="text-center text-xs text-gray-400">
          Powered by LV Branding Marketing Suite
        </p>
      </div>
    </div>
  );
}
