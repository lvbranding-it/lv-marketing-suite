import { ArrowRight, ListOrdered } from "lucide-react";
import { cn } from "@/lib/utils";
import type { CreativeEdgeKind } from "@/lib/creative-canvas/graph";

/**
 * What a selected arrow claims.
 *
 * Two meanings, stated in full rather than as jargon, because the difference
 * decides what reaches the AI: an informing arrow travels upstream as direction,
 * a running order never does. Anyone drawing arrows needs to know which one they
 * just drew.
 */
const KINDS: Array<{ value: CreativeEdgeKind; label: string; caption: string; icon: typeof ArrowRight }> = [
  {
    value: "association",
    label: "Informs",
    caption: "Governs how the other card is made. Travels with it to the AI as direction.",
    icon: ArrowRight,
  },
  {
    value: "sequence",
    label: "Then",
    caption: "Comes before the other card. Sets running order and export order — never direction.",
    icon: ListOrdered,
  },
];

export default function ConnectionInspector({
  kind, sourceTitle, targetTitle, onChange,
}: {
  kind: CreativeEdgeKind;
  sourceTitle: string;
  targetTitle: string;
  onChange: (kind: CreativeEdgeKind) => void;
}) {
  return (
    <div className="space-y-4">
      <div>
        <p className="creative-inspector-label">Selected connection</p>
        <p className="mt-1 flex items-center gap-1.5 text-sm font-medium text-white">
          <span className="min-w-0 truncate">{sourceTitle || "Untitled"}</span>
          <ArrowRight size={13} className="shrink-0 text-white/40" />
          <span className="min-w-0 truncate">{targetTitle || "Untitled"}</span>
        </p>
      </div>

      <div className="space-y-2">
        <p className="creative-inspector-label">This arrow means</p>
        {KINDS.map((option) => {
          const active = option.value === kind;
          const Icon = option.icon;
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => onChange(option.value)}
              aria-pressed={active}
              className={cn(
                "flex w-full gap-2.5 rounded-lg border p-3 text-left transition",
                active ? "border-[#CB2039] bg-[#CB2039]/10" : "border-white/10 hover:border-white/25 hover:bg-white/5",
              )}
            >
              <Icon size={15} className={cn("mt-0.5 shrink-0", active ? "text-[#CB2039]" : "text-white/50")} />
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-white">{option.label}</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-white/55">{option.caption}</span>
              </span>
            </button>
          );
        })}
      </div>

      {kind === "sequence" && (
        <p className="rounded-md bg-white/5 p-3 text-[11px] leading-4 text-white/55">
          Chain every piece of a carousel this way and exporting them together numbers the files in that order,
          whatever the layout on the canvas looks like.
        </p>
      )}
    </div>
  );
}
