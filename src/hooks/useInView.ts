import { useEffect, useRef, useState } from "react";

/**
 * Whether an element has come near the screen. Once true it stays true, so
 * whatever it started (a request, an image load) is not cancelled and redone
 * as the element scrolls in and out.
 *
 * `rootMargin` starts the work a little before the element is visible, so it
 * is usually ready by the time it scrolls into view.
 */
export function useInView<T extends Element>(rootMargin = "400px") {
  const ref = useRef<T | null>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element || inView) return;
    if (typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [inView, rootMargin]);

  return [ref, inView] as const;
}
