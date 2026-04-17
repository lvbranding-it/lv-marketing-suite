import { useRef } from "react";
import { Plus, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface DesignColorPickerProps {
  value: string; // comma-separated hex colors e.g. "#1a1a2e,#e94560"
  onChange: (value: string) => void;
  max?: number;
}

function parseColors(value: string): string[] {
  return value
    .split(",")
    .map((c) => c.trim())
    .filter((c) => /^#[0-9a-fA-F]{3,8}$/.test(c) || c === "");
}

function isValidHex(value: string): boolean {
  return /^#[0-9a-fA-F]{6}$/.test(value);
}

function toSafeHex(value: string): string {
  if (isValidHex(value)) return value;
  return "#000000";
}

export default function DesignColorPicker({ value, onChange, max = 4 }: DesignColorPickerProps) {
  const colors = parseColors(value).filter(Boolean);

  const updateColor = (index: number, hex: string) => {
    const next = [...colors];
    next[index] = hex;
    onChange(next.join(", "));
  };

  const addColor = () => {
    if (colors.length >= max) return;
    onChange([...colors, "#6c63ff"].join(", "));
  };

  const removeColor = (index: number) => {
    const next = colors.filter((_, i) => i !== index);
    onChange(next.join(", "));
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2 items-center">
        {colors.map((color, i) => (
          <ColorSwatch
            key={i}
            color={color}
            onChange={(hex) => updateColor(i, hex)}
            onRemove={colors.length > 1 ? () => removeColor(i) : undefined}
          />
        ))}
        {colors.length === 0 && (
          <button
            type="button"
            onClick={addColor}
            className="w-9 h-9 rounded-lg border-2 border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          >
            <Plus size={14} />
          </button>
        )}
        {colors.length > 0 && colors.length < max && (
          <button
            type="button"
            onClick={addColor}
            className="w-8 h-8 rounded-lg border border-dashed border-border flex items-center justify-center text-muted-foreground hover:border-primary hover:text-primary transition-colors"
          >
            <Plus size={12} />
          </button>
        )}
      </div>
      {colors.length > 0 && (
        <p className="text-[10px] text-muted-foreground">
          {colors.join(", ")}
        </p>
      )}
    </div>
  );
}

interface ColorSwatchProps {
  color: string;
  onChange: (hex: string) => void;
  onRemove?: () => void;
}

function ColorSwatch({ color, onChange, onRemove }: ColorSwatchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const safeColor = toSafeHex(color);

  return (
    <div className="relative group">
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="w-9 h-9 rounded-lg shadow-sm border border-border/50 flex-shrink-0 ring-2 ring-offset-1 ring-transparent hover:ring-primary/50 transition-all"
        style={{ background: safeColor }}
        title={safeColor}
      />
      {/* Hidden native color input */}
      <input
        ref={inputRef}
        type="color"
        value={safeColor}
        onChange={(e) => onChange(e.target.value)}
        className="sr-only"
      />
      {/* Remove button */}
      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full bg-destructive text-white items-center justify-center hidden group-hover:flex shadow-sm"
        >
          <X size={9} />
        </button>
      )}
    </div>
  );
}
