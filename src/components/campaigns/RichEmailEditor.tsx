import { useEffect, useCallback, useState, useRef, forwardRef, useImperativeHandle } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Image from "@tiptap/extension-image";
import TextAlign from "@tiptap/extension-text-align";
import Underline from "@tiptap/extension-underline";
import Color from "@tiptap/extension-color";
import { TextStyle } from "@tiptap/extension-text-style";
import Placeholder from "@tiptap/extension-placeholder";
import {
  Bold, Italic, UnderlineIcon, Link2, Image as ImageIcon,
  List, ListOrdered, AlignLeft, AlignCenter, AlignRight,
  Heading1, Heading2, Heading3, Minus, Undo, Redo,
  Palette, Link2Off, Loader2, LayoutList, Columns2, Columns3,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";

export interface RichEmailEditorHandle {
  insertHtml: (html: string) => void;
}

interface Props {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
}

function ToolbarBtn({
  onClick,
  active,
  title,
  children,
  disabled,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onMouseDown={(e) => { e.preventDefault(); onClick(); }}
      disabled={disabled}
      title={title}
      className={cn(
        "p-1.5 rounded transition-colors disabled:opacity-40",
        active
          ? "bg-primary text-primary-foreground"
          : "hover:bg-muted text-foreground/70 hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <div className="w-px h-5 bg-border mx-0.5 shrink-0" />;
}

// Layout HTML templates (email-safe tables)
const LAYOUT_1COL = `<p>Content here...</p>`;

const LAYOUT_2COL = `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:16px 0;"><tr><td width="50%" style="padding:0 16px 0 0;vertical-align:top;"><p>Left content here...</p></td><td width="50%" style="padding:0 0 0 16px;vertical-align:top;"><p>Right content here...</p></td></tr></table>`;

const LAYOUT_3COL = `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:16px 0;"><tr><td width="33%" style="padding:0 10px 0 0;vertical-align:top;"><p>Column 1...</p></td><td width="33%" style="padding:0 10px;vertical-align:top;"><p>Column 2...</p></td><td width="34%" style="padding:0 0 0 10px;vertical-align:top;"><p>Column 3...</p></td></tr></table>`;

const LAYOUT_1_3_2_3 = `<table width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;margin:16px 0;"><tr><td width="33%" style="padding:0 16px 0 0;vertical-align:top;"><p>Sidebar content...</p></td><td width="67%" style="padding:0 0 0 16px;vertical-align:top;"><p>Main content here...</p></td></tr></table>`;

const RichEmailEditor = forwardRef<RichEmailEditorHandle, Props>(function RichEmailEditor(
  { value, onChange, placeholder },
  ref
) {
  const { org } = useOrg();
  const [linkUrl,        setLinkUrl]        = useState("");
  const [showLinkBox,    setShowLinkBox]    = useState(false);
  const [imageUploading, setImageUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      Underline,
      TextStyle,
      Color,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: { style: "color:#CB2039;text-decoration:underline;" },
      }),
      Image.configure({
        HTMLAttributes: { style: "max-width:100%;height:auto;display:block;margin:8px 0;" },
      }),
      TextAlign.configure({ types: ["heading", "paragraph"] }),
      Placeholder.configure({
        placeholder: placeholder ?? "Write your email body here…",
      }),
    ],
    content: value || "",
    onUpdate: ({ editor }) => {
      onChange(editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: "prose prose-sm max-w-none min-h-[220px] focus:outline-none px-4 py-3 text-sm leading-relaxed",
      },
    },
  });

  // Expose insertHtml via ref
  useImperativeHandle(ref, () => ({
    insertHtml: (html: string) => {
      if (!editor) return;
      editor.chain().focus().insertContent(html).run();
    },
  }), [editor]);

  // Sync external value changes (e.g. AI generation)
  useEffect(() => {
    if (!editor) return;
    const current = editor.getHTML();
    if (value !== current && value !== undefined) {
      editor.commands.setContent(value || "", { emitUpdate: false });
    }
  }, [value, editor]);

  const applyLink = useCallback(() => {
    if (!editor) return;
    const url = linkUrl.trim();
    if (!url) { editor.chain().focus().unsetLink().run(); return; }
    editor.chain().focus().setLink({ href: url.startsWith("http") ? url : `https://${url}` }).run();
    setLinkUrl("");
    setShowLinkBox(false);
  }, [editor, linkUrl]);

  const handleImageFile = useCallback(async (file: File) => {
    if (!editor || !org) return;
    setImageUploading(true);
    try {
      const ext  = file.name.split(".").pop() ?? "jpg";
      const path = `${org.id}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage
        .from("email-assets")
        .upload(path, file, { contentType: file.type, upsert: false });
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage
        .from("email-assets")
        .getPublicUrl(path);
      editor.chain().focus().setImage({ src: publicUrl }).run();
    } catch (err) {
      console.error("Image upload failed:", err);
    } finally {
      setImageUploading(false);
      // Reset file input so the same file can be re-selected
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }, [editor, org]);

  if (!editor) return null;

  return (
    <div className="border border-border rounded-xl overflow-hidden bg-background">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 border-b border-border bg-muted/40">

        {/* Undo / Redo */}
        <ToolbarBtn onClick={() => editor.chain().focus().undo().run()} title="Undo" disabled={!editor.can().undo()}>
          <Undo size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().redo().run()} title="Redo" disabled={!editor.can().redo()}>
          <Redo size={13} />
        </ToolbarBtn>

        <Divider />

        {/* Headings */}
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} active={editor.isActive("heading", { level: 1 })} title="Heading 1">
          <Heading1 size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} active={editor.isActive("heading", { level: 2 })} title="Heading 2">
          <Heading2 size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()} active={editor.isActive("heading", { level: 3 })} title="Heading 3">
          <Heading3 size={13} />
        </ToolbarBtn>

        <Divider />

        {/* Inline formatting */}
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Bold">
          <Bold size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Italic">
          <Italic size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Underline">
          <UnderlineIcon size={13} />
        </ToolbarBtn>

        <Divider />

        {/* Alignment */}
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign("left").run()} active={editor.isActive({ textAlign: "left" })} title="Align left">
          <AlignLeft size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign("center").run()} active={editor.isActive({ textAlign: "center" })} title="Align center">
          <AlignCenter size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().setTextAlign("right").run()} active={editor.isActive({ textAlign: "right" })} title="Align right">
          <AlignRight size={13} />
        </ToolbarBtn>

        <Divider />

        {/* Lists */}
        <ToolbarBtn onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Bullet list">
          <List size={13} />
        </ToolbarBtn>
        <ToolbarBtn onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Numbered list">
          <ListOrdered size={13} />
        </ToolbarBtn>

        <Divider />

        {/* Link */}
        <ToolbarBtn onClick={() => setShowLinkBox((v) => !v)} active={editor.isActive("link") || showLinkBox} title="Insert link">
          <Link2 size={13} />
        </ToolbarBtn>
        {editor.isActive("link") && (
          <ToolbarBtn onClick={() => editor.chain().focus().unsetLink().run()} title="Remove link">
            <Link2Off size={13} />
          </ToolbarBtn>
        )}

        {/* Image — triggers hidden file input */}
        <label
          title="Upload image from computer"
          className={cn(
            "p-1.5 rounded transition-colors cursor-pointer",
            imageUploading
              ? "opacity-50 pointer-events-none"
              : "hover:bg-muted text-foreground/70 hover:text-foreground"
          )}
        >
          {imageUploading
            ? <Loader2 size={13} className="animate-spin" />
            : <ImageIcon size={13} />
          }
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp,image/svg+xml"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) handleImageFile(file);
            }}
          />
        </label>

        <Divider />

        {/* Divider line */}
        <ToolbarBtn onClick={() => editor.chain().focus().setHorizontalRule().run()} title="Horizontal rule">
          <Minus size={13} />
        </ToolbarBtn>

        {/* Text color */}
        <div className="relative flex items-center">
          <label title="Text color" className="cursor-pointer p-1.5 rounded hover:bg-muted flex items-center">
            <Palette size={13} className="text-foreground/70" />
            <input
              type="color"
              className="absolute opacity-0 w-0 h-0"
              onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
            />
          </label>
        </div>

        <Divider />

        {/* Layout section */}
        <div className="flex items-center gap-0.5">
          <span className="text-[9px] uppercase tracking-widest text-muted-foreground mr-0.5 select-none">Layout</span>
          <ToolbarBtn
            onClick={() => editor.chain().focus().insertContent(LAYOUT_1COL).run()}
            title="1 column (paragraph)"
          >
            <LayoutList size={13} />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor.chain().focus().insertContent(LAYOUT_2COL).run()}
            title="2 columns equal (50/50)"
          >
            <Columns2 size={13} />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor.chain().focus().insertContent(LAYOUT_3COL).run()}
            title="3 columns equal (33/33/33)"
          >
            <Columns3 size={13} />
          </ToolbarBtn>
          <ToolbarBtn
            onClick={() => editor.chain().focus().insertContent(LAYOUT_1_3_2_3).run()}
            title="Asymmetric (1/3 + 2/3)"
          >
            <span className="flex items-center text-[9px] font-mono leading-none gap-px">
              <span className="inline-block w-2 h-3 border border-current rounded-sm" />
              <span className="inline-block w-3.5 h-3 border border-current rounded-sm" />
            </span>
          </ToolbarBtn>
        </div>
      </div>

      {/* Link input row */}
      {showLinkBox && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/20">
          <Link2 size={12} className="text-muted-foreground shrink-0" />
          <input
            autoFocus
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && applyLink()}
            placeholder="https://example.com"
            className="flex-1 text-xs bg-transparent focus:outline-none"
          />
          <button onClick={applyLink} className="text-[10px] bg-primary text-primary-foreground px-2 py-0.5 rounded font-medium">Apply</button>
          <button onClick={() => setShowLinkBox(false)} className="text-[10px] text-muted-foreground px-1">✕</button>
        </div>
      )}

      {/* Editor area */}
      <EditorContent editor={editor} />

      {/* Variable hint */}
      <div className="px-3 py-2 border-t border-border bg-muted/20 flex flex-wrap gap-1.5 items-center">
        <span className="text-[10px] text-muted-foreground">Insert:</span>
        {["{{first_name}}", "{{last_name}}", "{{company}}", "{{title}}"].map((v) => (
          <button
            key={v}
            type="button"
            onMouseDown={(e) => {
              e.preventDefault();
              editor.chain().focus().insertContent(v).run();
            }}
            className="text-[10px] px-1.5 py-0.5 bg-primary/10 text-primary border border-primary/20 rounded font-mono hover:bg-primary/20 transition-colors"
          >
            {v}
          </button>
        ))}
      </div>
    </div>
  );
});

export default RichEmailEditor;
