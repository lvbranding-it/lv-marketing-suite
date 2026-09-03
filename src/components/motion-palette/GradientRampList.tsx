import { useId } from "react";

export interface GradientRampStopView {
  stopIndex: number;
  offset: number;
  /** The colour as it exists in the uploaded file. */
  originalHex: string;
  /** The colour currently being applied, which may equal the original. */
  currentHex: string;
}

export interface GradientRampView {
  id: string;
  stops: GradientRampStopView[];
  useCount: number;
  usage: "fill" | "stroke" | "both";
  animated: boolean;
  /**
   * Stops whose colour also appears outside this ramp. Editing one of these
   * changes the other places too, because the palette is keyed by colour.
   */
  sharedStopIndexes: number[];
}

interface GradientRampListProps {
  ramps: GradientRampView[];
  onChange: (originalHex: string, nextHex: string) => void;
}

const normalizeHexInput = (value: string): string | null => {
  const trimmed = value.trim().replace(/^#/, "").toUpperCase();
  if (/^[0-9A-F]{6}$/.test(trimmed)) return `#${trimmed}`;
  if (/^[0-9A-F]{3}$/.test(trimmed)) {
    return `#${trimmed.split("").map((c) => c + c).join("")}`;
  }
  return null;
};

/**
 * Renders each gradient as a single card: the ramp drawn as it will appear,
 * with its stops laid out left to right in ramp order beneath it.
 *
 * The palette list groups by colour, which scatters a ramp's stops across the
 * page and makes a gradient impossible to reason about as a whole. This view
 * exists to put the stops back in the order the gradient actually uses them.
 */
export default function GradientRampList({ ramps, onChange }: GradientRampListProps) {
  if (ramps.length === 0) return null;

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-bold text-white">Gradients</h3>
        <span className="text-[11px] text-white/45">
          {ramps.length} ramp{ramps.length === 1 ? "" : "s"}
        </span>
      </div>

      {ramps.map((ramp) => (
        <GradientRampCard key={ramp.id} ramp={ramp} onChange={onChange} />
      ))}
    </section>
  );
}

function GradientRampCard({
  ramp,
  onChange,
}: {
  ramp: GradientRampView;
  onChange: (originalHex: string, nextHex: string) => void;
}) {
  const gradientId = useId();

  // Drawn from the current colours and real offsets, so the preview is the ramp
  // as it will render rather than an even spread of swatches.
  const preview = `linear-gradient(90deg, ${ramp.stops
    .map((stop) => `${stop.currentHex} ${(stop.offset * 100).toFixed(2)}%`)
    .join(", ")})`;

  const usageLabel = ramp.usage === "both" ? "Fill + stroke" : ramp.usage === "fill" ? "Fill" : "Stroke";

  return (
    <article className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <div
        aria-label="Gradient preview"
        className="h-9 w-full rounded-lg border border-white/10"
        style={{ backgroundImage: preview }}
      />

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
        {ramp.stops.map((stop) => {
          const shared = ramp.sharedStopIndexes.includes(stop.stopIndex);
          const inputId = `${gradientId}-${stop.stopIndex}`;

          return (
            <div key={stop.stopIndex} className="min-w-[104px] flex-1">
              <label
                className="mb-1 flex items-center gap-1 text-[10px] uppercase tracking-wide text-white/40"
                htmlFor={inputId}
              >
                {(stop.offset * 100).toFixed(0)}%
                {shared && (
                  // Most gradient colours are reused across ramps, so spelling
                  // this out on every stop would be noise. A dot keeps the
                  // warning available without drowning the offsets.
                  <span
                    className="cursor-help text-[#F2879A]"
                    title="Shared: this colour is also used outside this gradient, so changing it here changes it there too."
                  >
                    •<span className="sr-only"> shared with other shapes</span>
                  </span>
                )}
              </label>
              <div className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-black/20 p-1.5">
                <span
                  aria-hidden
                  className="h-6 w-6 shrink-0 rounded border border-white/15"
                  style={{ backgroundColor: stop.currentHex }}
                />
                <input
                  className="w-full min-w-0 bg-transparent font-mono text-[11px] uppercase text-white outline-none"
                  defaultValue={stop.currentHex.replace("#", "")}
                  id={inputId}
                  onBlur={(event) => {
                    const next = normalizeHexInput(event.target.value);
                    if (!next) {
                      event.target.value = stop.currentHex.replace("#", "");
                      return;
                    }
                    onChange(stop.originalHex, next);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.currentTarget.blur();
                  }}
                  spellCheck={false}
                />
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-2 text-[11px] text-white/40">
        Used {ramp.useCount} time{ramp.useCount === 1 ? "" : "s"} · {usageLabel}
        {ramp.animated ? " · animated" : ""}
      </p>
    </article>
  );
}
