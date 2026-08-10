// ── Allocation donut ────────────────────────────────────────────────────────────
// Hand-rolled SVG: six ring segments over an HTML centre label. The palette was
// validated for adjacent-segment colour-vision separation (including the ring
// wrap pair) on both light and dark card surfaces; see config.ts CATEGORIES.
// Identity never relies on colour alone: the allocation controls double as a
// connected legend and a table alternative is rendered alongside the chart.

import { useEffect, useMemo, useState } from "react";
import { CATEGORIES, formatMoney } from "@/lib/campaign/config";
import type { CategoryKey, Shares } from "@/lib/campaign/types";

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const handler = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);
  return reduced;
}

function useDarkMode(): boolean {
  // The app toggles dark mode with a `dark` class on <html>.
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  useEffect(() => {
    const observer = new MutationObserver(() =>
      setDark(document.documentElement.classList.contains("dark")));
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);
  return dark;
}

interface AllocationDonutProps {
  shares:  Shares;
  amounts: Record<CategoryKey, number>;
  /** Display percentages (largest-remainder rounded so they total 100). */
  pcts:    Record<CategoryKey, number>;
  total:   number;
  /** Category highlighted from outside (e.g. a focused allocation control). */
  active:  CategoryKey | null;
  onActiveChange: (key: CategoryKey | null) => void;
}

export default function AllocationDonut({
  shares, amounts, pcts, total, active, onActiveChange,
}: AllocationDonutProps) {
  const reducedMotion = useReducedMotion();
  const dark = useDarkMode();

  // Geometry: pathLength=100 lets dasharray work directly in percent units.
  const R = 82;
  const STROKE = 34;
  const GAP = 1.2; // ≈2px surface gap between segments at this radius

  const segments = useMemo(() => {
    let cursor = 0;
    return CATEGORIES.map((cat) => {
      const pct = Math.max(0, shares[cat.key] * 100);
      const start = cursor;
      cursor += pct;
      return { cat, pct, start };
    });
  }, [shares]);

  const activeMeta = active ? CATEGORIES.find((c) => c.key === active) : null;
  const transition = reducedMotion
    ? undefined
    : "stroke-dasharray 0.45s ease, stroke-dashoffset 0.45s ease, opacity 0.2s ease";

  return (
    <div className="relative mx-auto w-full max-w-[320px]" role="group" aria-label="Allocation chart">
      <svg viewBox="0 0 220 220" className="h-auto w-full" aria-hidden="false">
        <title>Donut chart of the campaign allocation. The same numbers appear in the controls and table beside it.</title>
        {segments.map(({ cat, pct, start }) => {
          const visible = Math.max(0, pct - GAP);
          const isActive = active === cat.key;
          const dimmed = active !== null && !isActive;
          return (
            <circle
              key={cat.key}
              cx="110" cy="110" r={R}
              fill="none"
              stroke={dark ? cat.colorDark : cat.colorLight}
              strokeWidth={isActive ? STROKE + 6 : STROKE}
              pathLength={100}
              strokeDasharray={`${visible} ${100 - visible}`}
              strokeDashoffset={-(start + GAP / 2) + 25} /* +25 starts the ring at 12 o'clock */
              opacity={dimmed ? 0.35 : 1}
              style={{ transition, cursor: "pointer", outline: "none" }}
              tabIndex={0}
              role="button"
              aria-label={`${cat.label}: ${formatMoney(amounts[cat.key])}, ${pcts[cat.key]} percent`}
              aria-pressed={isActive}
              onMouseEnter={() => onActiveChange(cat.key)}
              onMouseLeave={() => onActiveChange(null)}
              onFocus={() => onActiveChange(cat.key)}
              onBlur={() => onActiveChange(null)}
              onClick={() => onActiveChange(isActive ? null : cat.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onActiveChange(isActive ? null : cat.key);
                }
              }}
            />
          );
        })}
      </svg>

      {/* Centre label: swaps between the total and the active segment. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-10 text-center" aria-live="polite">
        {activeMeta ? (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {activeMeta.label}
            </p>
            <p className="mt-1 text-xl font-bold tabular-nums sm:text-2xl">
              {formatMoney(amounts[activeMeta.key])}
            </p>
            <p className="mt-0.5 text-sm font-medium text-muted-foreground tabular-nums">
              {pcts[activeMeta.key]}%
            </p>
          </>
        ) : (
          <>
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              Total investment
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums sm:text-3xl">{formatMoney(total)}</p>
          </>
        )}
      </div>
    </div>
  );
}
