import { useEffect, useCallback, useState } from "react";
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
  Palette, Link2Off,
} from "lucide-react";
import { cn } from "@/lib/utils";

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

export default function RichEmailEditor({ value, onChange, placeholder }: Props) {
  const [linkUrl,      setLinkUrl]      = useState("");
  const [showLinkBox,  setShowLinkBox]  = useState(false);
  const [imageUrl,     setImageUrl]     = useState("");
  const [showImageBox, setShowImageBox] = useState(false);

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

  const addImage = useCallback(() => {
    if (!editor || !imageUrl.trim()) return;
    editor.chain().focus().setImage({ src: imageUrl.trim() }).run();
    setImageUrl("");
    setShowImageBox(false);
  }, [editor, imageUrl]);

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
        <ToolbarBtn onClick={() => { setShowLinkBox((v) => !v); setShowImageBox(false); }} active={editor.isActive("link") || showLinkBox} title="Insert link">
          <Link2 size={13} />
        </ToolbarBtn>
        {editor.isActive("link") && (
          <ToolbarBtn onClick={() => editor.chain().focus().unsetLink().run()} title="Remove link">
            <Link2Off size={13} />
          </ToolbarBtn>
        )}

        {/* Image */}
        <ToolbarBtn onClick={() => { setShowImageBox((v) => !v); setShowLinkBox(false); }} active={showImageBox} title="Insert image">
          <ImageIcon size={13} />
        </ToolbarBtn>

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

      {/* Image URL input row */}
      {showImageBox && (
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border bg-muted/20">
          <ImageIcon size={12} className="text-muted-foreground shrink-0" />
          <input
            autoFocus
            value={imageUrl}
            onChange={(e) => setImageUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addImage()}
            placeholder="https://example.com/image.jpg"
            className="flex-1 text-xs bg-transparent focus:outline-none"
          />
          <button onClick={addImage} className="text-[10px] bg-primary text-primary-foreground px-2 py-0.5 rounded font-medium">Insert</button>
          <button onClick={() => setShowImageBox(false)} className="text-[10px] text-muted-foreground px-1">✕</button>
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
}
