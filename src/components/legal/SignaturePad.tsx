import { useCallback, useEffect, useRef, useState } from "react";
import { Eraser, PenLine, Type } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import {
  MAX_DRAWN_SIGNATURE_LENGTH, strokeBounds, tooSmall, type LegalSignature, type Stroke,
} from "@/lib/legal/signature";

const INK = "#1c1a1b";
const LINE_WIDTH = 2.4;

const WORDS = {
  en: {
    draw: "Draw", type: "Type", clear: "Clear", drawHere: "Sign here with your finger or mouse",
    drawLabel: "Signature drawing area", typeLabel: "Type your full name", tooSmall: "Draw your full signature.",
    tooLarge: "That signature is too detailed to save. Clear it and sign again.",
  },
  es: {
    draw: "Dibujar", type: "Escribir", clear: "Borrar", drawHere: "Firme aquí con el dedo o el ratón",
    drawLabel: "Área para dibujar la firma", typeLabel: "Escriba su nombre completo", tooSmall: "Dibuje su firma completa.",
    tooLarge: "La firma tiene demasiado detalle para guardarla. Bórrela y firme de nuevo.",
  },
};

function drawStrokes(context: CanvasRenderingContext2D, strokes: Stroke[], offset = { x: 0, y: 0 }) {
  context.strokeStyle = INK;
  context.fillStyle = INK;
  context.lineWidth = LINE_WIDTH;
  context.lineCap = "round";
  context.lineJoin = "round";
  for (const stroke of strokes) {
    const points = stroke.map((point) => ({ x: point.x - offset.x, y: point.y - offset.y }));
    if (points.length === 1) {
      context.beginPath();
      context.arc(points[0].x, points[0].y, LINE_WIDTH / 2, 0, Math.PI * 2);
      context.fill();
      continue;
    }
    context.beginPath();
    context.moveTo(points[0].x, points[0].y);
    // Through the midpoints, so the line is smooth rather than a polygon.
    for (let i = 1; i < points.length - 1; i++) {
      const mid = { x: (points[i].x + points[i + 1].x) / 2, y: (points[i].y + points[i + 1].y) / 2 };
      context.quadraticCurveTo(points[i].x, points[i].y, mid.x, mid.y);
    }
    const last = points[points.length - 1];
    context.lineTo(last.x, last.y);
    context.stroke();
  }
}

/** The strokes cropped to what was drawn, as a transparent PNG at twice the size. */
function exportStrokes(strokes: Stroke[]) {
  const box = strokeBounds(strokes, LINE_WIDTH * 2);
  if (!box) return "";
  const scale = Math.min(2, 900 / box.width);
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(box.width * scale);
  canvas.height = Math.ceil(box.height * scale);
  const context = canvas.getContext("2d")!;
  context.scale(scale, scale);
  drawStrokes(context, strokes, { x: box.left, y: box.top });
  return canvas.toDataURL("image/png");
}

interface SignaturePadProps {
  value: LegalSignature | null;
  onChange: (signature: LegalSignature | null) => void;
  /** Filled in when switching to Type. */
  defaultName?: string;
  language?: "en" | "es";
  className?: string;
}

/**
 * Draw or type a signature. The drawing is kept as strokes and repainted when
 * the pad changes size, so turning a phone or resizing the window keeps it.
 */
