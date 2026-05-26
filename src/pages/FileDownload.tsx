import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Download, AlertCircle, Loader2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import LVLogo from "@/components/LVLogo";

interface ShareInfo {
  label:       string;
  fileName:    string;
  fileSize:    number;
  mimeType:    string;
  expiresAt:   string | null;
  downloadUrl: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

export default function FileDownload() {
  const { token } = useParams<{ token: string }>();
  const [state, setState] = useState<"loading" | "ready" | "error" | "expired">("loading");
  const [info, setInfo] = useState<ShareInfo | null>(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [downloading, setDownloading] = useState(false);

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

  const handleDownload = async () => {
    if (!info) return;
    setDownloading(true);
    try {
      const res = await fetch(info.downloadUrl);
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = info.fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    } catch {
      // silent — browser will show its own error
    } finally {
      setDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-md flex flex-col items-center gap-4">

        {/* Logo — outside the card */}
        <LVLogo size={55} />

        {/* Card */}
        <div className="w-full bg-white rounded-2xl shadow-lg border border-slate-200 overflow-hidden">
          {/* Top accent */}
          <div className="h-1.5 bg-gradient-to-r from-rose-500 to-rose-400" />

          <div className="p-8">
            {/* Loading */}
            {state === "loading" && (
              <div className="flex flex-col items-center gap-4 py-6 text-muted-foreground">
                <Loader2 size={32} className="animate-spin text-rose-500" />
                <p className="text-sm">Loading share…</p>
              </div>
            )}

            {/* Error */}
            {(state === "error" || state === "expired") && (
              <div className="flex flex-col items-center gap-4 py-6 text-center">
                <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center">
                  {state === "expired"
                    ? <Clock size={26} className="text-amber-500" />
                    : <AlertCircle size={26} className="text-red-500" />
                  }
                </div>
                <div>
                  <p className="text-base font-semibold text-slate-800">
                    {state === "expired" ? "Link expired" : "Link not found"}
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    {state === "expired"
                      ? "This download link is no longer valid."
                      : errorMsg}
                  </p>
                </div>
              </div>
            )}

            {/* Ready */}
            {state === "ready" && info && (
              <div className="flex flex-col items-center gap-6">
                {/* Info */}
                <div className="text-center">
                  <p className="text-lg font-bold text-slate-800 mb-1">{info.label}</p>
                  <p className="text-xs text-muted-foreground">{formatBytes(info.fileSize)}</p>
                </div>

                {/* Expiry notice */}
                {info.expiresAt && (
                  <div className="flex items-center gap-1.5 text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 w-full justify-center">
                    <Clock size={12} />
                    Expires {format(new Date(info.expiresAt), "MMMM d, yyyy")}
                  </div>
                )}

                {/* Download button */}
                <Button
                  size="lg"
                  className="w-full gap-2 bg-rose-500 hover:bg-rose-600 text-white"
                  onClick={handleDownload}
                  disabled={downloading}
                >
                  {downloading
                    ? <><Loader2 size={16} className="animate-spin" /> Downloading…</>
                    : <><Download size={16} /> Download File</>
                  }
                </Button>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <p className="text-xs text-muted-foreground">LV Marketing Suite</p>
      </div>
    </div>
  );
}
