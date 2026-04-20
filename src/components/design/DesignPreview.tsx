import { useRef, useEffect, useState, useCallback } from "react";
import { Loader2, Code2, Eye, ZoomIn, ZoomOut, ExternalLink } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { extractHtml, injectCssVars } from "@/data/designTypes";
import { cn } from "@/lib/utils";

const ZOOM_LEVELS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2];

// Inject a height-reporter script into the HTML so we can auto-size the iframe
function injectHeightReporter(html: string): string {
  const script = `<script>
    function reportHeight() {
      var h = Math.max(
        document.body ? document.body.scrollHeight : 0,
        document.documentElement ? document.documentElement.scrollHeight : 0,
        500
      );
      window.parent.postMessage({ type: '__design_height__', value: h }, '*');
    }
    window.addEventListener('load', reportHeight);
    window.addEventListener('resize', reportHeight);
    setTimeout(reportHeight, 300);
  <\/script>`;
  // Insert before </body> or append
  return html.includes("</body>")
    ? html.replace("</body>", `${script}</body>`)
    : html + script;
}

interface DesignPreviewProps {
  html: string;
  streaming: boolean;
  streamedText: string;
  cssOverrides?: Record<string, string>;
  canvasWidth?: number;
  canvasHeight?: number;
}

export default function DesignPreview({ html, streaming, streamedText, cssOverrides = {}, canvasWidth = 1080, canvasHeight }: DesignPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(canvasHeight ?? canvasWidth);
  const [zoom, setZoom] = useState(0.5);

  // Reset height when canvas dimensions change (e.g. aspect ratio switched)
  useEffect(() => {
    setIframeHeight(canvasHeight ?? canvasWidth);
  }, [canvasWidth, canvasHeight]);

  const cleanHtml = extractHtml(html);
  const displayHtml = Object.keys(cssOverrides).length > 0
    ? injectCssVars(cleanHtml, cssOverrides)
    : cleanHtml;
  const srcdoc = cleanHtml ? injectHeightReporter(displayHtml) : "";

  // Listen for height messages from the sandboxed iframe
  useEffect(() => {
    const handler = (e: MessageEvent) => {
      if (e.data?.type === "__design_height__") {
        setIframeHeight(Math.max(e.data.value, 400));
      }
    };
    window.addEventListener("message", handler);
    return () => window.removeEventListener("message", handler);
  }, []);

  const zoomIn = () => {
    const next = ZOOM_LEVELS.find((z) => z > zoom);
    if (next) setZoom(next);
  };
  const zoomOut = () => {
    const prev = [...ZOOM_LEVELS].reverse().find((z) => z < zoom);
    if (prev) setZoom(prev);
  };
  const fitZoom = useCallback(() => setZoom(0.5), []);

  const handleOpenNew = () => {
    if (!cleanHtml) return;
    const blob = new Blob([cleanHtml], { type: "text/html" });
    window.open(URL.createObjectURL(blob), "_blank");
  };

  const isEmpty = !html && !streaming;

  if (isEmpty) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-10 text-muted-foreground select-none">
        <div className="w-20 h-20 rounded-2xl bg-muted/60 flex items-center justify-center mb-4">
          <Eye size={32} className="opacity-20" />
        </div>
        <p className="text-sm font-medium">Preview appears here</p>
        <p className="text-xs mt-1 opacity-60">Fill the form and click Generate Design</p>
      </div>
    );
  }

  return (
    <Tabs defaultValue="preview" className="flex flex-col flex-1 min-h-0">
      {/* Tab bar + zoom toolbar */}
      <div className="border-b px-3 pt-1.5 flex items-center justify-between gap-2 shrink-0 bg-background">
        <TabsList className="h-7 bg-transparent p-0 gap-1">
          <TabsTrigger
            value="preview"
            className="text-xs h-7 px-3 data-[state=active]:bg-muted rounded-md"
          >
            <Eye size={11} className="mr-1.5" />
            Preview
          </TabsTrigger>
          <TabsTrigger
            value="code"
            className="text-xs h-7 px-3 data-[state=active]:bg-muted rounded-md"
          >
            <Code2 size={11} className="mr-1.5" />
            HTML
          </TabsTrigger>
        </TabsList>

        <div className="flex items-center gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={zoomOut} disabled={zoom <= ZOOM_LEVELS[0]}>
            <ZoomOut size={13} />
          </Button>
          <button
            onClick={fitZoom}
            className="text-xs text-muted-foreground hover:text-foreground px-1.5 font-mono min-w-[40px] text-center"
          >
            {Math.round(zoom * 100)}%
          </button>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={zoomIn} disabled={zoom >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1]}>
            <ZoomIn size={13} />
          </Button>
          <div className="w-px h-4 bg-border mx-1" />
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={handleOpenNew} title="Open in new tab">
            <ExternalLink size={12} />
          </Button>
        </div>
      </div>

      {/* Preview tab */}
      <TabsContent
        value="preview"
        className="flex-1 min-h-0 mt-0 data-[state=active]:flex data-[state=active]:flex-col overflow-hidden"
      >
        {streaming && !html ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <div className="relative">
                <div className="w-12 h-12 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Wand2Icon size={20} className="text-primary" />
                </div>
                <Loader2 size={36} className="animate-spin text-primary/30 absolute -inset-1.5" />
              </div>
              <p className="text-sm font-medium">Generating your design...</p>
              <p className="text-xs opacity-50">This usually takes 5–15 seconds</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto bg-[#1a1a2e] p-6 flex items-start justify-center">
            {/*
              Clip-then-scale pattern:
              1. Outer div is exactly the visible (scaled) size — acts as the clipping frame
              2. Inner div is the full canvas size, scaled down via transform
              3. iframe is the full canvas width/height — no sizing ambiguity
            */}
            <div
              className="rounded-lg overflow-hidden shadow-2xl ring-1 ring-white/10 flex-shrink-0"
              style={{
                width: canvasWidth * zoom,
                height: iframeHeight * zoom,
              }}
            >
              <div
                style={{
                  width: canvasWidth,
                  height: iframeHeight,
                  transform: `scale(${zoom})`,
                  transformOrigin: "top left",
                }}
              >
                <iframe
                  ref={iframeRef}
                  srcDoc={srcdoc}
                  sandbox="allow-scripts"
                  title="Design Preview"
                  style={{
                    width: canvasWidth,
                    height: iframeHeight,
                    border: "none",
                    display: "block",
                  }}
                />
              </div>
            </div>
          </div>
        )}
      </TabsContent>

      {/* HTML code tab */}
      <TabsContent
        value="code"
        className="flex-1 min-h-0 mt-0 data-[state=active]:flex data-[state=active]:flex-col bg-[#0d1117]"
      >
        <ScrollArea className="flex-1">
          <pre className="p-5 text-[11px] font-mono text-green-400/80 whitespace-pre-wrap break-all leading-relaxed">
            {streaming ? streamedText : cleanHtml}
          </pre>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}

// Small inline icon used in loading state
function Wand2Icon({ size, className }: { size: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}>
      <path d="m15 4-9 9 2 2 9-9-2-2z" /><path d="m17.5 2.5 4 4" /><path d="M3 20l4-4" /><path d="m2 22 4-1-3-3z" />
    </svg>
  );
}
