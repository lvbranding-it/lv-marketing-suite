import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, AlertCircle, Loader2, Clock, FileIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import LVLogo from "@/components/LVLogo";

interface ShareFile {
  fileName:    string;
  fileSize:    number;
  mimeType:    string;
  downloadUrl: string;
}

interface ShareInfo {
  label:     string;
  expiresAt: string | null;
  files:     ShareFile[];
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

async function triggerDownload(url: string, fileName: string) {
  const res  = await fetch(url);
  const blob = await res.blob();
  const a    = Object.assign(document.createElement("a"), {
    href:     URL.createObjectURL(blob),
    download: fileName,
  });
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

export default function FileDownload() {
  const { token } = useParams<{ token: string }>();
  const [state, setState]       = useState<"loading" | "ready" | "error" | "expired">("loading");
  const [info, setInfo]         = useState<ShareInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState("");

  // Per-file downloading state
  const [downloading, setDownloading] = useState<Record<number, boolean>>({});
  const [downloadingAll, setDownloadingAll] = useState(false);

  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string;
  const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

  useEffect(() => {
    if (!token) { setState("error"); setErrorMsg("Invalid link."); return; }

    (async () => {
      try {
        const res = await fetch(
          `${supabaseUrl}/functions/v1/get-share?token=${encodeURIComponent(token)}`,
          { headers: { apikey: supabaseKey } }
        );
        if (res.status === 410) { setState("expired"); return; }
        if (res.status === 404) { setState("error"); setErrorMsg("This link doesn't exist or was removed."); return; }
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          setState("error");
          setErrorMsg((body as { error?: string }).error ?? "Failed to load share.");
          return;
        }
        const data = await res.json() as ShareInfo;
        setInfo(data);
        setState("ready");
      } catch {
        setState("error");
        setErrorMsg("Network error. Please try again.");
      }
    })();
  }, [token, supabaseUrl, supabaseKey]);

  const handleDownloadOne = async (file: ShareFile, index: number) => {
    setDownloading(prev => ({ ...prev, [index]: true }));
    try { await triggerDownload(file.downloadUrl, file.fileName); }
    catch { /* silent */ }
    finally { setDownloading(prev => ({ ...prev, [index]: false })); }
  };

  const handleDownloadAll = async () => {
    if (!info) return;
    setDownloadingAll(true);
    for (const file of info.files) {
      try { await triggerDownload(file.downloadUrl, file.fileName); }
      catch { /* skip failed file */ }
    }
    setDownloadingAll(false);
  };

  const totalSize = info?.files.reduce((s, f) => s + f.fileSize, 0) ?? 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md flex flex-col items-center gap-4">

        {/* Logo — outside the card */}
        <LVLogo size={55} />

        {/* Card */}
        <div className="w-full bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
          <div className="h-1.5 bg-gradient-to-r from-rose-500 to-rose-400" />

          <div className="p-8">
            {/* Loading */}
            {state === "loading" && (
              <div className="flex flex-col items-center gap-4 py-6 text-muted-foreground">
                <Loader2 size={32} className="animate-spin text-rose-500" />
                <p className="text-sm">Loading share…</p>
              </div>
            )}

            {/* Error / Expired */}
            {(state === "error" || state === "expired") && (
              <div className="flex flex-col items-center gap-4 py-6 text-center">
                <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
                  {state === "expired"
                    ? <Clock size={26} className="text-amber-500" />
                    : <AlertCircle size={26} className="text-red-500" />}
                </div>
                <div>
                  <p className="text-base font-semibold text-slate-800">
                    {state === "expired" ? "Link expired" : "Link not found"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {state === "expired" ? "This download link is no longer valid." : errorMsg}
                  </p>
                </div>
              </div>
            )}

            {/* Ready */}
            {state === "ready" && info && (
              <div className="flex flex-col gap-5">
                {/* Header */}
                <div>
                  <p className="text-lg font-bold text-slate-800">{info.label}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {info.files.length} file{info.files.length !== 1 ? "s" : ""} · {formatBytes(totalSize)}
                  </p>
                </div>

                {/* Expiry */}
                {info.expiresAt && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
                    <Clock size={12} />
                    Expires {format(new Date(info.expiresAt), "MMMM d, yyyy")}
                  </div>
                )}

                {/* File list */}
                <div className="space-y-2">
                  {info.files.map((file, i) => (
                    <div
                      key={i}
                      className="relative overflow-hidden border border-border rounded-lg"
                    >
                      <div className="flex items-center gap-3 px-3 py-2.5">
                        <div className="w-8 h-8 rounded-md bg-rose-50 flex items-center justify-center shrink-0">
                          <FileIcon size={14} className="text-rose-500" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate" title={file.fileName}>
                            {file.fileName}
                          </p>
                          <p className="text-xs text-muted-foreground">
                            {downloading[i] ? "Downloading…" : formatBytes(file.fileSize)}
                          </p>
                        </div>
                        <Button
                          size="sm"
                          variant={downloading[i] ? "secondary" : "outline"}
                          className="h-7 text-xs gap-1 shrink-0"
                          onClick={() => handleDownloadOne(file, i)}
                          disabled={downloading[i]}
                        >
                          {downloading[i]
                            ? <><Loader2 size={11} className="animate-spin" /> Downloading…</>
                            : <><Download size={11} /> Download</>}
                        </Button>
                      </div>
                      {/* Progress bar */}
                      {downloading[i] && (
                        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-rose-100 overflow-hidden">
                          <div className="h-full w-2/5 bg-rose-500"
                            style={{ animation: "indeterminate 1.4s ease-in-out infinite" }}
                          />
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {/* Download all (only when multiple files) */}
                {info.files.length > 1 && (
                  <div className="space-y-1.5">
                    <Button
                      size="lg"
                      className="w-full gap-2 bg-rose-500 hover:bg-rose-600 text-white"
                      onClick={handleDownloadAll}
                      disabled={downloadingAll}
                    >
                      {downloadingAll
                        ? <><Loader2 size={16} className="animate-spin" /> Downloading files…</>
                        : <><Download size={16} /> Download All</>}
                    </Button>
                    {downloadingAll && (
                      <div className="w-full h-1 bg-rose-100 rounded-full overflow-hidden">
                        <div className="h-full w-2/5 bg-rose-500 rounded-full"
                          style={{ animation: "indeterminate 1.4s ease-in-out infinite" }}
                        />
                      </div>
                    )}
                  </div>
                )}

                {/* Single file: big download button */}
                {info.files.length === 1 && (
                  <Button
                    size="lg"
                    className="w-full gap-2 bg-rose-500 hover:bg-rose-600 text-white"
                    onClick={() => handleDownloadOne(info.files[0], 0)}
                    disabled={downloading[0]}
                  >
                    {downloading[0]
                      ? <><Loader2 size={16} className="animate-spin" /> Downloading…</>
                      : <><Download size={16} /> Download File</>}
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        <p className="text-xs text-muted-foreground">LV Marketing Suite</p>
      </div>
    </div>
  );
}
