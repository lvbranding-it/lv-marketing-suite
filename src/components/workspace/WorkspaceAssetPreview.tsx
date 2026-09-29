import { useEffect, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { format } from "date-fns";
import { ChevronLeft, ChevronRight, Download, ExternalLink, FileQuestion, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import type { WorkspaceAsset } from "@/integrations/supabase/types";
import { WORKSPACE_ASSET_BUCKET, useWorkspaceAssetSignedUrl } from "@/hooks/useWorkspace";

export type AssetKind = "image" | "video" | "pdf" | "text" | "other";

const TEXT_EXTENSIONS = new Set(["txt", "csv", "json", "css", "ics", "md", "html", "xml"]);
/** Text files are read whole to be shown; past this, the preview offers the file instead. */
const TEXT_PREVIEW_MAX_BYTES = 512 * 1024;

export function assetKind(asset: Pick<WorkspaceAsset, "mime_type" | "file_name">): AssetKind {
  const type = asset.mime_type ?? "";
  const extension = asset.file_name.split(".").pop()?.toLowerCase() ?? "";
  // SVG included: logos are meant to be looked at, and an SVG shown as an
  // image cannot run anything it contains.
  if (type.startsWith("image/") || extension === "svg") return "image";
  if (type.startsWith("video/")) return "video";
  if (type === "application/pdf" || extension === "pdf") return "pdf";
  if (type.startsWith("text/") || type === "application/json" || TEXT_EXTENSIONS.has(extension)) return "text";
  return "other";
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

/**
 * Saves a stored file to the person's computer.
 *
 * The link is created at the moment of the click, carrying the file's name as
 * the download name, which makes the server send it as an attachment. Without
 * that, a PDF or a video would simply open in the browser instead.
 */
export async function downloadWorkspaceAsset(asset: WorkspaceAsset) {
  const { data, error } = await supabase.storage
    .from(WORKSPACE_ASSET_BUCKET)
    .createSignedUrl(asset.storage_path, 300, { download: asset.file_name });
  if (error || !data) {
    toast({ title: "Download failed", description: error?.message ?? "Please try again.", variant: "destructive" });
    return;
  }
  const link = document.createElement("a");
  link.href = data.signedUrl;
  link.rel = "noopener";
  document.body.appendChild(link);
  link.click();
  link.remove();
}

function TextPreview({ url, asset }: { url: string; asset: WorkspaceAsset }) {
  const tooLarge = asset.file_size > TEXT_PREVIEW_MAX_BYTES;
  const { data, isLoading, isError } = useQuery({
    queryKey: ["workspace_asset_text", asset.storage_path],
    queryFn: async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.text();
    },
    enabled: !tooLarge,
    staleTime: Infinity,
  });

  if (tooLarge) return <NoPreview asset={asset} reason="This file is too large to show here." />;
  if (isLoading) return <Centered><Loader2 className="animate-spin text-muted-foreground" /></Centered>;
  if (isError) return <NoPreview asset={asset} reason="This file could not be read." />;
  return (
    <pre className="h-full overflow-auto whitespace-pre-wrap break-words rounded-md bg-muted/40 p-4 font-mono text-xs leading-relaxed">
      {data}
    </pre>
  );
}

const Centered = ({ children }: { children: ReactNode }) => (
  <div className="flex h-full min-h-[40vh] flex-col items-center justify-center gap-3 text-center">{children}</div>
);

function NoPreview({ asset, reason }: { asset: WorkspaceAsset; reason: string }) {
  return (
    <Centered>
      <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <FileQuestion size={24} />
      </div>
      <div>
        <p className="text-sm font-medium">{reason}</p>
        <p className="mt-1 text-xs text-muted-foreground">Download it to open it in its own app.</p>
      </div>
      <Button size="sm" onClick={() => downloadWorkspaceAsset(asset)}>
        <Download size={13} />
        Download {asset.file_name.split(".").pop()?.toUpperCase()}
      </Button>
    </Centered>
  );
}

function PreviewBody({ asset }: { asset: WorkspaceAsset }) {
  const { data: url, isLoading } = useWorkspaceAssetSignedUrl(asset.storage_path);
  const [videoFailed, setVideoFailed] = useState(false);
  const kind = assetKind(asset);

  useEffect(() => setVideoFailed(false), [asset.id]);

  if (isLoading || !url) return <Centered><Loader2 className="animate-spin text-muted-foreground" /></Centered>;

  switch (kind) {
    case "image":
      return (
        <div className="flex h-full items-center justify-center">
          <img src={url} alt={asset.file_name} className="max-h-full max-w-full rounded-md object-contain" />
        </div>
      );
    case "video":
      // An iPhone .mov recorded in HEVC plays in Safari but not in Chrome.
      // When the browser cannot play it, say so and offer the file, rather
      // than leaving a black box with a play button that does nothing.
      return videoFailed ? (
        <NoPreview asset={asset} reason="This browser can't play this video format." />
      ) : (
        <div className="flex h-full items-center justify-center bg-black">
          <video
            key={asset.id}
            src={url}
            controls
            playsInline
            preload="metadata"
            onError={() => setVideoFailed(true)}
            className="max-h-full max-w-full"
          />
        </div>
      );
    case "pdf":
      return <iframe src={url} title={asset.file_name} className="h-full w-full rounded-md border border-border bg-white" />;
    case "text":
      return <TextPreview url={url} asset={asset} />;
    default:
      return <NoPreview asset={asset} reason="There is no preview for this type of file." />;
  }
}

/**
 * The reference library's files, opened in place.
 *
 * Opening a file used to leave the page for a new tab. Here it opens over the
 * page instead, and the arrow keys move through the page's other files, so
 * going through a folder of references is one continuous look rather than a
 * trail of tabs.
 */
export default function WorkspaceAssetPreview({
  assets,
  index,
  onIndexChange,
}: {
  assets: WorkspaceAsset[];
  index: number | null;
  onIndexChange: (index: number | null) => void;
}) {
  const asset = index !== null ? assets[index] : undefined;
  const { data: url } = useWorkspaceAssetSignedUrl(asset?.storage_path);
  const hasMany = assets.length > 1;

  const step = (delta: number) => {
    if (index === null || !assets.length) return;
    onIndexChange((index + delta + assets.length) % assets.length);
  };

  useEffect(() => {
    if (index === null || !hasMany) return;
    const onKey = (event: KeyboardEvent) => {
      // Arrow keys on a playing video seek it; they must not also change file.
      const target = event.target as HTMLElement | null;
      if (target && /^(VIDEO|INPUT|TEXTAREA|SELECT)$/.test(target.tagName)) return;
      if (event.key === "ArrowRight") step(1);
      if (event.key === "ArrowLeft") step(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // Close if the file being shown was deleted underneath.
  useEffect(() => {
    if (index !== null && !asset) onIndexChange(null);
  }, [asset, index, onIndexChange]);

  return (
    <Dialog open={!!asset} onOpenChange={(open) => !open && onIndexChange(null)}>
      <DialogContent className="flex h-[88vh] max-h-[88vh] w-[96vw] max-w-6xl flex-col gap-0 overflow-hidden p-0">
        {asset && (
          <>
            <div className="flex min-w-0 items-start gap-3 border-b border-border px-4 py-3 pr-12">
              <div className="min-w-0 flex-1">
                <DialogTitle className="truncate text-sm font-semibold" title={asset.file_name}>
                  {asset.file_name}
                </DialogTitle>
                <DialogDescription className="mt-0.5 text-xs">
                  {formatBytes(asset.file_size)} · added {format(new Date(asset.created_at), "d MMM yyyy")}
                  {hasMany && ` · ${index! + 1} of ${assets.length}`}
                </DialogDescription>
              </div>
            </div>

            <div className="relative min-h-0 flex-1 bg-muted/20 p-3 sm:p-4">
              <PreviewBody asset={asset} />
              {hasMany && (
                <>
                  <button
                    type="button"
                    aria-label="Previous file"
                    onClick={() => step(-1)}
                    className="absolute left-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/90 shadow-sm hover:bg-background"
                  >
                    <ChevronLeft size={18} />
                  </button>
                  <button
                    type="button"
                    aria-label="Next file"
                    onClick={() => step(1)}
                    className="absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full border border-border bg-background/90 shadow-sm hover:bg-background"
                  >
                    <ChevronRight size={18} />
                  </button>
                </>
              )}
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border px-4 py-2.5">
              {hasMany && <span className="mr-auto hidden text-xs text-muted-foreground sm:inline">Use ← → to move between files</span>}
              {url && (
                <Button variant="ghost" size="sm" asChild>
                  <a href={url} target="_blank" rel="noreferrer">
                    <ExternalLink size={13} />
                    Open in new tab
                  </a>
                </Button>
              )}
              <Button size="sm" onClick={() => downloadWorkspaceAsset(asset)}>
                <Download size={13} />
                Download
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
