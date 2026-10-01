import { AlertCircle, CheckCircle2, Loader2, RotateCcw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import type { BatchEntry, SkippedFile } from "@/hooks/useUploadBatch";

/**
 * Where a batch upload stands: one bar for the whole batch rather than a row
 * per file, then only the files that need attention — the ones skipped before
 * they started, and the ones that failed, each with its reason.
 */
export default function UploadBatchStatus({
  noun,
  total,
  done,
  running,
  failed,
  skipped,
  onRetry,
  onDismiss,
}: {
  noun: { one: string; many: string };
  total: number;
  done: number;
  running: boolean;
  failed: BatchEntry[];
  skipped: SkippedFile[];
  onRetry: () => void;
  onDismiss: () => void;
}) {
  if (!total && !skipped.length) return null;
  const word = (n: number) => (n === 1 ? noun.one : noun.many);
  const percent = total ? Math.round((done / total) * 100) : 100;

  return (
    <div className="space-y-3 rounded-lg border border-border bg-muted/30 p-3" role="status" aria-live="polite">
      {total > 0 && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-1.5 font-medium text-foreground">
              {running ? (
                <Loader2 size={14} className="animate-spin text-muted-foreground" />
              ) : failed.length ? (
                <AlertCircle size={14} className="text-destructive" />
              ) : (
                <CheckCircle2 size={14} className="text-emerald-600" />
              )}
              {running
                ? `Uploading ${done} of ${total} ${word(total)}…`
                : `${done} of ${total} ${word(total)} uploaded`}
            </span>
            {failed.length > 0 && <span className="shrink-0 text-xs font-medium text-destructive">{failed.length} failed</span>}
          </div>
          <Progress value={percent} className="h-1.5" />
          {running && <p className="text-xs text-muted-foreground">Keep this page open until it finishes.</p>}
        </div>
      )}

      {failed.length > 0 && (
        <FileList title={`Failed (${failed.length})`} tone="destructive" items={failed.map((entry) => ({ name: entry.file.name, reason: entry.error ?? "Upload failed." }))} />
      )}
      {skipped.length > 0 && (
        <FileList title={`Not uploaded (${skipped.length})`} tone="muted" items={skipped} />
      )}

      {!running && (
        <div className="flex flex-wrap items-center gap-2">
          {failed.length > 0 && (
            <Button size="sm" onClick={onRetry} className="h-8 gap-1.5">
              <RotateCcw size={13} />
              Retry {failed.length} failed
            </Button>
          )}
          <Button size="sm" variant="ghost" onClick={onDismiss} className="h-8 gap-1.5 text-muted-foreground">
            <X size={13} />
            Dismiss
          </Button>
        </div>
      )}
    </div>
  );
}

function FileList({ title, tone, items }: { title: string; tone: "destructive" | "muted"; items: SkippedFile[] }) {
  return (
    <div className="space-y-1">
      <p className={`text-xs font-semibold ${tone === "destructive" ? "text-destructive" : "text-muted-foreground"}`}>{title}</p>
      <ul className="max-h-40 space-y-1 overflow-y-auto pr-1 text-xs">
        {items.map((item, index) => (
          <li key={`${item.name}-${index}`} className="flex flex-col gap-0.5 sm:flex-row sm:gap-2">
            <span className="min-w-0 flex-1 truncate font-medium text-foreground" title={item.name}>{item.name}</span>
            <span className="text-muted-foreground sm:max-w-[60%] sm:text-right">{item.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
