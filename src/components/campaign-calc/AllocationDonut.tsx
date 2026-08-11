// ── Allocation donut ────────────────────────────────────────────────────────────
// Hand-rolled SVG: six ring segments over an HTML centre label. The palette was
// validated for adjacent-segment colour-vision separation (including the ring
// wrap pair) on both light and dark card surfaces; see config.ts CATEGORIES.
// Identity never relies on colour alone: segments carry outer labels on larger
// screens, the allocation controls double as a connected legend, and a table
// alternative is rendered alongside the chart.

import { useEffect, useMemo, useState } from "react";
import { formatMoney } from "@/lib/campaign/config";
import { categories as localCategories } from "@/lib/campaign/localized";
import { useCalcLang } from "./lang";
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
  /** Idle centre label; becomes "Campaign allocation" when a reserve is held out. */
  totalLabel?: string;
  /** Category currently highlighted (hover, focus, or pinned selection). */
  active:  CategoryKey | null;
  /** Category pinned by click/tap; stays highlighted until toggled off. */
  pinned:  CategoryKey | null;
  onHover:     (key: CategoryKey | null) => void;
  onTogglePin: (key: CategoryKey) => void;
}

// Geometry. The viewBox leaves a margin around the ring for the outer labels.
const SIZE = 280;
const C = SIZE / 2;           // centre
const R = 82;                 // ring radius
const STROKE = 34;
const GAP = 1.2;              // ≈2px surface gap between segments at this radius
const LABEL_R = R + STROKE / 2 + 8;   // leader line end
const LABEL_TEXT_R = LABEL_R + 12;    // label anchor

export default function AllocationDonut({
  shares, amounts, pcts, total, totalLabel = "Total investment", active, pinned, onHover, onTogglePin,
}: AllocationDonutProps) {
  const reducedMotion = useReducedMotion();
  const dark = useDarkMode();
  const lang = useCalcLang();
  const CATEGORIES = localCategories(lang);

  const segments = useMemo(() => {
    let cursor = 0;
    return CATEGORIES.map((cat) => {
      const pct = Math.max(0, shares[cat.key] * 100);
      const start = cursor;
      cursor += pct;
      // Mid-angle of the segment, with the ring starting at 12 o'clock.
      const midDeg = ((start + pct / 2) / 100) * 360 - 90;
      const rad = (midDeg * Math.PI) / 180;
      return { cat, pct, start, cos: Math.cos(rad), sin: Math.sin(rad) };
    });
  }, [shares]);

  const activeMeta = active ? CATEGORIES.find((c) => c.key === active) : null;
  const transition = reducedMotion
    ? undefined
    : "stroke-dasharray 0.45s ease, stroke-dashoffset 0.45s ease, opacity 0.2s ease";

  return (
    <div className="relative mx-auto w-full max-w-[340px]" role="group" aria-label="Allocation chart">
      {/* overflow visible lets edge labels render into the card padding instead of clipping */}
      <svg viewBox={`0 0 ${SIZE} ${SIZE}`} className="h-auto w-full" style={{ overflow: "visible" }} aria-hidden="false">
        <title>Donut chart of the campaign allocation. The same numbers appear in the controls and table beside it.</title>
        {segments.map(({ cat, pct, start }) => {
          const visible = Math.max(0, pct - GAP);
          const isActive = active === cat.key;
          const dimmed = active !== null && !isActive;
          return (
            <circle
              key={cat.key}
              cx={C} cy={C} r={R}
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
              aria-pressed={pinned === cat.key}
              onMouseEnter={() => onHover(cat.key)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(cat.key)}
              onBlur={() => onHover(null)}
              onClick={() => onTogglePin(cat.key)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onTogglePin(cat.key);
                }
              }}
            />
          );
        })}

        {/* Outer labels with short leader lines. Hidden on small screens where
            they would collide; there the controls and table carry identity. */}
        <g className="hidden sm:block" aria-hidden="true">
          {segments.filter((s) => s.pct >= 5).map(({ cat, cos, sin }) => {
            const x1 = C + (R + STROKE / 2) * cos;
            const y1 = C + (R + STROKE / 2) * sin;
            const x2 = C + LABEL_R * cos;
            const y2 = C + LABEL_R * sin;
            const tx = C + LABEL_TEXT_R * cos;
            const ty = C + LABEL_TEXT_R * sin;
            const anchor = cos > 0.25 ? "start" : cos < -0.25 ? "end" : "middle";
            return (
              <g
                key={cat.key}
                opacity={active !== null && active !== cat.key ? 0.35 : 1}
                style={{ transition: reducedMotion ? undefined : "opacity 0.2s ease" }}
              >
                <line x1={x1} y1={y1} x2={x2} y2={y2} stroke="currentColor" strokeWidth="1" className="text-border" />
                <text
                  x={tx} y={ty + 3}
                  textAnchor={anchor}
                  className="fill-current text-muted-foreground"
                  style={{ fontSize: 9.5, fontWeight: 600 }}
                >
                  {cat.short} {pcts[cat.key]}%
                </text>
              </g>
            );
          })}
        </g>
      </svg>

      {/* Centre label: swaps between the total and the active segment. */}
      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center px-14 text-center" aria-live="polite">
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
              {totalLabel}
            </p>
            <p className="mt-1 text-2xl font-bold tabular-nums sm:text-3xl">{formatMoney(total)}</p>
          </>
        )}
      </div>
    </div>
  );
}
