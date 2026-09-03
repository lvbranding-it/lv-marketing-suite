import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export interface PaletteColorView {
  originalHex: string;
  replacementHex: string;
  count: number;
  fillCount: number;
  strokeCount: number;
}

interface DetectedColorListProps {
  colors: PaletteColorView[];
  onChange: (originalHex: string, replacementHex: string) => void;
  onReset: (originalHex: string) => void;
}

const HEX_PATTERN = /^#[0-9A-F]{6}$/;

function ColorEditor({
  color,
  index,
  onChange,
  onReset,
}: {
  color: PaletteColorView;
  index: number;
  onChange: DetectedColorListProps["onChange"];
  onReset: DetectedColorListProps["onReset"];
}) {
  const [draft, setDraft] = useState(color.replacementHex);
  const changed = color.originalHex !== color.replacementHex;

  useEffect(() => setDraft(color.replacementHex), [color.replacementHex]);

  const commit = (candidate: string) => {
    const value = candidate.startsWith("#") ? candidate.toUpperCase() : `#${candidate.toUpperCase()}`;
    if (!HEX_PATTERN.test(value)) return false;
    setDraft(value);
    onChange(color.originalHex, value);
    return true;
  };

  const usage = color.fillCount > 0 && color.strokeCount > 0
    ? "Fill + stroke"
    : color.fillCount > 0
      ? "Fill"
      : "Stroke";

  return (
    <article
      className={cn(
        "rounded-xl border bg-[#191818] p-3.5 transition-colors",
        changed ? "border-[#CB2039]/45" : "border-white/10 hover:border-white/15",
      )}
    >
      <div className="flex items-start gap-3">
        <div
          className="relative mt-0.5 h-11 w-11 shrink-0 overflow-hidden rounded-lg border border-white/20 shadow-sm"
          style={{ backgroundColor: color.replacementHex }}
        >
          <input
            type="color"
            value={color.replacementHex}
            onChange={(event) => commit(event.target.value)}
            className="absolute -inset-2 h-16 w-16 cursor-pointer opacity-0"
            aria-label={`Choose replacement for ${color.originalHex}`}
          />
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold text-white">Color {String(index + 1).padStart(2, "0")}</p>
                {changed && <span className="h-1.5 w-1.5 rounded-full bg-[#CB2039]" aria-label="Changed" />}
              </div>
              <p className="mt-0.5 font-mono text-[11px] uppercase tracking-wide text-white/40">
                Original {color.originalHex}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={() => onReset(color.originalHex)}
              disabled={!changed}
              className="-mr-2 -mt-2 h-8 w-8 text-white/45 hover:bg-white/10 hover:text-white"
              aria-label={`Reset ${color.originalHex}`}
              title="Reset this color"
            >
              <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" />
            </Button>
          </div>

          <div className="mt-3 flex items-center gap-2">
            <span className="text-xs text-white/45" aria-hidden="true">#</span>
            <Input
              value={draft.replace(/^#/, "")}
              onChange={(event) => {
                const value = event.target.value.replace(/[^0-9a-f]/gi, "").slice(0, 6).toUpperCase();
                setDraft(`#${value}`);
                if (value.length === 6) commit(value);
              }}
              onBlur={() => {
                if (!commit(draft)) setDraft(color.replacementHex);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  commit(draft);
                  event.currentTarget.blur();
                }
              }}
              maxLength={6}
              spellCheck={false}
              aria-label={`Replacement HEX for ${color.originalHex}`}
              className="h-8 border-white/10 bg-black/20 px-2 font-mono text-xs uppercase text-white focus-visible:ring-[#CB2039]"
            />
          </div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between border-t border-white/5 pt-2.5 text-[11px] text-white/45">
        <span>{color.count} occurrence{color.count === 1 ? "" : "s"}</span>
        <span className="rounded-full bg-white/[0.06] px-2 py-1 text-white/55">{usage}</span>
      </div>
    </article>
  );
}

export default function DetectedColorList({ colors, onChange, onReset }: DetectedColorListProps) {
  return (
    <div className="space-y-2.5">
      {colors.map((color, index) => (
        <ColorEditor
          key={color.originalHex}
          color={color}
          index={index}
          onChange={onChange}
          onReset={onReset}
        />
      ))}
    </div>
  );
}
