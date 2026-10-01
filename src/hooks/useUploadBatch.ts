import { useCallback, useEffect, useRef, useState } from "react";
import { runLimited, uploadErrorMessage } from "@/lib/photo-sessions/uploads";

export type BatchState = "queued" | "uploading" | "done" | "failed";

export interface BatchEntry {
  key: string;
  file: File;
  /** The photo's place in the shoot, fixed when the batch starts. */
  order: number;
  state: BatchState;
  error?: string;
}

export interface SkippedFile {
  name: string;
  reason: string;
}

/**
 * Runs a batch of uploads a few at a time and keeps account of every file.
 *
 * Nothing disappears on its own: skipped and failed files stay listed, with
 * their reasons, until the person dismisses them, and failed ones can be tried
 * again without picking the files a second time.
 */
export function useUploadBatch({
  concurrency,
  upload,
  onProgress,
  refreshEvery = 10,
}: {
  concurrency: number;
  upload: (entry: BatchEntry) => Promise<unknown>;
  /** Called every `refreshEvery` finished uploads and at the end, so results show while the rest upload. */
  onProgress?: () => void;
  refreshEvery?: number;
}) {
  const [entries, setEntries] = useState<BatchEntry[]>([]);
  const [skipped, setSkipped] = useState<SkippedFile[]>([]);
  const [running, setRunning] = useState(false);

  // The latest callbacks, so a batch that outlives a re-render uses current values.
  const uploadRef = useRef(upload);
  const progressRef = useRef(onProgress);
  uploadRef.current = upload;
  progressRef.current = onProgress;

  const mark = useCallback((key: string, state: BatchState, error?: string) => {
    setEntries((current) => current.map((entry) => (entry.key === key ? { ...entry, state, error } : entry)));
  }, []);

  const run = useCallback(async (batch: BatchEntry[]) => {
    if (!batch.length) return;
    setRunning(true);
    let sinceRefresh = 0;
    await runLimited(batch, concurrency, async (entry) => {
      mark(entry.key, "uploading");
      try {
        await uploadRef.current(entry);
        mark(entry.key, "done");
        if (++sinceRefresh >= refreshEvery) {
          sinceRefresh = 0;
          progressRef.current?.();
        }
      } catch (error) {
        mark(entry.key, "failed", uploadErrorMessage(error));
        throw error;
      }
    });
    progressRef.current?.();
    setRunning(false);
  }, [concurrency, mark, refreshEvery]);

  const start = useCallback((accepted: Array<{ file: File; order: number }>, skippedFiles: SkippedFile[]) => {
    const batch = accepted.map(({ file, order }, index) => ({
      key: `${Date.now()}-${index}-${file.name}`,
      file,
      order,
      state: "queued" as const,
    }));
    setEntries(batch);
    setSkipped(skippedFiles);
    void run(batch);
  }, [run]);

  const retryFailed = useCallback(() => {
    const failed = entries.filter((entry) => entry.state === "failed").map((entry) => ({ ...entry, state: "queued" as const, error: undefined }));
    setEntries((current) => current.map((entry) => (entry.state === "failed" ? { ...entry, state: "queued", error: undefined } : entry)));
    void run(failed);
  }, [entries, run]);

  const dismiss = useCallback(() => {
    setEntries([]);
    setSkipped([]);
  }, []);

  // Closing the tab mid-batch loses the rest of it, so the browser asks first.
  useEffect(() => {
    if (!running) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [running]);

  const count = (state: BatchState) => entries.filter((entry) => entry.state === state).length;
  return {
    entries,
    skipped,
    running,
    total: entries.length,
    done: count("done"),
    failed: entries.filter((entry) => entry.state === "failed"),
    start,
    retryFailed,
    dismiss,
  };
}
