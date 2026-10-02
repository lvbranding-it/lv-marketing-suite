import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { storePhotoCopies } from "@/hooks/usePhotoSessions";
import { runLimited } from "@/lib/photo-sessions/uploads";
import type { SessionPhoto } from "@/integrations/supabase/types";

export interface CopyBackfill {
  total: number;
  done: number;
  failed: number;
  running: boolean;
}

/**
 * Makes the thumbnail and preview copies of photos uploaded before photos got
 * them, while someone on the team has the session open.
 *
 * Until a photo has its copies, galleries show its full-size original. Each
 * original is downloaded once, resized in this browser and the copies stored
 * beside it; nothing asks Supabase to resize, which it bills. Leaving the page
 * stops the work; the next visit carries on with what is left. A photo that
 * cannot be read (an old HEIC upload, say) keeps its original.
 */
export function usePhotoCopyBackfill(sessionId: string | undefined, photos: SessionPhoto[] | undefined): CopyBackfill {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<CopyBackfill>({ total: 0, done: 0, failed: 0, running: false });
  const missing = (photos ?? []).filter((photo) => !photo.thumb_path || !photo.preview_path);
  // Keyed on which photos need copies, so other changes to the list (a status,
  // a comment) do not start the work again.
  const missingKey = missing.map((photo) => photo.id).join(",");

  useEffect(() => {
    if (!sessionId || !missing.length) return;
    let stopped = false;
    setProgress({ total: missing.length, done: 0, failed: 0, running: true });

    runLimited(missing, 2, async (photo) => {
      if (stopped) return;
      try {
        const { data: original, error } = await supabase.storage.from("session-photos").download(photo.storage_path);
        if (error || !original) throw error ?? new Error("Missing original");
        const copies = await storePhotoCopies(original, photo.storage_path, true);
        if (!copies.thumb_path || !copies.preview_path) throw new Error("A copy could not be stored");
        const { error: updateError } = await supabase.from("session_photos").update(copies).eq("id", photo.id);
        if (updateError) throw updateError;
        if (!stopped) setProgress((current) => ({ ...current, done: current.done + 1 }));
      } catch {
        if (!stopped) setProgress((current) => ({ ...current, failed: current.failed + 1 }));
      }
    }).then(() => {
      if (stopped) return;
      setProgress((current) => ({ ...current, running: false }));
      queryClient.invalidateQueries({ queryKey: ["session-photos", sessionId] });
    });

    return () => {
      stopped = true;
    };
    // `missing` is read through missingKey, which names the same photos.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, missingKey, queryClient]);

  return progress;
}