export default function SignaturePad({ value, onChange, defaultName = "", language = "en", className }: SignaturePadProps) {
  const words = WORDS[language];
  const [mode, setMode] = useState<"draw" | "type">(value?.type === "type" ? "type" : "draw");
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [typed, setTyped] = useState(value?.type === "type" ? value.value : "");
  const [problem, setProblem] = useState("");
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef<Stroke | null>(null);
  const strokesRef = useRef<Stroke[]>([]);
  strokesRef.current = strokes;

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ratio = window.devicePixelRatio || 1;
    const { width, height } = canvas.getBoundingClientRect();
    if (canvas.width !== Math.round(width * ratio) || canvas.height !== Math.round(height * ratio)) {
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
    }
    const context = canvas.getContext("2d")!;
    context.setTransform(ratio, 0, 0, ratio, 0, 0);
    context.clearRect(0, 0, width, height);
    drawStrokes(context, drawing.current ? [...strokesRef.current, drawing.current] : strokesRef.current);
  }, []);

  useEffect(() => {
    if (mode !== "draw") return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const observer = new ResizeObserver(() => paint());
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [mode, paint]);

  useEffect(() => {
    paint();
  }, [strokes, paint]);

  const pointAt = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };

  const start = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0 && event.pointerType === "mouse") return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = [pointAt(event)];
    setProblem("");
    paint();
  };

  const move = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const events = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
    const rect = event.currentTarget.getBoundingClientRect();
    for (const point of events) drawing.current.push({ x: point.clientX - rect.left, y: point.clientY - rect.top });
    paint();
  };

  const end = () => {
    if (!drawing.current) return;
    const next = [...strokesRef.current, drawing.current];
    drawing.current = null;
    setStrokes(next);
    if (tooSmall(next)) {
      onChange(null);
      return;
    }
    const png = exportStrokes(next);
    if (png.length > MAX_DRAWN_SIGNATURE_LENGTH) {
      setProblem(words.tooLarge);
      onChange(null);
      return;
    }
    onChange({ type: "draw", value: png });
  };

  const clear = () => {
    setStrokes([]);
    setProblem("");
    onChange(null);
  };

  const switchTo = (next: "draw" | "type") => {
    if (next === mode) return;
    setMode(next);
    setProblem("");
    if (next === "type") {
      const name = typed || defaultName;
      setTyped(name);
      onChange(name.trim().length >= 2 ? { type: "type", value: name.trim() } : null);
    } else {
      onChange(!tooSmall(strokes) ? { type: "draw", value: exportStrokes(strokes) } : null);
    }
  };

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex items-center justify-between gap-2">
        <div role="tablist" aria-label="Signature" className="inline-flex rounded-md border bg-muted/40 p-0.5">
          {(["draw", "type"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={mode === option}
              onClick={() => switchTo(option)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                mode === option ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option === "draw" ? <PenLine className="h-3.5 w-3.5" /> : <Type className="h-3.5 w-3.5" />}
              {option === "draw" ? words.draw : words.type}
            </button>
          ))}
        </div>
        {mode === "draw" && strokes.length > 0 && (
          <Button type="button" variant="ghost" size="sm" onClick={clear}>
            <Eraser className="mr-1.5 h-3.5 w-3.5" />{words.clear}
          </Button>
        )}
      </div>

      {mode === "draw" ? (
        <div className="relative rounded-lg border-2 border-dashed border-input bg-white">
          <canvas
            ref={canvasRef}
            aria-label={words.drawLabel}
            className="block h-40 w-full cursor-crosshair touch-none select-none rounded-lg"
            onPointerDown={start}
            onPointerMove={move}
            onPointerUp={end}
            onPointerCancel={end}
          />
          {strokes.length === 0 && (
            <p className="pointer-events-none absolute inset-0 grid place-items-center px-4 text-center text-sm text-neutral-400">
              {words.drawHere}
            </p>
          )}
          <div className="pointer-events-none absolute inset-x-6 bottom-8 border-b border-neutral-300" />
        </div>
      ) : (
        <div className="space-y-2">
          <Input
            aria-label={words.typeLabel}
            placeholder={words.typeLabel}
            value={typed}
            autoComplete="name"
            onChange={(event) => {
              setTyped(event.target.value);
              const name = event.target.value.trim();
              onChange(name.length >= 2 ? { type: "type", value: name } : null);
            }}
          />
          <div className="flex h-24 items-end rounded-lg border bg-white px-5 pb-4">
            <span className="w-full truncate border-b border-neutral-300 pb-1 text-3xl italic text-[#1c1a1b]">
              {typed.trim() || " "}
            </span>
          </div>
        </div>
      )}
      {problem && <p className="text-xs text-destructive">{problem}</p>}
      {mode === "draw" && !problem && strokes.length > 0 && tooSmall(strokes) && (
        <p className="text-xs text-muted-foreground">{words.tooSmall}</p>
      )}
    </div>
  );
}
