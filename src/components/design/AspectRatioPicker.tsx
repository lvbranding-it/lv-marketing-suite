import { cn } from "@/lib/utils";

export interface AspectRatioOption {
  label: string;
  value: string;
  width: number;
  height: number;
  description: string;
}

interface AspectRatioPickerProps {
  options: AspectRatioOption[];
  value: string;
  onChange: (value: string, option: AspectRatioOption) => void;
}

export default function AspectRatioPicker({ options, value, onChange }: AspectRatioPickerProps) {
  return (
    <div className="grid grid-cols-3 gap-1.5">
      {options.map((opt) => {
        const selected = value === opt.value;
        // Normalize preview rect: longest side = 32px
        const maxPx = 32;
        const scale = maxPx / Math.max(opt.width, opt.height);
        const pw = Math.round(opt.width * scale);
        const ph = Math.round(opt.height * scale);

        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => onChange(opt.value, opt)}
            className={cn(
              "flex flex-col items-center gap-1.5 px-2 py-2.5 rounded-xl border transition-all",
              selected
                ? "border-primary bg-primary/5 text-primary"
                : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
            )}
          >
            {/* Ratio preview rect */}
            <div
              className={cn(
                "rounded-sm border-2",
                selected ? "border-primary" : "border-current"
              )}
              style={{ width: pw, height: ph }}
            />
            <div className="text-center leading-tight">
              <p className="text-[11px] font-semibold">{opt.label}</p>
              <p className="text-[9px] opacity-60">{opt.description}</p>
            </div>
          </button>
        );
      })}
    </div>
  );
}
