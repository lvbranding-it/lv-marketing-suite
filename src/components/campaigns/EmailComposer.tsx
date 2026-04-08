import { useState, useRef, useMemo } from "react";
import {
  Sparkles, Loader2, Copy, Check, RefreshCw,
  BookOpen, ChevronDown, ChevronUp, Trash2, Monitor, Smartphone,
} from "lucide-react";
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
interface BuiltinBlock { name: string; html: string; }

const BUILTIN_BLOCKS: BuiltinBlock[] = [
  {
    name: "LV Header",
    html: `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:#CB2039;margin:0 0 24px 0;"><tr><td style="padding:20px 24px;text-align:center;"><p style="margin:0;color:#ffffff;font-size:22px;font-weight:700;letter-spacing:2px;">LV BRANDING</p><p style="margin:4px 0 0;color:rgba(255,255,255,0.8);font-size:12px;letter-spacing:1px;">FULL-SERVICE MARKETING AGENCY</p></td></tr></table>`,
  },
  {
    name: "CTA Button",
    html: `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:24px 0;"><tr><td style="text-align:center;"><a href="https://lvbranding.com" style="display:inline-block;background:#CB2039;color:#ffffff;text-decoration:none;padding:12px 32px;border-radius:6px;font-weight:600;font-size:14px;letter-spacing:0.5px;">Schedule a Free Call →</a></td></tr></table>`,
  },
  {
    name: "Signature",
    html: `<p style="margin:24px 0 4px;">Warm regards,</p><p style="margin:0;font-weight:600;">The LV Branding Team</p><p style="margin:2px 0;font-size:12px;color:#666;">LV Branding · Houston, TX · <a href="https://lvbranding.com" style="color:#CB2039;">lvbranding.com</a></p>`,
  },
  {
    name: "Divider",
    html: `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:20px 0;"><tr><td style="border-top:1px solid #e5e7eb;font-size:0;line-height:0;">&nbsp;</td></tr></table>`,
  },
  {
    name: "Feature Block",
    html: `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:16px 0;"><tr><td width="64" style="padding:0 16px 0 0;vertical-align:top;"><table width="48" height="48" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;background:#CB2039;border-radius:8px;"><tr><td style="text-align:center;vertical-align:middle;color:#fff;font-size:20px;">★</td></tr></table></td><td style="vertical-align:top;"><p style="margin:0 0 4px;font-weight:600;font-size:15px;">Feature Headline</p><p style="margin:0;font-size:13px;color:#666;">Describe the benefit or feature clearly. Keep it to 1–2 sentences.</p></td></tr></table>`,
  },
];

