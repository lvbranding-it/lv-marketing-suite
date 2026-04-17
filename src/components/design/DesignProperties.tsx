import { useState, useEffect, useRef } from "react";
import { Wand2, RefreshCw, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { extractCssVars } from "@/data/designTypes";
import { cn } from "@/lib/utils";

// Friendly labels for CSS variable names
const VAR_LABELS: Record<string, string> = {
  "--color-primary": "Primary",
  "--color-secondary": "Secondary",
  "--color-accent": "Accent",
  "--color-bg": "Background",
  "--color-text": "Text",
  "--color-text-muted": "Muted text",
};

function isColorVar(value: string): boolean {
  return /^#[0-9a-fA-F]{3,8}$/.test(value.trim()) ||
    /^rgb/.test(value.trim()) ||
    /^hsl/.test(value.trim());
}

function toHex(value: string): string {
  const v = value.trim();
  if (/^#[0-9a-fA-F]{6}$/.test(v)) return v;
  if (/^#[0-9a-fA-F]{3}$/.test(v)) {
    const [, r, g, b] = v.match(/^#([0-9a-fA-F])([0-9a-fA-F])([0-9a-fA-F])$/) ?? [];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return "#000000";
}

interface DesignPropertiesProps {
  html: string;
  onCssOverrideChange: (overrides: Record<string, string>) => void;
  onRefine: (prompt: string) => void;
  streaming: boolean;
}

export default function DesignProperties({ html, onCssOverrideChange, onRefine, streaming }: DesignPropertiesProps) {
  const [cssVars, setCssVars] = useState<Record<string, string>>({});
  const [overrides, setOverrides] = useState<Record<string, string>>({});
  const [refineText, setRefineText] = useState("");
  const [colorsOpen, setColorsOpen] = useState(true);
  const [refineOpen, setRefineOpen] = useState(true);
  const prevHtml = useRef("");

  // Re-extract CSS vars when a new design is generated (not on every cssOverride change)
  useEffect(() => {
    if (!html || html === prevHtml.current) return;
    prevHtml.current = html;
    const extracted = extractCssVars(html);
    setCssVars(extracted);
    setOverrides({});
    onCssOverrideChange({});
  }, [html, onCssOverrideChange]);

  const handleColorChange = (prop: string, hex: string) => {
    const next = { ...overrides, [prop]: hex };
    setOverrides(next);
    onCssOverrideChange(next);
  };

  const handleRefine = () => {
    if (!refineText.trim() || streaming) return;
    onRefine(refineText.trim());
    setRefineText("");
  };

  const colorVars = Object.entries(cssVars).filter(([, v]) => isColorVar(v));
  const hasColors = colorVars.length > 0;

  return (
    <ScrollArea className="h-full">
      <div className="p-4 space-y-4">
        {/* Live Color Editing */}
        {hasColors && (
          <Section
            title="Live Colors"
            badge={colorVars.length}
            open={colorsOpen}
            onToggle={() => setColorsOpen((v) => !v)}
          >
            <div className="space-y-3">
              {colorVars.map(([prop, value]) => {
                const currentHex = toHex(overrides[prop] ?? value);
                const label = VAR_LABELS[prop] ?? prop.replace(/^--color-/, "").replace(/-/g, " ");
                return (
                  <div key={prop} className="flex items-center gap-3">
                    <div className="relative group flex-shrink-0">
                      <input
                        type="color"
                        value={currentHex}
                        onChange={(e) => handleColorChange(prop, e.target.value)}
                        className="sr-only"
                        id={`color-${prop}`}
                      />
                      <label
                        htmlFor={`color-${prop}`}
                        className="w-8 h-8 rounded-md shadow-sm border border-border/50 flex cursor-pointer ring-2 ring-offset-1 ring-transparent hover:ring-primary/60 transition-all"
                        style={{ background: currentHex }}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium capitalize leading-none mb-0.5">{label}</p>
                      <p className="text-[10px] font-mono text-muted-foreground">{currentHex}</p>
                    </div>
                  </div>
                );
              })}
            </div>
            {Object.keys(overrides).length > 0 && (
              <button
                onClick={() => { setOverrides({}); onCssOverrideChange({}); }}
                className="mt-2 text-[10px] text-muted-foreground hover:text-destructive transition-colors"
              >
                Reset to original
              </button>
            )}
          </Section>
        )}

        {/* Refine prompt */}
        <Section
          title="Refine Design"
          open={refineOpen}
          onToggle={() => setRefineOpen((v) => !v)}
        >
          <div className="space-y-2">
            <Textarea
              value={refineText}
              onChange={(e) => setRefineText(e.target.value)}
              placeholder='e.g. "Make it darker", "Increase font size", "Add more whitespace"'
              rows={3}
              className="text-xs resize-none"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) handleRefine();
              }}
            />
            <Button
              size="sm"
              className="w-full h-8 text-xs"
              onClick={handleRefine}
              disabled={!refineText.trim() || streaming}
            >
              {streaming ? (
                <RefreshCw size={12} className="mr-1.5 animate-spin" />
              ) : (
                <Wand2 size={12} className="mr-1.5" />
              )}
              {streaming ? "Regenerating..." : "Apply refinement"}
            </Button>
          </div>
          <p className="text-[10px] text-muted-foreground mt-2">
            ⌘↵ to apply · Describe what to change
          </p>
        </Section>
      </div>
    </ScrollArea>
  );
}

function Section({
  title, badge, open, onToggle, children,
}: {
  title: string;
  badge?: number;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-xl border border-border overflow-hidden">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2.5 bg-muted/40 hover:bg-muted/70 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">{title}</span>
          {badge != null && (
            <span className="text-[10px] bg-primary/10 text-primary px-1.5 rounded-full">{badge}</span>
          )}
        </div>
        {open ? <ChevronUp size={13} className="text-muted-foreground" /> : <ChevronDown size={13} className="text-muted-foreground" />}
      </button>
      {open && <div className="p-3">{children}</div>}
    </div>
  );
}
