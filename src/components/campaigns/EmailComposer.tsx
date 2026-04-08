import { useState, useRef } from "react";
import { Sparkles, Loader2, Eye, Edit3, Copy, Check, RefreshCw, BookOpen, ChevronDown, ChevronUp, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { runSkillStream } from "@/lib/claude";
import RichEmailEditor, { type RichEmailEditorHandle } from "@/components/campaigns/RichEmailEditor";
import { useEmailBlocks, useSaveEmailBlock, useDeleteEmailBlock } from "@/hooks/useEmailBlocks";

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

// ── Built-in block definitions ────────────────────────────────────────────────
interface BuiltinBlock {
  name: string;
  description: string;
  html: string;
}

const BUILTIN_BLOCKS: BuiltinBlock[] = [
  {
    name: "LV Header",
    description: "Logo header banner",
    html: `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:#CB2039;margin:0 0 24px 0;"><tr><td style="padding:20px 24px;text-align:center;"><p style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:2px;">LV BRANDING</p><p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:12px;letter-spacing:1px;">FULL-SERVICE MARKETING AGENCY</p></td></tr></table>`,
  },
  {
    name: "CTA Button",
    description: "Centered red action button",
    html: `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:24px 0;"><tr><td style="text-align:center;"><a href="https://lvbranding.com" style="display:inline-block;background:#CB2039;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:6px;font-weight:600;font-size:14px;letter-spacing:0.5px;">Schedule a Free Call →</a></td></tr></table>`,
  },
  {
    name: "Signature",
    description: "LV Branding Team sign-off",
    html: `<p style="margin:24px 0 4px;">Warm regards,</p><p style="margin:0;font-weight:600;">The LV Branding Team</p><p style="margin:2px 0;font-size:12px;color:#666;">LV Branding · Houston, TX · <a href="https://lvbranding.com" style="color:#CB2039;">lvbranding.com</a></p>`,
  },
  {
    name: "Divider",
    description: "Horizontal rule separator",
    html: `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:20px 0;"><tr><td style="border-top:1px solid #e5e7eb;font-size:0;line-height:0;">&nbsp;</td></tr></table>`,
  },
  {
    name: "Feature 2-col",
    description: "Icon + text feature block",
    html: `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:16px 0;"><tr><td width="64" style="padding:0 16px 0 0;vertical-align:top;"><table width="48" height="48" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:#CB2039;border-radius:8px;"><tr><td style="text-align:center;vertical-align:middle;color:#fff;font-size:20px;">★</td></tr></table></td><td style="vertical-align:top;"><p style="margin:0 0 4px;font-weight:600;font-size:15px;">Feature Headline</p><p style="margin:0;font-size:13px;color:#666;">Describe the benefit or feature clearly and concisely. Keep it to 1-2 sentences that speak to your audience's needs.</p></td></tr></table>`,
  },
];

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

  // Assets Library state
  const [assetsOpen,   setAssetsOpen]   = useState(false);
  const [assetsTab,    setAssetsTab]    = useState<"builtin" | "saved">("builtin");
  const [saveBlockName, setSaveBlockName] = useState("");
  const [savingBlock,   setSavingBlock]   = useState(false);

  const streamedRef = useRef("");
  const editorRef   = useRef<RichEmailEditorHandle>(null);

  // Email blocks hooks
  const { data: savedBlocks = [], isLoading: blocksLoading } = useEmailBlocks();
  const saveBlock   = useSaveEmailBlock();
  const deleteBlock = useDeleteEmailBlock();

  const insertBlock = (html: string) => {
    editorRef.current?.insertHtml(html);
  };

  const handleSaveCurrentBody = async () => {
    const name = saveBlockName.trim();
    if (!name || !bodyHtml) return;
    setSavingBlock(true);
    try {
      await saveBlock.mutateAsync({ name, html: bodyHtml });
      setSaveBlockName("");
    } finally {
      setSavingBlock(false);
    }
  };

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
            <RichEmailEditor
              ref={editorRef}
              value={bodyHtml}
              onChange={onBodyHtmlChange}
              placeholder="Write your email body here… or use AI to generate it above."
            />
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

      {/* Assets Library */}
      <div className="border border-border rounded-xl overflow-hidden">
        {/* Toggle header */}
        <button
          type="button"
          onClick={() => setAssetsOpen((v) => !v)}
          className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
        >
          <div className="flex items-center gap-2">
            <BookOpen size={14} className="text-primary" />
            <span className="text-sm font-medium">Assets Library</span>
          </div>
          {assetsOpen ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
        </button>

        {assetsOpen && (
          <div className="p-4 space-y-3 border-t border-border">
            {/* Tabs */}
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setAssetsTab("builtin")}
                className={cn(
                  "text-[11px] px-3 py-1 rounded-md border transition-colors",
                  assetsTab === "builtin"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary"
                )}
              >
                Built-in
              </button>
              <button
                type="button"
                onClick={() => setAssetsTab("saved")}
                className={cn(
                  "text-[11px] px-3 py-1 rounded-md border transition-colors",
                  assetsTab === "saved"
                    ? "bg-primary text-primary-foreground border-primary"
                    : "border-border text-muted-foreground hover:border-primary"
                )}
              >
                Saved {savedBlocks.length > 0 && `(${savedBlocks.length})`}
              </button>
            </div>

            {/* Built-in blocks */}
            {assetsTab === "builtin" && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {BUILTIN_BLOCKS.map((block) => (
                  <div
                    key={block.name}
                    className="border border-border rounded-lg p-3 bg-background flex flex-col gap-2"
                  >
                    <div>
                      <p className="text-xs font-semibold">{block.name}</p>
                      <p className="text-[10px] text-muted-foreground">{block.description}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => insertBlock(block.html)}
                      className="self-start text-[10px] px-2 py-1 bg-primary/10 text-primary border border-primary/20 rounded hover:bg-primary/20 transition-colors font-medium"
                    >
                      Insert
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Saved blocks */}
            {assetsTab === "saved" && (
              <div className="space-y-3">
                {/* Save current body */}
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={saveBlockName}
                    onChange={(e) => setSaveBlockName(e.target.value)}
                    placeholder="Block name…"
                    className="flex-1 text-xs border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-ring"
                    onKeyDown={(e) => e.key === "Enter" && handleSaveCurrentBody()}
                  />
                  <button
                    type="button"
                    onClick={handleSaveCurrentBody}
                    disabled={!saveBlockName.trim() || !bodyHtml || savingBlock}
                    className="text-[10px] px-3 py-1.5 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-40 whitespace-nowrap"
                  >
                    {savingBlock ? "Saving…" : "Save Current Body"}
                  </button>
                </div>

                {blocksLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <Loader2 size={16} className="animate-spin text-muted-foreground" />
                  </div>
                ) : savedBlocks.length === 0 ? (
                  <p className="text-[11px] text-muted-foreground text-center py-6">
                    No saved blocks yet. Click 'Save Current Body' to save one.
                  </p>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {savedBlocks.map((block) => (
                      <div
                        key={block.id}
                        className="border border-border rounded-lg p-3 bg-background flex flex-col gap-2"
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-semibold truncate">{block.name}</p>
                          <p className="text-[10px] text-muted-foreground font-mono truncate mt-0.5">
                            {block.html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 60)}…
                          </p>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => insertBlock(block.html)}
                            className="text-[10px] px-2 py-1 bg-primary/10 text-primary border border-primary/20 rounded hover:bg-primary/20 transition-colors font-medium"
                          >
                            Insert
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteBlock.mutate(block.id)}
                            disabled={deleteBlock.isPending}
                            className="text-[10px] px-2 py-1 text-destructive border border-destructive/20 rounded hover:bg-destructive/10 transition-colors"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
