import { useRef, useEffect, useState } from "react";
import { Loader2, Code2, Eye } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { extractHtml } from "@/data/designTypes";

interface DesignPreviewProps {
  html: string;
  streaming: boolean;
  streamedText: string;
}

export default function DesignPreview({ html, streaming, streamedText }: DesignPreviewProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [iframeHeight, setIframeHeight] = useState(500);
  const cleanHtml = extractHtml(html);

  useEffect(() => {
    if (!iframeRef.current || !cleanHtml) return;
    const iframe = iframeRef.current;
    const doc = iframe.contentDocument;
    if (!doc) return;

    doc.open();
    doc.write(cleanHtml);
    doc.close();

    // Auto-size iframe to content height after render
    const resize = () => {
      try {
        const h = iframe.contentDocument?.documentElement?.scrollHeight ?? 500;
        setIframeHeight(Math.max(h, 400));
      } catch {
        setIframeHeight(500);
      }
    };

    // Give the browser a tick to paint the injected HTML
    const t = setTimeout(resize, 150);
    return () => clearTimeout(t);
  }, [cleanHtml]);

  const isEmpty = !html && !streaming;

  if (isEmpty) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-muted-foreground">
        <Eye size={40} className="mb-3 opacity-20" />
        <p className="text-sm">Your design preview will appear here.</p>
        <p className="text-xs mt-1 opacity-70">Fill in the form and click Generate.</p>
      </div>
    );
  }

  return (
    <Tabs defaultValue="preview" className="flex flex-col flex-1 min-h-0">
      <div className="border-b px-4 pt-2 shrink-0">
        <TabsList className="h-8">
          <TabsTrigger value="preview" className="text-xs h-7 px-3">
            <Eye size={12} className="mr-1.5" />
            Preview
          </TabsTrigger>
          <TabsTrigger value="code" className="text-xs h-7 px-3">
            <Code2 size={12} className="mr-1.5" />
            HTML
          </TabsTrigger>
        </TabsList>
      </div>

      <TabsContent value="preview" className="flex-1 min-h-0 mt-0 data-[state=active]:flex data-[state=active]:flex-col overflow-hidden">
        {streaming && !html ? (
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 text-muted-foreground">
              <Loader2 size={28} className="animate-spin" />
              <p className="text-sm">Generating your design...</p>
            </div>
          </div>
        ) : (
          <div className="flex-1 overflow-auto bg-muted/40 p-4">
            <div
              className="bg-white shadow-xl mx-auto rounded overflow-hidden"
              style={{ width: "fit-content", maxWidth: "100%" }}
            >
              <iframe
                ref={iframeRef}
                sandbox="allow-scripts"
                title="Design Preview"
                style={{
                  width: "100%",
                  minWidth: "320px",
                  height: `${iframeHeight}px`,
                  border: "none",
                  display: "block",
                }}
              />
            </div>
          </div>
        )}
      </TabsContent>

      <TabsContent value="code" className="flex-1 min-h-0 mt-0 data-[state=active]:flex data-[state=active]:flex-col">
        <ScrollArea className="flex-1">
          <pre className="p-4 text-xs font-mono text-muted-foreground whitespace-pre-wrap break-all leading-relaxed">
            {streaming ? streamedText : cleanHtml}
          </pre>
        </ScrollArea>
      </TabsContent>
    </Tabs>
  );
}
