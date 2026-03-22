import { useState, useRef } from "react";
import { Sparkles, Loader2, Eye, Edit3, Copy, Check, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { runSkillStream } from "@/lib/claude";

const SYSTEM_PROMPT = `You are an expert B2B email marketing copywriter for LV Branding, a Houston-based full-service marketing agency.

Write a personalized, professional B2B email campaign. Return EXACTLY this format — no extra text before or after:

SUBJECT: [compelling subject line, max 60 chars, no all-caps]
PREVIEW: [preheader text, 85-100 chars, extends subject naturally]
---
[Email body as clean HTML using ONLY <p>, <strong>, <em>, <a href="..."> tags.
Use {{first_name}} for personal greeting (e.g. "Hi {{first_name}},").
Use {{company}} once where natural.
Structure: warm greeting → clear value proposition → specific CTA → professional sign-off from "The LV Branding Team".
Max 180 words. Direct, confident, not salesy. No <html>/<head>/<body>/<style> tags.]`;

interface Props {
  campaignName: string;
  onCampaignNameChange: (name: string) => void;
  subject: string;
  onSubjectChange: (s: string) => void;
  previewText: string;
  onPreviewTextChange: (s: string) => void;
  bodyHtml: string;
  onBodyHtmlChange: (s: string) => void;
  recipientCount: number;
}

export default function EmailComposer({
  campaignName, onCampaignNameChange,
  subject, onSubjectChange,
  previewText, onPreviewTextChange,
  bodyHtml, onBodyHtmlChange,
  recipientCount,
}: Props) {
  const [intent,    setIntent]    = useState("");
  const [streaming, setStreaming] = useState(false);
  const [view,      setView]      = useState<"edit" | "preview">("edit");
  const [copied,    setCopied]    = useState(false);

  const streamedRef = useRef("");

  const generate = async () => {
    if (!intent.trim()) return;
    setStreaming(true);
    streamedRef.current = "";
    onSubjectChange("");
    onPreviewTextChange("");
    onBodyHtmlChange("");

    let full = "";

    await runSkillStream(
      {
        skillSystemPrompt: SYSTEM_PROMPT,
        userMessage: intent.trim(),
        conversationHistory: [],
        marketingContext: {},
      },
      {
        onToken: (t) => {
          full += t;
          // Parse incrementally
          const subjectMatch = full.match(/^SUBJECT:\s*(.+)/m);
          const previewMatch = full.match(/^PREVIEW:\s*(.+)/m);
          const bodyStart    = full.indexOf("---\n");

          if (subjectMatch) onSubjectChange(subjectMatch[1].trim());
          if (previewMatch) onPreviewTextChange(previewMatch[1].trim());
          if (bodyStart !== -1) {
            onBodyHtmlChange(full.slice(bodyStart + 4).trimStart());
          }
        },
        onComplete: (text) => {
          // Final clean parse
          const lines      = text.split("\n");
          const subLine    = lines.find((l) => l.startsWith("SUBJECT:"));
          const prevLine   = lines.find((l) => l.startsWith("PREVIEW:"));
          const bodyStart  = text.indexOf("---\n");

          if (subLine)    onSubjectChange(subLine.replace("SUBJECT:", "").trim());
          if (prevLine)   onPreviewTextChange(prevLine.replace("PREVIEW:", "").trim());
          if (bodyStart !== -1) onBodyHtmlChange(text.slice(bodyStart + 4).trimStart());
          setStreaming(false);
        },
        onError: () => setStreaming(false),
      }
    );
  };

  const copyBody = async () => {
    await navigator.clipboard.writeText(bodyHtml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Preview HTML with sample vars merged
  const previewHtml = bodyHtml
    .replace(/\{\{first_name\}\}/g, "Sarah")
    .replace(/\{\{last_name\}\}/g, "Johnson")
    .replace(/\{\{company\}\}/g, "Acme Corp")
    .replace(/\{\{title\}\}/g, "Marketing Director");

  return (
    <div className="space-y-4">
      {/* Campaign name */}
      <div>
        <label className="text-[10px] uppercase tracking-widest text-muted-foreground block mb-1.5">
          Campaign Name
        </label>
        <Input
          value={campaignName}
          onChange={(e) => onCampaignNameChange(e.target.value)}
          placeholder="e.g. Spring Outreach — Real Estate"
          className="h-9 text-sm"
        />
      </div>

      {/* AI Intent */}
      <div className="bg-muted/40 border border-border rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-1.5">
          <Sparkles size={14} className="text-primary" />
          <p className="text-sm font-semibold">AI Email Writer</p>
          <span className="text-[10px] text-muted-foreground ml-1">
            ({recipientCount} recipients)
          </span>
        </div>
        <textarea
          className="w-full text-xs border border-border rounded-lg p-3 bg-background resize-none min-h-[80px] focus:outline-none focus:ring-1 focus:ring-ring"
          placeholder="Describe your campaign… e.g. 'Reach out to real estate executives in Houston about our new brand identity package. Mention our local expertise and offer a free 30-min strategy call.'"
          value={intent}
          onChange={(e) => setIntent(e.target.value)}
          disabled={streaming}
        />
        <Button
          onClick={generate}
          disabled={streaming || !intent.trim()}
          className="gap-2 w-full sm:w-auto"
          size="sm"
        >
          {streaming
            ? <><Loader2 size={13} className="animate-spin" />Writing…</>
            : bodyHtml
            ? <><RefreshCw size={13} />Re-generate</>
            : <><Sparkles size={13} />Generate Email</>}
        </Button>
      </div>

      {/* Subject + preview text */}
      {(subject || streaming) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground block mb-1.5">
              Subject Line
            </label>
            <Input
              value={subject}
              onChange={(e) => onSubjectChange(e.target.value)}
              placeholder="Subject…"
              className="h-9 text-sm"
            />
            <p className="text-[10px] text-muted-foreground mt-1">{subject.length}/60 chars</p>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground block mb-1.5">
              Preview Text
            </label>
            <Input
              value={previewText}
              onChange={(e) => onPreviewTextChange(e.target.value)}
              placeholder="Preview / preheader…"
              className="h-9 text-sm"
            />
            <p className="text-[10px] text-muted-foreground mt-1">{previewText.length}/100 chars</p>
          </div>
        </div>
      )}

      {/* Body editor / preview */}
      {(bodyHtml || streaming) && (
        <div>
          <div className="flex items-center justify-between mb-2 gap-2 flex-wrap">
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground">
              Email Body
            </label>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setView("edit")}
                className={cn(
                  "flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border transition-colors",
                  view === "edit" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary"
                )}
              >
                <Edit3 size={10} />Edit
              </button>
              <button
                onClick={() => setView("preview")}
                className={cn(
                  "flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border transition-colors",
                  view === "preview" ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary"
                )}
              >
                <Eye size={10} />Preview
              </button>
              <button onClick={copyBody} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border border-border text-muted-foreground hover:border-primary transition-colors">
                {copied ? <><Check size={10} />Copied</> : <><Copy size={10} />Copy</>}
              </button>
            </div>
          </div>

          {view === "edit" ? (
            <div className="relative">
              <textarea
                className="w-full text-xs border border-border rounded-xl p-4 bg-background resize-none min-h-[220px] focus:outline-none focus:ring-1 focus:ring-ring font-mono"
                value={bodyHtml}
                onChange={(e) => onBodyHtmlChange(e.target.value)}
                placeholder="HTML email body…"
              />
              {streaming && (
                <div className="absolute bottom-3 right-3 flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Loader2 size={10} className="animate-spin" />Writing…
                </div>
              )}
              {/* Variable helper chips */}
              <div className="flex flex-wrap gap-1.5 mt-2">
                <p className="text-[10px] text-muted-foreground w-full">Insert variables:</p>
                {["{{first_name}}", "{{last_name}}", "{{company}}", "{{title}}"].map((v) => (
                  <button
                    key={v}
                    onClick={() => onBodyHtmlChange(bodyHtml + v)}
                    className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded font-mono hover:bg-primary/20 transition-colors"
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="border border-border rounded-xl overflow-hidden bg-[#f4f4f5] p-3">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-2 px-1">
                Preview with sample data (Sarah Johnson · Acme Corp)
              </p>
              <div className="bg-white rounded-lg p-4 sm:p-6 border border-border text-sm leading-relaxed"
                dangerouslySetInnerHTML={{ __html: previewHtml }} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
