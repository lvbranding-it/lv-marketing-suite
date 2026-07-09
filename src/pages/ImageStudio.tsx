import { useCallback, useEffect, useRef, useState } from "react";
import {
  Upload, Download, Maximize2, Crop, RotateCcw, ImageIcon,
  Square, RectangleHorizontal, RectangleVertical, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import LVLogo from "@/components/LVLogo";

// ── Aspect-ratio presets (export dims — social-optimized, short edge 1080) ──────

type Orient = "square" | "landscape" | "portrait";

interface Ratio {
  key:    string;
  label:  string;
  w:      number;   // export width  (px)
  h:      number;   // export height (px)
  orient: Orient;
}

const RATIOS: Ratio[] = [
  { key: "1x1",  label: "1:1",  w: 1080, h: 1080, orient: "square"    },
  { key: "4x3",  label: "4:3",  w: 1440, h: 1080, orient: "landscape" },
  { key: "3x4",  label: "3:4",  w: 1080, h: 1440, orient: "portrait"  },
  { key: "7x5",  label: "7:5",  w: 1512, h: 1080, orient: "landscape" },
  { key: "5x7",  label: "5:7",  w: 1080, h: 1512, orient: "portrait"  },
  { key: "16x9", label: "16:9", w: 1920, h: 1080, orient: "landscape" },
  { key: "9x16", label: "9:16", w: 1080, h: 1920, orient: "portrait"  },
];

const ORIENT_ICON: Record<Orient, typeof Square> = {
  square:    Square,
  landscape: RectangleHorizontal,
  portrait:  RectangleVertical,
};

// ── Placement maths ─────────────────────────────────────────────────────────────
// The image is described independently of on-screen size:
//   zoom   — 1 = "contain" (fits fully inside the frame, showing white margins)
//   offset — image-centre displacement as a fraction of frame width / height
// layout() turns that into a draw rectangle for any target canvas size.

function baseFit(nw: number, nh: number, EW: number, EH: number) {
  return Math.min(EW / nw, EH / nh);
}
function coverZoom(nw: number, nh: number, EW: number, EH: number) {
  return Math.max(EW / nw, EH / nh) / baseFit(nw, nh, EW, EH);
}

function layout(
  nw: number, nh: number, EW: number, EH: number,
  zoom: number, ox: number, oy: number,
) {
  const eff   = baseFit(nw, nh, EW, EH) * zoom;
  const drawW = nw * eff;
  const drawH = nh * eff;
  const cx    = EW / 2 + ox * EW;
  const cy    = EH / 2 + oy * EH;
  return { drawW, drawH, x: cx - drawW / 2, y: cy - drawH / 2 };
}

// ── Main ────────────────────────────────────────────────────────────────────────

export default function ImageStudio() {
  const [img, setImg]         = useState<HTMLImageElement | null>(null);
  const [imgSrc, setImgSrc]   = useState<string | null>(null);
  const [natural, setNatural] = useState({ w: 0, h: 0 });
  const [ratioKey, setRatioKey] = useState("1x1");
  const [zoom, setZoom]       = useState(1);
  const [offset, setOffset]   = useState({ x: 0, y: 0 });
  const [bg, setBg]           = useState("#ffffff");
  const [dragOver, setDragOver] = useState(false);
  const [exporting, setExporting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const boardRef     = useRef<HTMLDivElement>(null);
  // Active touch/mouse pointers on the board + the current gesture baseline
  const pointers = useRef<Map<number, { x: number; y: number }>>(new Map());
  const gesture  = useRef<
    | { type: "pan";   startX: number; startY: number; ox: number; oy: number }
    | { type: "pinch"; startDist: number; startZoom: number }
    | null
  >(null);

  const ratio = RATIOS.find((r) => r.key === ratioKey)!;

  // ── Load an image file ──────────────────────────────────────────────────────
  const loadFile = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) return;
    const url = URL.createObjectURL(file);
    const el = new Image();
    el.onload = () => {
      setImg(el);
      setImgSrc(url);
      setNatural({ w: el.naturalWidth, h: el.naturalHeight });
      setZoom(1);
      setOffset({ x: 0, y: 0 });
    };
    el.src = url;
  }, []);

  const onFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) loadFile(f);
    e.target.value = "";
  };

  // ── Paste from clipboard ────────────────────────────────────────────────────
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const item = Array.from(e.clipboardData?.items ?? []).find((i) => i.type.startsWith("image/"));
      const file = item?.getAsFile();
      if (file) loadFile(file);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [loadFile]);

  // ── Drag to reposition + pinch to zoom (mouse & touch) ──────────────────────
  const clampZoom = (z: number) => Math.min(6, Math.max(0.1, z));
  const twoPointerDist = () => {
    const [p1, p2] = [...pointers.current.values()];
    return Math.hypot(p2.x - p1.x, p2.y - p1.y);
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!img) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (pointers.current.size === 1) {
      gesture.current = { type: "pan", startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y };
    } else if (pointers.current.size === 2) {
      gesture.current = { type: "pinch", startDist: twoPointerDist(), startZoom: zoom };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const g = gesture.current;
    if (!g) return;

    if (g.type === "pan" && boardRef.current) {
      const rect = boardRef.current.getBoundingClientRect();
      const dx = (e.clientX - g.startX) / rect.width;
      const dy = (e.clientY - g.startY) / rect.height;
      setOffset({ x: g.ox + dx, y: g.oy + dy });
    } else if (g.type === "pinch" && pointers.current.size >= 2) {
      setZoom(clampZoom(g.startZoom * (twoPointerDist() / g.startDist)));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    pointers.current.delete(e.pointerId);
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch { /* noop */ }

    if (pointers.current.size === 1) {
      // Dropped from pinch back to a single finger — restart the pan from here
      const [p] = [...pointers.current.values()];
      gesture.current = { type: "pan", startX: p.x, startY: p.y, ox: offset.x, oy: offset.y };
    } else if (pointers.current.size === 0) {
      gesture.current = null;
    }
  };

  // ── Wheel to zoom (desktop) ─────────────────────────────────────────────────
  const onWheel = (e: React.WheelEvent) => {
    if (!img) return;
    const factor = e.deltaY < 0 ? 1.06 : 1 / 1.06;
    setZoom((z) => clampZoom(z * factor));
  };

  // ── Placement helpers ───────────────────────────────────────────────────────
  const fit    = () => { setZoom(1); setOffset({ x: 0, y: 0 }); };
  const fill   = () => { setZoom(coverZoom(natural.w, natural.h, ratio.w, ratio.h)); setOffset({ x: 0, y: 0 }); };
  const center = () => setOffset({ x: 0, y: 0 });

  // ── Export PNG ──────────────────────────────────────────────────────────────
  const exportPng = () => {
    if (!img) return;
    setExporting(true);
    try {
      const canvas = document.createElement("canvas");
      canvas.width  = ratio.w;
      canvas.height = ratio.h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, ratio.w, ratio.h);
      ctx.imageSmoothingQuality = "high";
      const { drawW, drawH, x, y } = layout(natural.w, natural.h, ratio.w, ratio.h, zoom, offset.x, offset.y);
      ctx.drawImage(img, x, y, drawW, drawH);
      canvas.toBlob((blob) => {
        if (!blob) { setExporting(false); return; }
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `lv-image-${ratio.key}-${Date.now()}.png`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(a.href);
        setExporting(false);
      }, "image/png");
    } catch {
      setExporting(false);
    }
  };

  // ── On-screen placement (percent of board — resolution independent) ─────────
  const L = img ? layout(natural.w, natural.h, ratio.w, ratio.h, zoom, offset.x, offset.y) : null;
  const wPct    = L ? (L.drawW / ratio.w) * 100 : 0;
  const hPct    = L ? (L.drawH / ratio.h) * 100 : 0;
  const leftPct = L ? (L.x / ratio.w) * 100 : 0;
  const topPct  = L ? (L.y / ratio.h) * 100 : 0;

  return (
    <div className="min-h-screen bg-slate-100 flex flex-col">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-4 sm:px-6 py-3 flex items-center gap-3 shrink-0">
        <LVLogo size={34} />
        <div className="leading-tight">
          <h1 className="text-base font-bold text-slate-800">Image Studio</h1>
          <p className="text-xs text-muted-foreground">Frame any photo on a clean background &amp; export social-ready sizes.</p>
        </div>
      </header>

      <div className="flex-1 flex flex-col lg:flex-row">
        {/* ── Board ── */}
        <div className="flex-1 flex items-center justify-center p-4 sm:p-8 min-h-0">
          <div
            ref={boardRef}
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) loadFile(f);
            }}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onWheel={onWheel}
            className={`relative overflow-hidden rounded-lg shadow-xl ring-1 transition-shadow ${
              dragOver ? "ring-2 ring-rose-400" : "ring-slate-200"
            } ${img ? "cursor-grab active:cursor-grabbing" : "cursor-pointer"}`}
            style={{
              aspectRatio: `${ratio.w} / ${ratio.h}`,
              // Fit within both the available width (max 640) and height (68vh) for any orientation
              width: `min(100%, 640px, calc(68vh * ${ratio.w} / ${ratio.h}))`,
              background: bg,
              touchAction: "none",
            }}
            onClick={() => { if (!img) fileInputRef.current?.click(); }}
          >
              {img && imgSrc ? (
                <img
                  src={imgSrc}
                  alt="Adjustable"
                  draggable={false}
                  className="absolute select-none pointer-events-none"
                  style={{
                    width:  `${wPct}%`,
                    height: `${hPct}%`,
                    left:   `${leftPct}%`,
                    top:    `${topPct}%`,
                  }}
                />
              ) : (
                <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-slate-400 p-6 text-center">
                  <ImageIcon size={40} strokeWidth={1.4} />
                  <p className="text-sm font-medium text-slate-500">Drop an image here, click to browse, or paste</p>
                  <p className="text-xs">PNG · JPG · WebP</p>
                </div>
              )}
          </div>
        </div>

        {/* ── Controls ── */}
        <aside className="w-full lg:w-80 bg-white border-t lg:border-t-0 lg:border-l border-slate-200 p-4 sm:p-5 space-y-6 shrink-0">
          {/* Upload */}
          <div>
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={onFileInput} />
            <Button className="w-full gap-2 bg-rose-500 hover:bg-rose-600 text-white" onClick={() => fileInputRef.current?.click()}>
              <Upload size={15} /> {img ? "Replace Image" : "Upload Image"}
            </Button>
          </div>

          {/* Aspect ratios */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Aspect Ratio</p>
            <div className="grid grid-cols-4 gap-1.5">
              {RATIOS.map((r) => {
                const Icon = ORIENT_ICON[r.orient];
                const active = r.key === ratioKey;
                return (
                  <button
                    key={r.key}
                    onClick={() => setRatioKey(r.key)}
                    className={`flex flex-col items-center gap-1 py-2 rounded-lg border text-[11px] font-medium transition-colors ${
                      active
                        ? "border-rose-400 bg-rose-50 text-rose-600"
                        : "border-slate-200 text-slate-500 hover:border-slate-300 hover:bg-slate-50"
                    }`}
                  >
                    <Icon size={15} />
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Zoom */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Size</p>
              <span className="text-xs text-slate-400 tabular-nums">{Math.round(zoom * 100)}%</span>
            </div>
            <input
              type="range"
              min={0.1}
              max={6}
              step={0.01}
              value={zoom}
              disabled={!img}
              onChange={(e) => setZoom(parseFloat(e.target.value))}
              className="w-full accent-rose-500 disabled:opacity-40"
            />
            <div className="grid grid-cols-3 gap-1.5">
              <Button variant="outline" size="sm" className="text-xs gap-1" onClick={fit}    disabled={!img}><Maximize2 size={12} /> Fit</Button>
              <Button variant="outline" size="sm" className="text-xs gap-1" onClick={fill}   disabled={!img}><Crop size={12} /> Fill</Button>
              <Button variant="outline" size="sm" className="text-xs gap-1" onClick={center} disabled={!img}><RotateCcw size={12} /> Center</Button>
            </div>
          </div>

          {/* Background */}
          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Background</p>
            <div className="flex items-center gap-2">
              {["#ffffff", "#f5f5f4", "#000000"].map((c) => (
                <button
                  key={c}
                  onClick={() => setBg(c)}
                  className={`w-8 h-8 rounded-md border transition-transform ${bg === c ? "ring-2 ring-rose-400 ring-offset-1" : "border-slate-200"}`}
                  style={{ background: c }}
                  aria-label={`Background ${c}`}
                />
              ))}
              <label className="w-8 h-8 rounded-md border border-slate-200 overflow-hidden relative cursor-pointer" title="Custom colour">
                <input type="color" value={bg} onChange={(e) => setBg(e.target.value)} className="absolute inset-0 w-full h-full cursor-pointer opacity-0" />
                <span className="absolute inset-0 flex items-center justify-center text-[9px] text-slate-400" style={{ background: bg }}>＋</span>
              </label>
            </div>
          </div>

          {/* Export */}
          <div className="pt-2 border-t border-slate-100">
            <Button
              className="w-full gap-2"
              onClick={exportPng}
              disabled={!img || exporting}
            >
              {exporting
                ? <><Loader2 size={15} className="animate-spin" /> Exporting…</>
                : <><Download size={15} /> Export PNG ({ratio.w}×{ratio.h})</>}
            </Button>
            <p className="text-[11px] text-muted-foreground text-center mt-2">
              Everything runs in your browser — nothing is uploaded.
            </p>
          </div>
        </aside>
      </div>

      {/* Footer */}
      <footer className="bg-white border-t border-slate-200 py-4 text-center shrink-0">
        <p className="text-xs text-muted-foreground">
          Made with{" "}
          <span className="text-rose-500">&hearts;</span>{" "}
          by{" "}
          <a
            href="https://www.lvbranding.com"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-slate-600 hover:text-rose-500 transition-colors"
          >
            LV Branding
          </a>
        </p>
      </footer>
    </div>
  );
}
