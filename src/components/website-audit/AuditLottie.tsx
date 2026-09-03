import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";

interface AuditLottieProps {
  /** Path to a Lottie JSON served as a static asset, e.g. `/audit-analysis.json`. */
  src: string;
  /** Wrapper classes, typically a max width. */
  className?: string;
}

/**
 * Plays a Lottie animation from a static asset.
 *
 * The JSON is fetched rather than imported so a few hundred kilobytes of vector
 * data stay out of the JavaScript bundle and are cached by the browser as an
 * ordinary asset. The player is imported dynamically for the same reason.
 *
 * Every animation on this funnel is decorative, so failure is silent by design:
 * if the fetch or the player fails the component renders nothing and the layout
 * closes up. An illustration must never be able to break a lead-capture page or
 * an in-progress audit.
 */
export default function AuditLottie({ src, className }: AuditLottieProps) {
  const container = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    // A visitor who has asked the system for less motion gets the first frame as
    // a still image rather than a loop.
    const prefersReducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    let animation: { destroy: () => void } | null = null;
    let cancelled = false;

    (async () => {
      try {
        const [{ default: lottie }, response] = await Promise.all([
          import("lottie-web/build/player/lottie_light"),
          fetch(src),
        ]);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const animationData = await response.json();
        if (cancelled || !container.current) return;

        animation = lottie.loadAnimation({
          container: container.current,
          renderer: "svg",
          loop: !prefersReducedMotion,
          autoplay: !prefersReducedMotion,
          animationData,
          rendererSettings: { progressiveLoad: true },
        });

        if (prefersReducedMotion) {
          (animation as unknown as { goToAndStop: (value: number, isFrame: boolean) => void })
            .goToAndStop(0, true);
        }
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();

    return () => {
      cancelled = true;
      animation?.destroy();
    };
  }, [src]);

  if (failed) return null;

  return <div aria-hidden="true" className={cn("w-full", className)} ref={container} />;
}
