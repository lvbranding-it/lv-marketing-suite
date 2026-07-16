import { X, Plus, ChevronLeft, ChevronRight } from "lucide-react";
import { PROJECT_TYPES } from "@/components/ccs/ccsMeta";

// Ordered multi-select for a phased service bundle. Selection order = phase order,
// adjustable with the reorder arrows.
export default function ServicePicker({
  value, onChange, options = PROJECT_TYPES,
}: {
  value: string[];
  onChange: (next: string[]) => void;
  options?: string[];
}) {
  const add = (s: string) => onChange([...value, s]);
  const remove = (s: string) => onChange(value.filter((v) => v !== s));
  const move = (from: number, to: number) => {
    if (to < 0 || to >= value.length) return;
    const next = [...value];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  };
  const available = options.filter((o) => !value.includes(o));

  return (
    <div className="space-y-2">
      {value.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {value.map((s, i) => (
            <span key={s} className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-xs font-medium text-primary">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[10px] text-primary-foreground">{i + 1}</span>
              <button type="button" onClick={() => move(i, i - 1)} disabled={i === 0} aria-label="Move earlier"
                className="text-primary/50 transition-colors hover:text-primary disabled:opacity-25"><ChevronLeft size={12} /></button>
              {s}
              <button type="button" onClick={() => move(i, i + 1)} disabled={i === value.length - 1} aria-label="Move later"
                className="text-primary/50 transition-colors hover:text-primary disabled:opacity-25"><ChevronRight size={12} /></button>
              <button type="button" onClick={() => remove(s)} aria-label="Remove" className="ml-0.5 text-primary/60 hover:text-primary"><X size={12} /></button>
            </span>
          ))}
        </div>
      )}
      {available.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {available.map((o) => (
            <button key={o} type="button" onClick={() => add(o)}
              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground">
              <Plus size={11} /> {o}
            </button>
          ))}
        </div>
      )}
      {value.length > 1 && <p className="text-[11px] text-muted-foreground">Use the arrows to reorder — the sequence reflects the project phases.</p>}
    </div>
  );
}
