const RELOAD_KEY = "lv:chunk-recovery";

/** Refresh stale deployment chunks at most once per entry bundle in this tab. */
export function registerChunkRecovery(buildUrl: string) {
  let reloading = false;

  window.addEventListener("vite:preloadError", (event) => {
    if (reloading) {
      event.preventDefault();
      return;
    }
    if (!window.navigator.onLine) return;

    try {
      // Keep the marker across reloads so a broken deployment cannot loop.
      if (window.sessionStorage.getItem(RELOAD_KEY) === buildUrl) return;
      window.sessionStorage.setItem(RELOAD_KEY, buildUrl);
    } catch {
      // Without persistent storage we cannot safely guard against reload loops.
      return;
    }

    reloading = true;
    event.preventDefault();
    window.location.reload();
  });
}
