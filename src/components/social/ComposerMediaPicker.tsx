import { useState, type DragEvent } from "react";
import { AlertTriangle, ChevronLeft, ChevronRight, Play, Upload, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { instagramRatioProblem, needsInstagramCopy } from "@/lib/socialMedia";
import { mediaFileKey } from "@/hooks/useMediaPreviews";
import type { PreviewMedia } from "./SocialPostPreview";

const ACCEPT = "image/jpeg,image/png,image/webp,video/mp4,video/quicktime";
const ACCEPTED = new Set(ACCEPT.split(","));

interface ComposerMediaPickerProps {
  files: File[];
  previews: PreviewMedia[];
  onChange: (files: File[]) => void;
  /** An Instagram feed image or carousel is being made from these files. */
  instagramFeed: boolean;
  /** Any Instagram destination is selected. */
  instagram: boolean;
}

/**
 * The post's images and video: added by choosing or dropping files, each
 * shown with its thumbnail, removable, and in the order a carousel uses.
 * Choosing more files used to replace the ones already chosen.
 */
export default function ComposerMediaPicker({ files, previews, onChange, instagramFeed, instagram }: ComposerMediaPickerProps) {
  const [dragging, setDragging] = useState(false);

  const add = (picked: File[]) => {
    const known = new Set(files.map(mediaFileKey));
    const fresh = picked.filter((file) => ACCEPTED.has(file.type) && !known.has(mediaFileKey(file)));
    if (fresh.length) onChange([...files, ...fresh]);
  };
  const remove = (index: number) => onChange(files.filter((_, i) => i !== index));
  const move = (index: number, by: -1 | 1) => {
    const next = [...files];
    [next[index], next[index + by]] = [next[index + by], next[index]];
    onChange(next);
  };
  const onDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    add(Array.from(event.dataTransfer.files));
  };

  const converted = instagram && files.some((file, index) => needsInstagramCopy(file, previews[index]?.size));

  return (
    <div className="space-y-3">
      <label
        onDragOver={(event) => { event.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={cn(
          "flex cursor-pointer flex-col items-center justify-center gap-1 rounded-xl border border-dashed p-5 text-center text-sm text-muted-foreground transition",
          "hover:border-primary hover:text-primary focus-within:ring-2 focus-within:ring-ring",
          dragging && "border-primary bg-primary/5 text-primary",
        )}
      >
        <span className="flex items-center gap-2 font-medium"><Upload className="h-4 w-4" />Drop images or video, or choose files</span>
        <span className="text-xs">JPEG, PNG, WebP, MP4 or MOV, up to 100 MB each</span>
        <input
          type="file"
          multiple
          accept={ACCEPT}
          className="sr-only"
          onChange={(event) => {
            add(Array.from(event.target.files || []));
            // Cleared, so the same file can be chosen again after removing it.
            event.target.value = "";
          }}
        />
      </label>

      {files.length > 0 && (
        <ul className="grid grid-cols-3 gap-2 sm:grid-cols-4">
          {files.map((file, index) => {
            const preview = previews[index];
            const problem = instagramFeed && preview?.kind === "image" && preview.size ? instagramRatioProblem(preview.size, file.name) : null;
            return (
              <li key={mediaFileKey(file)} className={cn("group relative overflow-hidden rounded-lg border bg-muted", problem && "border-amber-400 ring-1 ring-amber-400")}>
                <div className="aspect-square">
                  {preview?.kind === "video" ? (
                    <>
                      <video src={preview.url} className="h-full w-full object-cover" muted playsInline preload="metadata" />
                      <Play className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 fill-white text-white drop-shadow" aria-hidden />
                    </>
                  ) : preview ? (
                    <img src={preview.url} alt={file.name} className="h-full w-full object-cover" />
                  ) : null}
                </div>
                <span className="absolute left-1 top-1 grid h-5 min-w-5 place-items-center rounded-full bg-black/60 px-1 text-[11px] font-medium text-white tabular-nums">{index + 1}</span>
                {problem && (
                  <span className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-amber-400 text-amber-950" title={problem}>
                    <AlertTriangle className="h-3 w-3" aria-label={problem} />
                  </span>
                )}
                <div className="absolute inset-x-1 bottom-1 flex justify-between gap-1 opacity-100 transition sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                  <span className="flex gap-1">
                    {index > 0 && (
                      <button type="button" onClick={() => move(index, -1)} className="grid h-6 w-6 place-items-center rounded-md bg-white/90 text-foreground shadow" aria-label={`Move ${file.name} earlier`}>
                        <ChevronLeft className="h-3.5 w-3.5" />
                      </button>
                    )}
                    {index < files.length - 1 && (
                      <button type="button" onClick={() => move(index, 1)} className="grid h-6 w-6 place-items-center rounded-md bg-white/90 text-foreground shadow" aria-label={`Move ${file.name} later`}>
                        <ChevronRight className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </span>
                  <button type="button" onClick={() => remove(index)} className="grid h-6 w-6 place-items-center rounded-md bg-white/90 text-red-600 shadow" aria-label={`Remove ${file.name}`}>
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {converted && (
        <p className="text-xs text-muted-foreground">
          Instagram only takes JPEG images up to 1440 pixels wide, so a JPEG copy is made for it when you save. Facebook gets the original.
        </p>
      )}
    </div>
  );
}
