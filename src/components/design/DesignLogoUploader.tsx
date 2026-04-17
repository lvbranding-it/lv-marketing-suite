import { useRef, useState } from "react";
import { Upload, X, ImageIcon, Loader2 } from "lucide-react";
import { compressImage } from "@/hooks/useBrandKit";
import { cn } from "@/lib/utils";

const ACCEPTED = ["image/png", "image/jpeg", "image/webp", "image/svg+xml", "image/gif"];

interface DesignLogoUploaderProps {
  logoDataUrl: string | null;
  logoFileName: string | null;
  onUpload: (dataUrl: string, fileName: string) => void;
  onClear: () => void;
}

export default function DesignLogoUploader({
  logoDataUrl,
  logoFileName,
  onUpload,
  onClear,
}: DesignLogoUploaderProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFile = async (file: File) => {
    if (!ACCEPTED.includes(file.type)) {
      setError("Unsupported format. Use PNG, JPG, SVG, or WebP.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const dataUrl = await compressImage(file);
      onUpload(dataUrl, file.name);
    } catch {
      setError("Failed to process image. Please try another file.");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleFile(file);
    e.target.value = "";
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  if (logoDataUrl) {
    return (
      <div className="flex items-center gap-3 p-2.5 rounded-xl border border-border bg-muted/30">
        <div className="w-12 h-12 rounded-lg border border-border bg-white flex items-center justify-center overflow-hidden shrink-0">
          <img
            src={logoDataUrl}
            alt="Brand logo"
            className="max-w-full max-h-full object-contain"
          />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-medium truncate">{logoFileName ?? "Logo"}</p>
          <p className="text-[10px] text-green-600 mt-0.5">✓ Will be used in designs</p>
        </div>
        <button
          type="button"
          onClick={onClear}
          className="w-6 h-6 rounded-md flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors shrink-0"
          title="Remove logo"
        >
          <X size={13} />
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
        disabled={loading}
        className={cn(
          "w-full rounded-xl border-2 border-dashed p-4 flex flex-col items-center gap-2 transition-all text-center cursor-pointer",
          dragging
            ? "border-primary bg-primary/5 text-primary"
            : "border-border text-muted-foreground hover:border-primary/50 hover:text-foreground",
          loading && "opacity-60 cursor-wait"
        )}
      >
        {loading ? (
          <Loader2 size={20} className="animate-spin" />
        ) : (
          <div className="w-9 h-9 rounded-lg bg-muted flex items-center justify-center">
            {dragging ? <Upload size={16} /> : <ImageIcon size={16} />}
          </div>
        )}
        <div>
          <p className="text-xs font-medium">
            {loading ? "Processing…" : dragging ? "Drop it here" : "Upload your logo"}
          </p>
          {!loading && !dragging && (
            <p className="text-[10px] mt-0.5">PNG, JPG, SVG, WebP · Click or drag</p>
          )}
        </div>
      </button>

      {error && <p className="text-[10px] text-destructive">{error}</p>}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED.join(",")}
        onChange={handleInputChange}
        className="sr-only"
      />
    </div>
  );
}
