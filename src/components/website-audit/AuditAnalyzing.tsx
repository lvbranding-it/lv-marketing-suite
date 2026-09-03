import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, Globe2, Loader2, RotateCcw } from "lucide-react";
import AuditLottie from "@/components/website-audit/AuditLottie";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { auditCopyFor } from "@/lib/website-audit/copy";
import type { AuditLanguage } from "@/lib/website-audit/types";

interface AuditAnalyzingProps {
  language: AuditLanguage;
  url: string;
  error?: string;
  onRetry: () => void;
  onSample: () => void;
}

export default function AuditAnalyzing({ language, url, error, onRetry, onSample }: AuditAnalyzingProps) {
  const copy = auditCopyFor(language);
  const [stage, setStage] = useState(0);
  const errorRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (!error) setStage(0);
  }, [error, url]);
  useEffect(() => {
    if (error) return;
    const timer = window.setInterval(() => setStage((current) => Math.min(copy.analyzing.stages.length - 1, current + 1)), 4200);
    return () => window.clearInterval(timer);
  }, [copy.analyzing.stages.length, error]);
  useEffect(() => {
    if (!error) return;
    const frame = window.requestAnimationFrame(() => errorRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [error]);
  let domain = url;
  try { domain = new URL(url).hostname; } catch { /* keep raw */ }

  if (error) {
    return (
      <div className="mx-auto flex min-h-[68vh] w-full max-w-3xl items-center px-4 py-12 sm:px-6">
        <section ref={errorRef} role="alert" tabIndex={-1} className="w-full rounded-2xl border border-black/10 bg-white p-6 text-center outline-none shadow-[0_15px_45px_rgba(35,31,32,.08)] sm:p-10">
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary"><AlertTriangle size={25} /></span>
          <h1 className="mt-5 text-2xl font-bold tracking-[-0.025em]">{copy.analyzing.failedHeading}</h1>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-muted-foreground">{copy.analyzing.failedBody}</p>
          <p className="mx-auto mt-3 max-w-xl rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">{error}</p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Button onClick={onRetry} className="gap-2"><RotateCcw size={15} /> {copy.analyzing.tryAgain}</Button>
            <Button variant="outline" onClick={onSample}>{copy.analyzing.sampleInstead}</Button>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-[72vh] w-full max-w-5xl items-center px-4 py-12 sm:px-6">
      <div className="grid w-full gap-10 lg:grid-cols-[.9fr_1.1fr] lg:items-center">
        <div className="mx-auto flex w-full max-w-[440px] items-center justify-center">
          <AuditLottie src="/audit-analysis.json" />
        </div>

        <section>
          <p className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.17em] text-primary">
            <Loader2 size={13} className="animate-spin" aria-hidden="true" /> {copy.analyzing.eyebrow}
          </p>
          <h1 className="mt-4 text-3xl font-bold leading-tight tracking-[-0.035em] sm:text-4xl">{copy.analyzing.heading}</h1>
          <p className="mt-4 max-w-xl text-sm leading-6 text-muted-foreground sm:text-base">{copy.analyzing.body}</p>
          <div className="mt-5 inline-flex max-w-full items-center gap-2 rounded-full border border-black/10 bg-white px-3 py-2 text-xs shadow-sm">
            <Globe2 size={13} className="shrink-0 text-primary" /> <span className="truncate font-semibold">{domain}</span>
          </div>

          <ol className="mt-8 space-y-3" aria-live="polite">
            {copy.analyzing.stages.map((label, index) => {
              const complete = index < stage;
              const active = index === stage;
              return (
                <li key={label} className={cn("flex items-center gap-3 text-sm transition-colors", index > stage ? "text-muted-foreground/55" : "text-foreground")}>
                  <span className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border",
                    complete ? "border-emerald-600 bg-emerald-600 text-white" : active ? "border-primary bg-primary/10 text-primary" : "border-black/10 bg-white",
                  )}>
                    {complete ? <Check size={13} strokeWidth={3} /> : active ? <Loader2 size={13} className="animate-spin" /> : <span className="h-1.5 w-1.5 rounded-full bg-black/15" />}
                  </span>
                  <span className={cn(active && "font-semibold")}>
                    {label}{active ? "…" : ""}
                  </span>
                </li>
              );
            })}
          </ol>

          <div className="mt-8 h-1.5 overflow-hidden rounded-full bg-black/10">
            <div className="animate-indeterminate h-full w-1/3 rounded-full bg-primary" />
          </div>
          <p className="mt-3 text-xs leading-5 text-muted-foreground">{copy.analyzing.patience}</p>
        </section>
      </div>
    </div>
  );
}
