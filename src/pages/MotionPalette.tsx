import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileJson2,
  Gauge,
  Info,
  Layers3,
  LockKeyhole,
  Maximize2,
  Palette,
  Pause,
  Play,
  ZoomIn,
  ZoomOut,
  Redo2,
  Repeat2,
  RotateCcw,
  Save,
  ShieldCheck,
  Undo2,
} from "lucide-react";
import LVLogo from "@/components/LVLogo";
import AnimationPreview, {
  type AnimationPreviewHandle,
} from "@/components/motion-palette/AnimationPreview";
import DetectedColorList from "@/components/motion-palette/DetectedColorList";
import GradientRampList from "@/components/motion-palette/GradientRampList";
import LottieUploader from "@/components/motion-palette/LottieUploader";
import PaletteSchemeManager, {
  PaletteMappingDialog,
} from "@/components/motion-palette/PaletteSchemeManager";
import UnsupportedFeaturesNotice from "@/components/motion-palette/UnsupportedFeaturesNotice";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import {
  appendRecoloredSuffix,
  deepCloneLottie,
  parseLottieJson,
  recolorLottie,
  serializeLottieJson,
  type LottieAnalysis,
  type LottieAnimation,
  type LottieValidationIssue,
} from "@/lib/lottie";
import { createLottieSvgFrameExport } from "@/lib/lottie-svg";
import { loadSchemes, type PaletteScheme } from "@/lib/lottie-schemes";
import {
  canRedoEditorHistory,
  canUndoEditorHistory,
  createEditorHistory,
  pushEditorHistory,
  redoEditorHistory,
  undoEditorHistory,
  type EditorHistory,
} from "@/lib/motion-palette-history";
import { cn } from "@/lib/utils";

const MAX_FILE_BYTES = 10 * 1024 * 1024;
const MAX_HISTORY = 100;

type ReplacementMap = Record<string, string>;

interface LoadedAnimation {
  filename: string;
  fileSize: number;
  original: LottieAnimation;
  analysis: LottieAnalysis;
  warnings: LottieValidationIssue[];
}

const BACKGROUNDS = [
  { name: "Charcoal", value: "#231F20" },
  { name: "Near black", value: "#0D0D0D" },
  { name: "Soft gray", value: "#D8D6D6" },
  { name: "White", value: "#FFFFFF" },
];

function initialReplacements(analysis: LottieAnalysis): ReplacementMap {
  return Object.fromEntries(analysis.colors.map((color) => [color.originalHex, color.originalHex]));
}

function sameReplacements(left: ReplacementMap, right: ReplacementMap): boolean {
  const keys = Object.keys(left);
  return keys.length === Object.keys(right).length && keys.every((key) => left[key] === right[key]);
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number | null): string {
  if (seconds === null) return "—";
  return `${seconds.toFixed(seconds % 1 === 0 ? 0 : 1)} sec`;
}

