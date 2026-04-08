import { useState, useRef, useMemo, useEffect, useCallback } from "react";
import {
  Sparkles, Loader2, Copy, Check, RefreshCw,
  BookOpen, ChevronDown, ChevronUp, Trash2, Monitor, Smartphone, Upload, Link2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { runSkillStream } from "@/lib/claude";
import RichEmailEditor, { type RichEmailEditorHandle } from "@/components/campaigns/RichEmailEditor";
import { useEmailBlocks, useSaveEmailBlock, useDeleteEmailBlock } from "@/hooks/useEmailBlocks";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";

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

const IMG_PLACEHOLDER = "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='400' height='260' viewBox='0 0 400 260'%3E%3Crect width='400' height='260' fill='%23f1f5f9' rx='6'/%3E%3Ctext x='200' y='135' text-anchor='middle' fill='%2394a3b8' font-size='15' font-family='Arial,sans-serif'%3EYour Image%3C/text%3E%3C/svg%3E";

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
    name: "Image + Text",
    html: `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:20px 0;"><tr><td width="42%" style="padding:0 20px 0 0;vertical-align:middle;"><img src="${IMG_PLACEHOLDER}" width="100%" style="border-radius:8px;display:block;max-width:240px;" alt=""/></td><td style="vertical-align:middle;"><h2 style="margin:0 0 10px;font-size:20px;font-weight:700;color:#111827;">Your Headline Here</h2><p style="margin:0 0 14px;color:#4b5563;font-size:14px;line-height:1.65;">Describe your value proposition here. Be direct and focus on how you help the reader achieve their goal.</p><a href="https://lvbranding.com" style="display:inline-block;background:#CB2039;color:#ffffff;text-decoration:none;padding:9px 22px;border-radius:6px;font-weight:600;font-size:13px;">Learn More →</a></td></tr></table>`,
  },
  {
    name: "Text + Image",
    html: `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:20px 0;"><tr><td style="vertical-align:middle;padding:0 20px 0 0;"><h2 style="margin:0 0 10px;font-size:20px;font-weight:700;color:#111827;">Your Headline Here</h2><p style="margin:0 0 14px;color:#4b5563;font-size:14px;line-height:1.65;">Describe your service or offer. Keep it concise — 2-3 sentences is ideal for email.</p><a href="https://lvbranding.com" style="display:inline-block;background:#CB2039;color:#ffffff;text-decoration:none;padding:9px 22px;border-radius:6px;font-weight:600;font-size:13px;">Get Started →</a></td><td width="42%" style="vertical-align:middle;"><img src="${IMG_PLACEHOLDER}" width="100%" style="border-radius:8px;display:block;max-width:240px;" alt=""/></td></tr></table>`,
  },
  {
    name: "3-Feature Columns",
    html: `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:20px 0;"><tr><td width="33%" style="padding:0 12px 0 0;vertical-align:top;text-align:center;"><table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 12px;"><tr><td width="48" height="48" style="background:#fef2f2;border-radius:24px;text-align:center;vertical-align:middle;font-size:22px;">🚀</td></tr></table><p style="margin:0 0 6px;font-weight:700;font-size:15px;color:#111827;">Feature One</p><p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Short description of benefit or feature.</p></td><td width="34%" style="padding:0 6px;vertical-align:top;text-align:center;"><table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 12px;"><tr><td width="48" height="48" style="background:#fef2f2;border-radius:24px;text-align:center;vertical-align:middle;font-size:22px;">📊</td></tr></table><p style="margin:0 0 6px;font-weight:700;font-size:15px;color:#111827;">Feature Two</p><p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Short description of benefit or feature.</p></td><td width="33%" style="padding:0 0 0 12px;vertical-align:top;text-align:center;"><table cellpadding="0" cellspacing="0" border="0" style="margin:0 auto 12px;"><tr><td width="48" height="48" style="background:#fef2f2;border-radius:24px;text-align:center;vertical-align:middle;font-size:22px;">💼</td></tr></table><p style="margin:0 0 6px;font-weight:700;font-size:15px;color:#111827;">Feature Three</p><p style="margin:0;font-size:13px;color:#6b7280;line-height:1.5;">Short description of benefit or feature.</p></td></tr></table>`,
  },
  {
    name: "Testimonial",
    html: `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:20px 0;"><tr><td style="background:#f9fafb;border-left:4px solid #CB2039;border-radius:0 8px 8px 0;padding:20px 24px;"><p style="margin:0 0 12px;font-size:16px;color:#374151;line-height:1.6;font-style:italic;">"Working with LV Branding transformed how we attract patients online. Our new website and targeted campaigns have driven a 40% increase in bookings within 3 months."</p><p style="margin:0;font-size:13px;color:#6b7280;"><strong style="color:#111827;">Dr. Maria Gonzalez</strong> · Houston Medical Group</p></td></tr></table>`,
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
    name: "LV Footer",
    html: `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:24px 0 0;"><tr><td style="background:#f4f5f8;border-radius:8px;padding:28px 32px;text-align:center;"><p style="margin:0 0 16px;font-size:13px;color:#6b7280;">Copyright &copy; 2026 <strong style="color:#111827;">LV Branding</strong>. All rights reserved.</p><p style="margin:0 0 16px;font-size:13px;color:#4b5563;line-height:1.7;text-align:left;">Welcome to the <strong style="color:#111827;">LV Branding</strong> family! As a valued member of our community, you&rsquo;re now part of an exclusive group that receives the latest news, unique insights, and special invitations to our best client activities and events produced by us. We&rsquo;re excited to share our journey with you, offering exclusive discounts and first-hand updates.</p><p style="margin:0;font-size:13px;color:#4b5563;line-height:1.7;text-align:left;">If you ever have questions or suggestions or want to share your thoughts, feel free to hit reply &ndash; we&rsquo;d love to hear from you!</p></td></tr></table>`,
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

// Editable block — designMode iframe + contextual toolbars for images and links
type ActiveEdit =
  | { type: "img";  el: HTMLImageElement;   urlDraft: string }
  | { type: "link"; el: HTMLAnchorElement;  hrefDraft: string };

const BLOCK_CSS = `
  *{box-sizing:border-box;}
  body{margin:0;padding:12px 16px;
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif;
    font-size:14px;line-height:1.6;color:#1a1a1a;background:#fff;outline:none;}
  img{max-width:100%;height:auto;display:block;cursor:pointer;}
  img:hover{outline:2px dashed #CB2039;outline-offset:2px;}
  a{color:#CB2039;cursor:pointer;}
  a:hover{text-decoration:underline;}
  table{border-collapse:collapse;}
  p{margin:0 0 10px;}
  h1{font-size:22px;font-weight:700;margin:0 0 12px;}
  h2{font-size:18px;font-weight:600;margin:0 0 10px;}
  h3{font-size:15px;font-weight:600;margin:0 0 8px;}
`;

function BlockEditor({
  html, name, orgId, onChange, onRemove,
}: {
  html: string;
  name: string;
  orgId: string | undefined;
  onChange: (html: string) => void;
  onRemove: () => void;
}) {
  const iframeRef    = useRef<HTMLIFrameElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const initialHtml  = useRef(html);
  const [height,     setHeight]     = useState(80);
  const [activeEdit, setActiveEdit] = useState<ActiveEdit | null>(null);
  const [uploading,  setUploading]  = useState(false);

  useEffect(() => {
    const iframe = iframeRef.current;
    if (!iframe) return;

    const init = () => {
      const doc = iframe.contentDocument;
      if (!doc) return;
      doc.open();
      doc.write(`<!DOCTYPE html><html><head><style>${BLOCK_CSS}</style></head><body>${initialHtml.current}</body></html>`);
      doc.close();
      doc.designMode = "on";

      const updateHeight = () => setHeight((doc.body?.scrollHeight ?? 60) + 24);

      doc.addEventListener("input", () => {
        onChange(doc.body?.innerHTML ?? "");
        updateHeight();
      });

      doc.addEventListener("click", (e) => {
        const target = e.target as HTMLElement;
        // Image click → show replace toolbar
        if (target.tagName === "IMG") {
          e.preventDefault();
          const img = target as HTMLImageElement;
          setActiveEdit({ type: "img", el: img, urlDraft: img.getAttribute("src") ?? "" });
          return;
        }
        // Link / button click → show URL editor
        const link = target.closest("a") as HTMLAnchorElement | null;
        if (link) {
          e.preventDefault();
          setActiveEdit({ type: "link", el: link, hrefDraft: link.getAttribute("href") ?? "" });
          return;
        }
        setActiveEdit(null);
      });

      updateHeight();
    };

    if (iframe.contentDocument?.readyState === "complete") init();
    else iframe.onload = init;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const readBody = () => iframeRef.current?.contentDocument?.body?.innerHTML ?? "";

  const applyImgUrl = () => {
    if (activeEdit?.type !== "img") return;
    activeEdit.el.src = activeEdit.urlDraft;
    onChange(readBody());
    setActiveEdit(null);
  };

  const applyLinkHref = () => {
    if (activeEdit?.type !== "link") return;
    activeEdit.el.setAttribute("href", activeEdit.hrefDraft);
    onChange(readBody());
    setActiveEdit(null);
  };

  const handleImageUpload = async (file: File) => {
    if (!orgId) return;
    setUploading(true);
    try {
      const ext  = file.name.split(".").pop() ?? "jpg";
      const path = `${orgId}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage
        .from("email-assets")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from("email-assets").getPublicUrl(path);
      if (activeEdit?.type === "img") {
        activeEdit.el.src = publicUrl;
        onChange(readBody());
        setActiveEdit(null);
      }
    } catch (err) {
      console.error("Image upload failed:", err);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  return (
    <div className="border border-dashed border-primary/30 rounded-lg overflow-hidden bg-white group hover:border-primary/60 transition-colors">
      {/* Title bar */}
      <div className="px-3 py-1.5 border-b border-border bg-muted/20 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium text-muted-foreground">{name}</span>
          <span className="text-[9px] text-primary/60 italic hidden group-hover:inline">
            click text to edit · click image or button to replace
          </span>
        </div>
        <button type="button" onClick={onRemove}
          className="text-[10px] text-destructive hover:underline opacity-0 group-hover:opacity-100 transition-opacity">
          Remove
        </button>
      </div>

      {/* Image replace toolbar */}
      {activeEdit?.type === "img" && (
        <div className="px-3 py-2 border-b border-border bg-sky-50 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-sky-700 flex items-center gap-1">
            <Upload size={11}/> Replace Image
          </span>
          <label className={cn(
            "flex items-center gap-1 text-[11px] px-2 py-1 bg-primary text-primary-foreground rounded cursor-pointer font-medium",
            uploading && "opacity-50 pointer-events-none"
          )}>
            {uploading ? <><Loader2 size={10} className="animate-spin"/>Uploading…</> : "Upload file"}
            <input ref={fileInputRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleImageUpload(f); }} />
          </label>
          <span className="text-[10px] text-muted-foreground">or paste URL:</span>
          <input
            type="url"
            value={activeEdit.urlDraft}
            onChange={(e) => setActiveEdit({ ...activeEdit, urlDraft: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && applyImgUrl()}
            placeholder="https://example.com/image.jpg"
            className="flex-1 min-w-40 text-[11px] border border-border rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button onClick={applyImgUrl}
            className="text-[11px] px-2 py-1 bg-primary text-primary-foreground rounded font-medium">Apply</button>
          <button onClick={() => setActiveEdit(null)}
            className="text-[11px] text-muted-foreground hover:text-foreground px-1">✕</button>
        </div>
      )}

      {/* Link / button URL toolbar */}
      {activeEdit?.type === "link" && (
        <div className="px-3 py-2 border-b border-border bg-sky-50 flex flex-wrap items-center gap-2">
          <span className="text-[11px] font-semibold text-sky-700 flex items-center gap-1">
            <Link2 size={11}/> Button / Link URL
          </span>
          <input
            type="url"
            value={activeEdit.hrefDraft}
            onChange={(e) => setActiveEdit({ ...activeEdit, hrefDraft: e.target.value })}
            onKeyDown={(e) => e.key === "Enter" && applyLinkHref()}
            placeholder="https://lvbranding.com"
            className="flex-1 min-w-52 text-[11px] border border-border rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <button onClick={applyLinkHref}
            className="text-[11px] px-2 py-1 bg-primary text-primary-foreground rounded font-medium">Apply</button>
          <button onClick={() => setActiveEdit(null)}
            className="text-[11px] text-muted-foreground hover:text-foreground px-1">✕</button>
        </div>
      )}

      {/* The editable email block */}
      <iframe
        ref={iframeRef}
        scrolling="no"
        style={{ width: "100%", height, border: "none", display: "block" }}
        title={name}
      />
    </div>
  );
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

// ── Block type ────────────────────────────────────────────────────────────────
type Block = { id: string; name: string; html: string };

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

  // Block-based body state
  const [initialized,    setInitialized]    = useState(false);
  const [tiptapHtml,     setTiptapHtml]     = useState("");
  const [insertedBlocks, setInsertedBlocks] = useState<Block[]>([]);

  // The combined HTML (what preview shows and what gets saved)
  const combinedHtml = useMemo(
    () => tiptapHtml + insertedBlocks.map(b => b.html).join("\n"),
    [tiptapHtml, insertedBlocks]
  );

  // Initialize tiptapHtml from bodyHtml prop ONCE on mount
  useEffect(() => {
    if (!initialized) {
      // Strip table HTML since Tiptap can't handle it
      const textOnly = (bodyHtml || "").replace(/<table[\s\S]*?<\/table>/gi, "").trim();
      setTiptapHtml(textOnly);
      setInitialized(true);
    }
  }, [bodyHtml, initialized]);

  // Notify parent whenever combined changes
  useEffect(() => {
    if (initialized) {
      onBodyHtmlChange(combinedHtml);
    }
  }, [combinedHtml, initialized, onBodyHtmlChange]);

  const addBlock = useCallback((name: string, html: string) => {
    setInsertedBlocks(prev => [...prev, { id: crypto.randomUUID(), name, html }]);
  }, []);

  const removeBlock = useCallback((id: string) => {
    setInsertedBlocks(prev => prev.filter(b => b.id !== id));
  }, []);

  const updateBlock = useCallback((id: string, html: string) => {
    setInsertedBlocks(prev => prev.map(b => b.id === id ? { ...b, html } : b));
  }, []);

  // Assets Library
  const [assetsOpen,    setAssetsOpen]    = useState(false);
  const [assetsTab,     setAssetsTab]     = useState<"builtin" | "saved">("builtin");
  const [saveBlockName, setSaveBlockName] = useState("");
  const [savingBlock,   setSavingBlock]   = useState(false);

  const { org } = useOrg();
  const editorRef = useRef<RichEmailEditorHandle>(null);
  const { data: savedBlocks = [], isLoading: blocksLoading } = useEmailBlocks();
  const saveBlock   = useSaveEmailBlock();
  const deleteBlock = useDeleteEmailBlock();

  const insertBlock = (name: string, html: string) => addBlock(name, html);

  const handleSaveCurrentBody = async () => {
    const name = saveBlockName.trim();
    if (!name || !combinedHtml) return;
    setSavingBlock(true);
    try {
      await saveBlock.mutateAsync({ name, html: combinedHtml });
      setSaveBlockName("");
    } finally {
      setSavingBlock(false);
    }
  };

  const generate = async () => {
    if (!intent.trim()) return;
    setStreaming(true);
    setTiptapHtml(""); setInsertedBlocks([]);
    onSubjectChange(""); onPreviewTextChange("");
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
          if (bodyStart !== -1) setTiptapHtml(full.slice(bodyStart + 4).trimStart());
        },
        onComplete: (text) => {
          const lines     = text.split("\n");
          const subLine   = lines.find((l) => l.startsWith("SUBJECT:"));
          const prevLine  = lines.find((l) => l.startsWith("PREVIEW:"));
          const bodyStart = text.indexOf("---\n");
          if (subLine)    onSubjectChange(subLine.replace("SUBJECT:", "").trim());
          if (prevLine)   onPreviewTextChange(prevLine.replace("PREVIEW:", "").trim());
          if (bodyStart !== -1) setTiptapHtml(text.slice(bodyStart + 4).trimStart());
          setStreaming(false);
        },
        onError: () => setStreaming(false),
      }
    );
  };

  const copyBody = async () => {
    await navigator.clipboard.writeText(combinedHtml);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const previewDoc = useMemo(
    () => buildPreviewDoc(combinedHtml, previewDevice),
    [combinedHtml, previewDevice]
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
              : combinedHtml
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
            value={tiptapHtml}
            onChange={setTiptapHtml}
            onInsertBlock={addBlock}
            placeholder="Start writing your email — or use the AI writer above to generate it."
          />
        </div>

        {/* Inserted layout/asset blocks */}
        {insertedBlocks.length > 0 && (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Inserted Blocks</p>
            {insertedBlocks.map((block) => (
              <BlockEditor
                key={block.id}
                html={block.html}
                name={block.name}
                orgId={org?.id}
                onChange={(html) => updateBlock(block.id, html)}
                onRemove={() => removeBlock(block.id)}
              />
            ))}
          </div>
        )}

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
                          onClick={() => insertBlock(block.name, block.html)}
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
                      disabled={!saveBlockName.trim() || !combinedHtml || savingBlock}
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
                              <button type="button" onClick={() => insertBlock(block.name, block.html)}
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
      <div className="hidden xl:flex w-[480px] shrink-0 flex-col sticky top-4" style={{ height: "calc(100vh - 120px)" }}>
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