// ── Email preview iframe ──────────────────────────────────────────────────────
function buildPreviewDoc(bodyHtml: string, previewWidth: "desktop" | "mobile") {
  const body = bodyHtml
    .replace(/\{\{first_name\}\}/g, "Sarah")
    .replace(/\{\{last_name\}\}/g, "Johnson")
    .replace(/\{\{company\}\}/g, "Acme Corp")
    .replace(/\{\{title\}\}/g, "Marketing Director");

  const maxWidth = previewWidth === "mobile" ? "375px" : "600px";

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 16px;
    background: #f4f4f5;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;
    font-size: 15px; color: #1a1a1a; line-height: 1.6;
  }
  .wrapper {
    max-width: ${maxWidth}; margin: 0 auto;
    background: #ffffff; border-radius: 8px;
    box-shadow: 0 2px 12px rgba(0,0,0,0.08);
    overflow: hidden;
  }
  .body { padding: 32px 36px; }
  img { max-width: 100%; height: auto; display: block; }
  a { color: #CB2039; }
  table { border-collapse: collapse; width: 100%; }
  p { margin: 0 0 12px; }
  h1 { font-size: 24px; font-weight: 700; margin: 0 0 16px; }
  h2 { font-size: 20px; font-weight: 600; margin: 0 0 12px; }
  h3 { font-size: 17px; font-weight: 600; margin: 0 0 10px; }
  ul, ol { padding-left: 20px; margin: 0 0 12px; }
  li { margin-bottom: 4px; }
  hr { border: none; border-top: 1px solid #e5e7eb; margin: 20px 0; }
</style>
</head>
<body>
  <div class="wrapper">
    <div class="body">${body || '<p style="color:#9ca3af;font-style:italic;">Your email content will appear here as you write it…</p>'}</div>
  </div>
</body>
</html>`;
}

// Small scaled HTML thumbnail for asset cards
function BlockThumbnail({ html }: { html: string }) {
  const doc = `<html><head><style>
    *{box-sizing:border-box;margin:0;padding:0;}
    body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
      font-size:13px;line-height:1.5;color:#1a1a1a;background:#fff;padding:8px;}
    img{max-width:100%;height:auto;}
    a{color:#CB2039;}table{border-collapse:collapse;width:100%;}
  </style></head><body>${html}</body></html>`;

  return (
    <div className="relative overflow-hidden rounded bg-white border border-border" style={{ height: 72 }}>
      <iframe
        srcDoc={doc}
        sandbox="allow-same-origin"
        scrolling="no"
        style={{ width: "200%", height: "200%", border: "none", transform: "scale(0.5)", transformOrigin: "top left", pointerEvents: "none" }}
        title="block preview"
      />
    </div>
  );
}

// ── Props ─────────────────────────────────────────────────────────────────────
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
  const [intent,        setIntent]        = useState("");
  const [streaming,     setStreaming]     = useState(false);
  const [copied,        setCopied]        = useState(false);
  const [previewDevice, setPreviewDevice] = useState<"desktop" | "mobile">("desktop");

  // Assets Library
  const [assetsOpen,    setAssetsOpen]    = useState(false);
  const [assetsTab,     setAssetsTab]     = useState<"builtin" | "saved">("builtin");
  const [saveBlockName, setSaveBlockName] = useState("");
  const [savingBlock,   setSavingBlock]   = useState(false);

  const editorRef = useRef<RichEmailEditorHandle>(null);
  const { data: savedBlocks = [], isLoading: blocksLoading } = useEmailBlocks();
  const saveBlock   = useSaveEmailBlock();
  const deleteBlock = useDeleteEmailBlock();

  const insertBlock = (html: string) => editorRef.current?.insertHtml(html);

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
    onSubjectChange(""); onPreviewTextChange(""); onBodyHtmlChange("");
    let full = "";
    await runSkillStream(
      { skillSystemPrompt: SYSTEM_PROMPT, userMessage: intent.trim(), conversationHistory: [], marketingContext: {} },
      {
        onToken: (t) => {
          full += t;
          const subjectMatch = full.match(/^SUBJECT:\s*(.+)/m);
          const previewMatch = full.match(/^PREVIEW:\s*(.+)/m);
          const bodyStart    = full.indexOf("---\n");
          if (subjectMatch) onSubjectChange(subjectMatch[1].trim());
          if (previewMatch) onPreviewTextChange(previewMatch[1].trim());
          if (bodyStart !== -1) onBodyHtmlChange(full.slice(bodyStart + 4).trimStart());
        },
        onComplete: (text) => {
          const lines     = text.split("\n");
          const subLine   = lines.find((l) => l.startsWith("SUBJECT:"));
          const prevLine  = lines.find((l) => l.startsWith("PREVIEW:"));
          const bodyStart = text.indexOf("---\n");
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

  const previewDoc = useMemo(
    () => buildPreviewDoc(bodyHtml, previewDevice),
    [bodyHtml, previewDevice]
  );

  return (
    <div className="flex gap-6 items-start">

      {/* ── LEFT: Editor panel ─────────────────────────────────────────── */}
      <div className="flex-1 min-w-0 space-y-4">

        {/* Campaign name */}
        <div>
          <label className="text-[10px] uppercase tracking-widest text-muted-foreground block mb-1.5">Campaign Name</label>
          <Input value={campaignName} onChange={(e) => onCampaignNameChange(e.target.value)}
            placeholder="e.g. Spring Outreach — Real Estate" className="h-9 text-sm" />
        </div>

        {/* AI Intent */}
        <div className="bg-muted/40 border border-border rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-1.5">
            <Sparkles size={14} className="text-primary" />
            <p className="text-sm font-semibold">AI Email Writer</p>
            <span className="text-[10px] text-muted-foreground ml-1">({recipientCount} recipients)</span>
          </div>
          <textarea
            className="w-full text-xs border border-border rounded-lg p-3 bg-background resize-none min-h-[72px] focus:outline-none focus:ring-1 focus:ring-ring"
            placeholder="Describe your campaign… e.g. 'Reach out to real estate executives about our brand identity package. Offer a free 30-min strategy call.'"
            value={intent} onChange={(e) => setIntent(e.target.value)} disabled={streaming}
          />
          <Button onClick={generate} disabled={streaming || !intent.trim()} className="gap-2 w-full sm:w-auto" size="sm">
            {streaming
              ? <><Loader2 size={13} className="animate-spin" />Writing…</>
              : bodyHtml
              ? <><RefreshCw size={13} />Re-generate</>
              : <><Sparkles size={13} />Generate Email</>}
          </Button>
        </div>

        {/* Subject + Preview text — always visible so user can fill manually */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground block mb-1.5">Subject Line</label>
            <Input value={subject} onChange={(e) => onSubjectChange(e.target.value)}
              placeholder="Subject…" className="h-9 text-sm" />
            <p className="text-[10px] text-muted-foreground mt-1">{subject.length}/60 chars</p>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground block mb-1.5">Preview Text</label>
            <Input value={previewText} onChange={(e) => onPreviewTextChange(e.target.value)}
              placeholder="Preview / preheader…" className="h-9 text-sm" />
            <p className="text-[10px] text-muted-foreground mt-1">{previewText.length}/100 chars</p>
          </div>
        </div>

        {/* Body editor */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <label className="text-[10px] uppercase tracking-widest text-muted-foreground">Email Body</label>
            <button onClick={copyBody} className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border border-border text-muted-foreground hover:border-primary transition-colors">
              {copied ? <><Check size={10} />Copied</> : <><Copy size={10} />Copy HTML</>}
            </button>
          </div>
          <RichEmailEditor
            ref={editorRef}
            value={bodyHtml}
            onChange={onBodyHtmlChange}
            placeholder="Start writing your email — or use the AI writer above to generate it."
          />
        </div>

        {/* Assets Library */}
        <div className="border border-border rounded-xl overflow-hidden">
          <button
            type="button"
            onClick={() => setAssetsOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-muted/30 hover:bg-muted/50 transition-colors text-left"
          >
            <div className="flex items-center gap-2">
              <BookOpen size={14} className="text-primary" />
              <span className="text-sm font-medium">Assets Library</span>
              <span className="text-[10px] text-muted-foreground">Reusable blocks</span>
            </div>
            {assetsOpen ? <ChevronUp size={14} className="text-muted-foreground" /> : <ChevronDown size={14} className="text-muted-foreground" />}
          </button>

          {assetsOpen && (
            <div className="p-4 space-y-3 border-t border-border">
              {/* Tabs */}
              <div className="flex gap-1">
                {(["builtin", "saved"] as const).map((tab) => (
                  <button key={tab} type="button" onClick={() => setAssetsTab(tab)}
                    className={cn("text-[11px] px-3 py-1 rounded-md border transition-colors",
                      assetsTab === tab ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:border-primary"
                    )}>
                    {tab === "builtin" ? "Built-in" : `Saved${savedBlocks.length > 0 ? ` (${savedBlocks.length})` : ""}`}
                  </button>
                ))}
              </div>

              {/* Built-in blocks — visual thumbnails */}
              {assetsTab === "builtin" && (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {BUILTIN_BLOCKS.map((block) => (
                    <div key={block.name} className="border border-border rounded-lg overflow-hidden bg-background hover:border-primary transition-colors group">
                      <BlockThumbnail html={block.html} />
                      <div className="px-2 py-1.5 flex items-center justify-between gap-1">
                        <span className="text-[10px] font-medium truncate">{block.name}</span>
                        <button
                          type="button"
                          onClick={() => insertBlock(block.html)}
                          className="shrink-0 text-[9px] px-2 py-0.5 bg-primary text-primary-foreground rounded font-medium opacity-0 group-hover:opacity-100 transition-opacity"
                        >
                          Insert
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Saved blocks */}
              {assetsTab === "saved" && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={saveBlockName}
                      onChange={(e) => setSaveBlockName(e.target.value)}
                      placeholder="Name this block…"
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
                    <div className="flex justify-center py-6"><Loader2 size={16} className="animate-spin text-muted-foreground" /></div>
                  ) : savedBlocks.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground text-center py-6">
                      No saved blocks yet. Write an email body then click "Save Current Body".
                    </p>
                  ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {savedBlocks.map((block) => (
                        <div key={block.id} className="border border-border rounded-lg overflow-hidden bg-background hover:border-primary transition-colors group">
                          <BlockThumbnail html={block.html} />
                          <div className="px-2 py-1.5 flex items-center justify-between gap-1">
                            <span className="text-[10px] font-medium truncate">{block.name}</span>
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
                              <button type="button" onClick={() => insertBlock(block.html)}
                                className="text-[9px] px-2 py-0.5 bg-primary text-primary-foreground rounded font-medium">Insert</button>
                              <button type="button" onClick={() => deleteBlock.mutate(block.id)} disabled={deleteBlock.isPending}
                                className="p-0.5 text-destructive hover:bg-destructive/10 rounded transition-colors"><Trash2 size={10} /></button>
                            </div>
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

      {/* ── RIGHT: Live email preview panel ────────────────────────────── */}
      <div className="hidden xl:flex w-[380px] shrink-0 flex-col sticky top-4" style={{ height: "calc(100vh - 120px)" }}>
        {/* Preview header */}
        <div className="flex items-center justify-between mb-2 px-1">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Live Preview</p>
            <p className="text-[9px] text-muted-foreground">Updates as you write · Sample: Sarah @ Acme Corp</p>
          </div>
          <div className="flex items-center gap-1">
            <button onClick={() => setPreviewDevice("desktop")}
              className={cn("p-1.5 rounded transition-colors", previewDevice === "desktop" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
              title="Desktop preview"><Monitor size={13} /></button>
            <button onClick={() => setPreviewDevice("mobile")}
              className={cn("p-1.5 rounded transition-colors", previewDevice === "mobile" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted")}
              title="Mobile preview"><Smartphone size={13} /></button>
          </div>
        </div>

        {/* Subject + preheader bar */}
        {(subject || previewText) && (
          <div className="mb-2 px-3 py-2 bg-muted/40 border border-border rounded-lg text-[11px] space-y-0.5">
            {subject && <p className="font-semibold truncate">{subject}</p>}
            {previewText && <p className="text-muted-foreground truncate">{previewText}</p>}
          </div>
        )}

        {/* Email iframe */}
        <div className="flex-1 rounded-xl overflow-hidden border border-border bg-[#f4f4f5]">
          <iframe
            srcDoc={previewDoc}
            sandbox="allow-same-origin"
            className="w-full h-full"
            style={{ border: "none" }}
            title="Email preview"
          />
        </div>
      </div>

    </div>
  );
}