export default function MotionPalette() {
  const { toast } = useToast();
  const previewRef = useRef<AnimationPreviewHandle>(null);
  const loadSequenceRef = useRef(0);

  const [loaded, setLoaded] = useState<LoadedAnimation | null>(null);
  const [history, setHistory] = useState<EditorHistory<ReplacementMap>>({ entries: [], index: -1 });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [previewReady, setPreviewReady] = useState(false);
  const [playing, setPlaying] = useState(true);
  const [loop, setLoop] = useState(true);
  const [speed, setSpeed] = useState(1);
  const [frame, setFrame] = useState(0);
  const [background, setBackground] = useState("#231F20");
  const [transparent, setTransparent] = useState(false);
  const [previewZoom, setPreviewZoom] = useState(100);
  const [comparison, setComparison] = useState<"original" | "recolored">("recolored");
  const [schemes, setSchemes] = useState<PaletteScheme[]>(() => loadSchemes());
  const [schemeDialog, setSchemeDialog] = useState<{ open: boolean; mode: "manage" | "save" }>({
    open: false,
    mode: "manage",
  });
  const [mappingScheme, setMappingScheme] = useState<PaletteScheme | null>(null);

  const replacements = history.index >= 0 ? history.entries[history.index] : {};
  const canUndo = canUndoEditorHistory(history);
  const canRedo = canRedoEditorHistory(history);
  const hasChanges = loaded
    ? loaded.analysis.colors.some((color) => replacements[color.originalHex] !== color.originalHex)
    : false;

  const editedAnimation = useMemo(() => {
    if (!loaded) return null;
    return recolorLottie(loaded.original, replacements);
  }, [loaded, replacements]);

  const previewAnimation = comparison === "original" ? loaded?.original : editedAnimation;
  const totalFrames = loaded
    ? Math.max(1, Math.round((loaded.analysis.metadata.outPoint ?? 1) - (loaded.analysis.metadata.inPoint ?? 0)))
    : 1;

  const paletteColors = useMemo(
    () => loaded?.analysis.colors.map((color) => ({
      originalHex: color.originalHex,
      replacementHex: replacements[color.originalHex] ?? color.originalHex,
      count: color.occurrenceCount,
      fillCount: color.fillCount,
      strokeCount: color.strokeCount,
      animatedCount: color.animatedCount,
      gradientCount: color.gradientCount,
    })) ?? [],
    [loaded, replacements],
  );

  const gradientRamps = useMemo(() => {
    const colors = loaded?.analysis.colors ?? [];
    // A stop is "shared" when the colour appears more often across the document
    // than it does inside this one ramp. Editing it is still a global change,
    // and the card says so rather than letting it surprise the user.
    const totalUses = new Map(colors.map((color) => [color.originalHex, color.occurrenceCount]));

    return (loaded?.analysis.gradients ?? []).map((ramp) => {
      const usesInRamp = new Map<string, number>();
      for (const stop of ramp.stops) {
        usesInRamp.set(stop.hex, (usesInRamp.get(stop.hex) ?? 0) + 1);
      }

      return {
        id: ramp.id,
        useCount: ramp.useCount,
        usage: ramp.usage,
        animated: ramp.animated,
        stops: ramp.stops.map((stop) => ({
          stopIndex: stop.stopIndex,
          offset: stop.offset,
          originalHex: stop.hex,
          currentHex: replacements[stop.hex] ?? stop.hex,
        })),
        sharedStopIndexes: ramp.stops
          .filter((stop) => {
            const total = totalUses.get(stop.hex) ?? 0;
            return total > (usesInRamp.get(stop.hex) ?? 0) * ramp.useCount;
          })
          .map((stop) => stop.stopIndex),
      };
    });
  }, [loaded, replacements]);

  const detectedOriginalColors = useMemo(
    () => loaded?.analysis.colors.map((color) => color.originalHex) ?? [],
    [loaded],
  );

  const currentColors = useMemo(
    () => paletteColors.map((color) => color.replacementHex),
    [paletteColors],
  );

  useEffect(() => {
    const previous = document.title;
    document.title = "Motion Palette · LV Branding";
    return () => {
      document.title = previous;
    };
  }, []);

  const notify = useCallback((message: string, error = false) => {
    toast({ description: message, variant: error ? "destructive" : "default" });
  }, [toast]);

  const commitReplacements = useCallback((next: ReplacementMap) => {
    setHistory((current) => pushEditorHistory(current, { ...next }, {
      equals: sameReplacements,
      limit: MAX_HISTORY,
    }));
    setComparison("recolored");
  }, []);

  const handleFile = useCallback(async (file: File) => {
    const sequence = ++loadSequenceRef.current;
    setLoadError(null);

    if (!file.name.toLowerCase().endsWith(".json")) {
      setLoadError("Choose a .json file exported by Lottie or Bodymovin.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      setLoadError(`“${file.name}” is ${formatBytes(file.size)}. The local file limit is 10 MB.`);
      return;
    }
    if (file.size === 0) {
      setLoadError("That file is empty. Choose a valid Lottie JSON animation.");
      return;
    }

    setLoading(true);
    try {
      const source = await file.text();
      if (sequence !== loadSequenceRef.current) return;
      const result = parseLottieJson(source);
      if (!result.ok) {
        setLoadError(result.errors.map((issue) => issue.message).join(" "));
        return;
      }

      const original = deepCloneLottie(result.animation);
      const replacements = initialReplacements(result.analysis);
      setLoaded({
        filename: file.name,
        fileSize: file.size,
        original,
        analysis: result.analysis,
        warnings: result.warnings,
      });
      setHistory(createEditorHistory(replacements));
      setPlaying(true);
      setFrame(0);
      setPreviewZoom(100);
      setComparison("recolored");
      setRenderError(null);
      setPreviewReady(false);
      setLoadError(null);
      notify(
        `Found ${result.analysis.editableColorCount} editable color${result.analysis.editableColorCount === 1 ? "" : "s"} across ${result.analysis.editableOccurrenceCount} occurrences.`,
      );
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "The file could not be read.");
    } finally {
      if (sequence === loadSequenceRef.current) setLoading(false);
    }
  }, [notify]);

  const handleColorChange = useCallback((originalHex: string, replacementHex: string) => {
    commitReplacements({ ...replacements, [originalHex]: replacementHex });
  }, [commitReplacements, replacements]);

  const handleResetColor = useCallback((originalHex: string) => {
    commitReplacements({ ...replacements, [originalHex]: originalHex });
  }, [commitReplacements, replacements]);

  const resetAll = useCallback(() => {
    if (!loaded) return;
    commitReplacements(initialReplacements(loaded.analysis));
  }, [commitReplacements, loaded]);

  const undo = useCallback(() => {
    setHistory(undoEditorHistory);
    setComparison("recolored");
  }, []);

  const redo = useCallback(() => {
    setHistory(redoEditorHistory);
    setComparison("recolored");
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, select, [contenteditable='true']")) return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [redo, undo]);

  const applyColors = useCallback((colors: string[], schemeName?: string) => {
    if (!loaded) return;
    const next = { ...replacements };
    loaded.analysis.colors.forEach((color, index) => {
      if (colors[index]) next[color.originalHex] = colors[index];
    });
    commitReplacements(next);
    if (schemeName) notify(`Applied “${schemeName}”.`);
  }, [commitReplacements, loaded, notify, replacements]);

  const handleApplyScheme = useCallback((scheme: PaletteScheme) => {
    if (!loaded) return;
    if (scheme.colors.length !== loaded.analysis.colors.length) {
      setMappingScheme(scheme);
      setSchemeDialog((state) => ({ ...state, open: false }));
      return;
    }
    applyColors(scheme.colors, scheme.name);
    setSchemeDialog((state) => ({ ...state, open: false }));
  }, [applyColors, loaded]);

  const download = useCallback(() => {
    if (!loaded || !editedAnimation) return;
    try {
      const serialized = serializeLottieJson(editedAnimation);
      const blob = new Blob([serialized], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = appendRecoloredSuffix(loaded.filename);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      notify(`Downloaded ${anchor.download}.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "The recolored file could not be downloaded.", true);
    }
  }, [editedAnimation, loaded, notify]);

  const downloadSvgFrame = useCallback(() => {
    if (!loaded) return;
    const preview = previewRef.current;
    const svgElement = preview?.getSvgElement();
    if (!preview || !svgElement) {
      notify("The SVG preview is still rendering. Try again in a moment.", true);
      return;
    }

    try {
      const currentFrame = preview.getCurrentFrame();
      const result = createLottieSvgFrameExport(svgElement, loaded.filename, {
        variant: comparison,
        frame: currentFrame,
        width: loaded.analysis.metadata.width ?? undefined,
        height: loaded.analysis.metadata.height ?? undefined,
      });
      const url = URL.createObjectURL(result.blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = result.filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
      notify(`Downloaded ${result.filename} as a static ${comparison} frame.`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "The SVG frame could not be downloaded.", true);
    }
  }, [comparison, loaded, notify]);

  const metadata = loaded?.analysis.metadata;
  const unsupported = loaded?.analysis.unsupportedFeatures.map((feature) => ({
    type: feature.label,
    message: feature.message,
    count: feature.count,
  })) ?? [];

  return (
    <div className="min-h-screen bg-[#100f0f] text-white">
      <header className="sticky top-0 z-30 h-16 border-b border-white/10 bg-[#151414]/95 backdrop-blur">
        <div className="mx-auto flex h-full max-w-[1800px] items-center gap-3 px-4 sm:px-6">
          <Link
            to="/dashboard"
            className="mr-1 grid h-9 w-9 place-items-center rounded-md text-white/55 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CB2039]"
            aria-label="Back to Marketing Suite"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
          <LVLogo size={34} className="shrink-0" />
          <div className="min-w-0 leading-tight">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-sm font-semibold sm:text-base">Motion Palette</h1>
              <span className="hidden rounded-full border border-white/10 bg-white/5 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-white/45 sm:inline">Internal</span>
            </div>
            <p className="hidden text-xs text-white/40 sm:block">Lottie recoloring by LV Branding</p>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden items-center gap-2 text-xs text-emerald-300/70 md:flex">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Browser-only processing
            </div>
            {loaded && <LottieUploader onFile={handleFile} compact disabled={loading} />}
          </div>
        </div>
      </header>

      <main className="mx-auto grid min-h-[calc(100dvh-4rem)] max-w-[1800px] grid-cols-1 lg:h-[calc(100dvh-4rem)] lg:min-h-0 lg:grid-cols-[minmax(0,1fr)_410px]">
        <section className="flex min-w-0 flex-col border-white/10 p-4 sm:p-6 lg:min-h-0 lg:overflow-hidden lg:border-r lg:p-7">
          <div className="mb-4 flex min-h-10 shrink-0 flex-wrap items-center gap-x-5 gap-y-2">
            {loaded && metadata ? (
              <>
                <div className="flex min-w-0 items-center gap-2">
                  <FileJson2 className="h-4 w-4 shrink-0 text-[#e5687b]" aria-hidden="true" />
                  <span className="max-w-[320px] truncate text-sm font-medium text-white/85" title={loaded.filename}>{loaded.filename}</span>
                  <span className="text-xs text-white/30">{formatBytes(loaded.fileSize)}</span>
                </div>
                <div className="flex items-center gap-4 text-xs text-white/45">
                  <span>{metadata.width} × {metadata.height}</span>
                  <span>{metadata.frameRate} fps</span>
                  <span>{formatDuration(metadata.durationSeconds)}</span>
                  <span className="hidden items-center gap-1.5 sm:flex"><Layers3 className="h-3.5 w-3.5" /> {metadata.vectorLayerCount} vector layers</span>
                </div>
              </>
            ) : (
              <div>
                <p className="text-sm font-semibold text-white/85">Animation workspace</p>
                <p className="text-xs text-white/35">Upload a Lottie file to start editing</p>
              </div>
            )}
          </div>

          {loadError && (
            <div role="alert" className="mb-4 flex items-start gap-3 rounded-lg border border-red-400/25 bg-red-500/10 px-4 py-3 text-sm text-red-100">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-red-300" aria-hidden="true" />
              <span>{loadError}</span>
            </div>
          )}

          {!loaded ? (
            <LottieUploader onFile={handleFile} disabled={loading} />
          ) : (
            <>
              <div className="relative flex min-h-[360px] flex-1 lg:min-h-0">
                {previewAnimation && (
                  <AnimationPreview
                    ref={previewRef}
                    animationData={previewAnimation}
                    playing={playing}
                    loop={loop}
                    speed={speed}
                    background={background}
                    transparent={transparent}
                    zoom={previewZoom}
                    onFrameChange={setFrame}
                    onPlaybackChange={setPlaying}
                    onReadyChange={setPreviewReady}
                    onRenderError={setRenderError}
                  />
                )}
                {renderError && (
                  <div role="alert" className="absolute inset-x-4 bottom-4 rounded-lg border border-red-400/25 bg-[#241315]/95 px-4 py-3 text-sm text-red-100 shadow-xl">
                    {renderError}
                  </div>
                )}
                <div className="absolute left-3 top-3 z-10 flex rounded-lg border border-black/20 bg-black/60 p-1 shadow-lg backdrop-blur">
                  <button
                    type="button"
                    onClick={() => setComparison("original")}
                    aria-pressed={comparison === "original"}
                    className={cn(
                      "min-h-8 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CB2039]",
                      comparison === "original" ? "bg-white text-[#231F20]" : "text-white/60 hover:text-white",
                    )}
                  >
                    Original
                  </button>
                  <button
                    type="button"
                    onClick={() => setComparison("recolored")}
                    aria-pressed={comparison === "recolored"}
                    className={cn(
                      "min-h-8 rounded-md px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CB2039]",
                      comparison === "recolored" ? "bg-white text-[#231F20]" : "text-white/60 hover:text-white",
                    )}
                  >
                    Recolored
                  </button>
                </div>
                <div className="absolute right-3 top-3 z-10 flex items-center rounded-lg border border-black/20 bg-black/60 p-1 shadow-lg backdrop-blur">
                  <button
                    type="button"
                    onClick={() => setPreviewZoom((value) => Math.max(50, value - 10))}
                    disabled={previewZoom <= 50}
                    className="grid h-8 w-8 place-items-center rounded-md text-white/65 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CB2039] disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Zoom preview out"
                    title="Zoom out"
                  >
                    <ZoomOut className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <output className="w-11 text-center font-mono text-[10px] tabular-nums text-white/70" aria-live="polite">
                    {previewZoom}%
                  </output>
                  <button
                    type="button"
                    onClick={() => setPreviewZoom((value) => Math.min(150, value + 10))}
                    disabled={previewZoom >= 150}
                    className="grid h-8 w-8 place-items-center rounded-md text-white/65 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CB2039] disabled:cursor-not-allowed disabled:opacity-30"
                    aria-label="Zoom preview in"
                    title="Zoom in"
                  >
                    <ZoomIn className="h-4 w-4" aria-hidden="true" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setPreviewZoom(100)}
                    disabled={previewZoom === 100}
                    className="ml-0.5 flex h-8 items-center gap-1 rounded-md px-2 text-[10px] font-medium text-white/55 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CB2039] disabled:opacity-35"
                    aria-label="Fit animation to preview"
                    title="Fit to preview"
                  >
                    <Maximize2 className="h-3.5 w-3.5" aria-hidden="true" />
                    <span className="hidden sm:inline">Fit</span>
                  </button>
                </div>
              </div>

              <div className="mt-3 shrink-0 rounded-xl border border-white/10 bg-[#181717] px-3 py-3 sm:px-4">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <Button
                    type="button"
                    size="icon"
                    onClick={() => setPlaying((value) => !value)}
                    className="h-9 w-9 rounded-full bg-white text-[#231F20] hover:bg-white/85"
                    aria-label={playing ? "Pause animation" : "Play animation"}
                  >
                    {playing ? <Pause className="h-4 w-4" aria-hidden="true" /> : <Play className="h-4 w-4" aria-hidden="true" />}
                  </Button>
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    onClick={() => previewRef.current?.restart()}
                    className="h-9 w-9 text-white/55 hover:bg-white/10 hover:text-white"
                    aria-label="Restart animation"
                    title="Restart"
                  >
                    <RotateCcw className="h-4 w-4" aria-hidden="true" />
                  </Button>

                  <label className="min-w-[120px] flex-1">
                    <span className="sr-only">Animation frame</span>
                    <input
                      type="range"
                      min={0}
                      max={Math.max(0, totalFrames - 1)}
                      step={0.1}
                      value={Math.min(frame, totalFrames - 1)}
                      onChange={(event) => previewRef.current?.seek(Number(event.target.value))}
                      className="h-2 w-full cursor-pointer accent-[#CB2039]"
                    />
                  </label>
                  <span className="w-14 text-right font-mono text-[10px] tabular-nums text-white/35">
                    {Math.round(frame)}/{totalFrames}
                  </span>

                  <div className="h-6 w-px bg-white/10" aria-hidden="true" />
                  <label className="flex items-center gap-2 text-xs text-white/50">
                    <Gauge className="h-4 w-4" aria-hidden="true" />
                    <select
                      value={speed}
                      onChange={(event) => setSpeed(Number(event.target.value))}
                      className="h-9 rounded-md border border-white/10 bg-black/20 px-2 text-xs text-white focus:outline-none focus:ring-2 focus:ring-[#CB2039]"
                      aria-label="Playback speed"
                    >
                      <option value={0.5}>0.5×</option>
                      <option value={0.75}>0.75×</option>
                      <option value={1}>1×</option>
                      <option value={1.5}>1.5×</option>
                      <option value={2}>2×</option>
                    </select>
                  </label>
                  <label className="flex min-h-9 items-center gap-2 px-1 text-xs text-white/50">
                    <Repeat2 className="h-4 w-4" aria-hidden="true" />
                    Loop
                    <Switch checked={loop} onCheckedChange={setLoop} aria-label="Loop animation" className="data-[state=checked]:bg-[#CB2039] data-[state=unchecked]:bg-white/15" />
                  </label>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-white/[0.07] pt-3">
                  <span className="mr-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-white/30">Preview background</span>
                  {BACKGROUNDS.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => {
                        setBackground(option.value);
                        setTransparent(false);
                      }}
                      className={cn(
                        "h-7 w-7 rounded-md border transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CB2039]",
                        !transparent && background === option.value ? "border-[#CB2039] ring-1 ring-[#CB2039]" : "border-white/20",
                      )}
                      style={{ backgroundColor: option.value }}
                      aria-label={`${option.name} preview background`}
                      title={option.name}
                    />
                  ))}
                  <label className="relative h-7 w-7 overflow-hidden rounded-md border border-white/20" title="Custom background">
                    <input
                      type="color"
                      value={background}
                      onChange={(event) => {
                        setBackground(event.target.value.toUpperCase());
                        setTransparent(false);
                      }}
                      className="absolute -inset-2 h-12 w-12 cursor-pointer opacity-0"
                      aria-label="Choose a custom preview background"
                    />
                    <span className="grid h-full w-full place-items-center text-xs text-white/60" style={{ backgroundColor: background }}>+</span>
                  </label>
                  <label className="ml-1 flex min-h-8 items-center gap-2 text-xs text-white/50">
                    Transparent
                    <Switch checked={transparent} onCheckedChange={setTransparent} aria-label="Use transparent preview background" className="data-[state=checked]:bg-[#CB2039] data-[state=unchecked]:bg-white/15" />
                  </label>
                  <span className="ml-auto hidden items-center gap-1.5 text-[10px] text-white/25 sm:flex">
                    <Info className="h-3 w-3" aria-hidden="true" /> Preview only · SVG exports transparent
                  </span>
                </div>
              </div>
            </>
          )}
        </section>

        <aside className="flex min-h-[500px] flex-col bg-[#141313] lg:h-[calc(100dvh-4rem)] lg:min-h-0">
          <div className="border-b border-white/10 px-4 py-4 sm:px-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <Palette className="h-4 w-4 text-[#e5687b]" aria-hidden="true" />
                  <h2 className="text-sm font-semibold">Detected colors</h2>
                </div>
                <p className="mt-1 text-xs text-white/35">
                  {loaded
                    ? `${loaded.analysis.editableColorCount} colors · ${loaded.analysis.editableOccurrenceCount} editable uses`
                    : "Your editable palette will appear here"}
                </p>
              </div>
              <div className="flex gap-1">
                <Button type="button" size="icon" variant="ghost" onClick={undo} disabled={!canUndo} className="h-8 w-8 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Undo" title="Undo (⌘Z)">
                  <Undo2 aria-hidden="true" />
                </Button>
                <Button type="button" size="icon" variant="ghost" onClick={redo} disabled={!canRedo} className="h-8 w-8 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Redo" title="Redo (⇧⌘Z)">
                  <Redo2 aria-hidden="true" />
                </Button>
                <Button type="button" size="icon" variant="ghost" onClick={resetAll} disabled={!hasChanges} className="h-8 w-8 text-white/50 hover:bg-white/10 hover:text-white" aria-label="Reset all colors" title="Reset all colors">
                  <RotateCcw aria-hidden="true" />
                </Button>
              </div>
            </div>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
            {!loaded ? (
              <div className="flex h-full min-h-[330px] flex-col items-center justify-center px-5 text-center">
                <div className="grid h-12 w-12 place-items-center rounded-xl border border-white/10 bg-white/[0.035] text-white/25">
                  <Palette className="h-5 w-5" aria-hidden="true" />
                </div>
                <p className="mt-4 text-sm font-medium text-white/65">No animation loaded</p>
                <p className="mt-1 max-w-[260px] text-xs leading-5 text-white/30">
                  Static vector fills and strokes are detected automatically after upload.
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {loaded.warnings.length > 0 && (
                  <div className="rounded-lg border border-sky-400/15 bg-sky-300/[0.05] px-3 py-2.5 text-xs leading-5 text-sky-100/65">
                    {loaded.warnings.map((warning) => warning.message).join(" ")}
                  </div>
                )}
                <UnsupportedFeaturesNotice issues={unsupported} />
                {gradientRamps.length > 0 && (
                  <GradientRampList ramps={gradientRamps} onChange={handleColorChange} />
                )}
                {paletteColors.length > 0 ? (
                  <DetectedColorList colors={paletteColors} onChange={handleColorChange} onReset={handleResetColor} />
                ) : (
                  <div className="rounded-xl border border-white/10 bg-white/[0.025] px-5 py-8 text-center">
                    <Info className="mx-auto h-5 w-5 text-white/30" aria-hidden="true" />
                    <p className="mt-3 text-sm font-medium text-white/70">No editable static colors</p>
                    <p className="mt-1 text-xs leading-5 text-white/35">The animation can still be previewed and inspected for unsupported properties.</p>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="border-t border-white/10 bg-[#171616] p-4 sm:p-5">
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setSchemeDialog({ open: true, mode: "manage" })}
                className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                <Palette aria-hidden="true" /> Schemes
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={() => setSchemeDialog({ open: true, mode: "save" })}
                disabled={!loaded || paletteColors.length === 0}
                className="border-white/15 bg-white/5 text-white hover:bg-white/10 hover:text-white"
              >
                <Save aria-hidden="true" /> Save scheme
              </Button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2" aria-label="Animation exports">
              <Button
                type="button"
                onClick={download}
                disabled={!loaded || !editedAnimation || Boolean(renderError)}
                className="bg-[#CB2039] px-3 hover:bg-[#b51c33]"
                aria-label="Download recolored animation as Lottie JSON"
              >
                <Download aria-hidden="true" /> Lottie JSON
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={downloadSvgFrame}
                disabled={!loaded || !previewReady || Boolean(renderError)}
                className="border-white/15 bg-white/5 px-3 text-white hover:bg-white/10 hover:text-white"
                aria-label={`Download current ${comparison} frame as SVG`}
              >
                <Download aria-hidden="true" /> SVG frame
              </Button>
            </div>
            <div className="mt-3 flex items-center justify-center gap-1.5 text-[10px] text-white/30">
              {loaded && !renderError ? <CheckCircle2 className="h-3 w-3 text-emerald-400/70" aria-hidden="true" /> : <LockKeyhole className="h-3 w-3" aria-hidden="true" />}
              {loaded && !renderError
                ? `${comparison === "recolored" ? "Recolored" : "Original"} · frame ${Math.round(frame)} of ${totalFrames} · SVG is static`
                : "Files never leave your browser"}
            </div>
          </div>
        </aside>
      </main>

      <PaletteSchemeManager
        open={schemeDialog.open}
        mode={schemeDialog.mode}
        onOpenChange={(open) => setSchemeDialog((state) => ({ ...state, open }))}
        schemes={schemes}
        onSchemesChange={setSchemes}
        currentColors={currentColors}
        onApply={handleApplyScheme}
        onRequestSave={() => setSchemeDialog({ open: true, mode: "save" })}
        onNotify={notify}
      />
      <PaletteMappingDialog
        scheme={mappingScheme}
        targetColors={detectedOriginalColors}
        open={Boolean(mappingScheme)}
        onOpenChange={(open) => !open && setMappingScheme(null)}
        onApply={(colors) => {
          const name = mappingScheme?.name;
          applyColors(colors, name);
          setMappingScheme(null);
        }}
      />
    </div>
  );
}
