import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { EditorContent, useEditor, useEditorState, type Editor } from "@tiptap/react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Baseline,
  Bold,
  ChevronDown,
  Code2,
  Copy,
  Highlighter,
  Italic,
  Link2,
  List,
  ListOrdered,
  ListTodo,
  Minus,
  Quote,
  Redo2,
  RemoveFormatting,
  Strikethrough,
  Table2,
  Underline as UnderlineIcon,
  Undo2,
  Unlink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { useSaveWorkspaceDocument } from "@/hooks/useWorkspace";
import { looksLikeMarkdown, markdownToHtml } from "@/lib/workspace/document";
import { workspaceExtensions } from "@/lib/workspace/editorExtensions";
import { documentPlainText } from "@/lib/workspace/plainText";

export interface DocumentSaveState {
  /** Edits made and not yet sent. */
  dirty: boolean;
  saving: boolean;
  error: Error | null;
  words: number;
}

const SAVE_DELAY_MS = 800;
const RETRY_DELAY_MS = 5000;

const TEXT_COLORS = [
  { label: "LV red", value: "#CB2039" },
  { label: "Ink", value: "#231F20" },
  { label: "Grey", value: "#6B7280" },
  { label: "Blue", value: "#2563EB" },
  { label: "Green", value: "#15803D" },
  { label: "Amber", value: "#B45309" },
  { label: "Purple", value: "#7C3AED" },
];

const HIGHLIGHTS = [
  { label: "Yellow", value: "#FEF08A" },
  { label: "Green", value: "#BBF7D0" },
  { label: "Blue", value: "#BFDBFE" },
  { label: "Pink", value: "#FBCFE8" },
  { label: "Orange", value: "#FED7AA" },
  { label: "Grey", value: "#E5E7EB" },
];

const TEXT_SIZES = [
  { label: "Small", value: "13px" },
  { label: "Normal", value: null },
  { label: "Large", value: "18px" },
  { label: "Extra large", value: "22px" },
];

/** The document as clean plain text: what search stores and plain pastes receive. */
const plainText = (editor: Editor) => documentPlainText(editor.state.doc);
const countWords = (text: string) => (text.trim() ? text.trim().split(/\s+/).length : 0);

function withScheme(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return "";
  return /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

/**
 * A page as one continuous rich document.
 *
 * It replaces a list of separate plain-text boxes, which could not be selected
 * across, copied as a whole, or formatted at all. Everything here is one editor,
 * so a selection can run across any number of paragraphs, and copying puts both
 * formatted and plain versions on the clipboard: the plain one separates
 * paragraphs with blank lines, so it pastes cleanly even where formatting is
 * dropped.
 *
 * Mount one per page (key it by page id). Saving is debounced, sent one request
 * at a time so an older save can never land after a newer one, and flushed when
 * the page is left, so switching pages mid-sentence loses nothing.
 */
export default function WorkspaceDocumentEditor({
  pageId,
  initialHtml,
  converted,
  onStateChange,
}: {
  pageId: string;
  initialHtml: string;
  /** Content was just converted from blocks and has never been saved as a document. */
  converted: boolean;
  onStateChange?: (state: DocumentSaveState) => void;
}) {
  const saveDocument = useSaveWorkspaceDocument();
  const saveRef = useRef(saveDocument);
  saveRef.current = saveDocument;

  const pending = useRef<{ html: string; text: string } | null>(null);
  const inFlight = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  const editorRef = useRef<Editor | null>(null);
  const [state, setState] = useState<DocumentSaveState>({ dirty: false, saving: false, error: null, words: 0 });

  const report = useCallback((next: Partial<DocumentSaveState>) => {
    setState((current) => ({ ...current, ...next }));
  }, []);

  useEffect(() => {
    onStateChange?.(state);
  }, [onStateChange, state]);

  /** Sends whatever is pending, unless a save is already on its way. */
  const send = useCallback(() => {
    window.clearTimeout(timer.current);
    if (inFlight.current || !pending.current) return;
    const payload = pending.current;
    pending.current = null;
    inFlight.current = true;
    report({ saving: true });

    saveRef.current
      .mutateAsync({ pageId, ...payload })
      .then(() => report({ error: null }))
      .catch((error: unknown) => {
        // Keep the unsaved content, unless something newer has replaced it.
        pending.current ??= payload;
        report({ error: error instanceof Error ? error : new Error("Save failed") });
        timer.current = window.setTimeout(() => send(), RETRY_DELAY_MS);
      })
      .finally(() => {
        inFlight.current = false;
        if (pending.current) {
          report({ saving: false, dirty: true });
          if (!timer.current) send();
        } else {
          report({ saving: false, dirty: false });
        }
      });
  }, [pageId, report]);

  const queue = useCallback(
    (editor: Editor, immediately = false) => {
      const text = plainText(editor);
      pending.current = { html: editor.getHTML(), text };
      report({ dirty: true, words: countWords(text) });
      window.clearTimeout(timer.current);
      timer.current = undefined;
      if (immediately) send();
      else timer.current = window.setTimeout(send, SAVE_DELAY_MS);
    },
    [report, send],
  );

  const editor = useEditor({
    extensions: workspaceExtensions(),
    content: initialHtml,
    editorProps: {
      attributes: {
        class: "workspace-doc prose prose-base md:prose-sm max-w-none min-h-[45vh] py-5 focus:outline-none",
      },
      /**
       * What a plain-text paste receives, for chats, forms and plain email.
       * The editor's default spaced every table row and cell with blank lines.
       */
      clipboardTextSerializer: (slice) => documentPlainText(slice.content),
      /**
       * Text copied from an AI chat usually arrives as raw Markdown with no
       * formatted version alongside it, which is how pages filled up with
       * literal ** and ##. When that is what was pasted, it goes in formatted.
       * Anything that already carries formatting, or lands inside a code
       * block, is left to the editor's own handling.
       */
      handlePaste: (view, event) => {
        const data = event.clipboardData;
        if (!data || data.types.includes("text/html")) return false;
        const text = data.getData("text/plain");
        if (!looksLikeMarkdown(text)) return false;
        if (view.state.selection.$from.parent.type.name === "codeBlock") return false;
        event.preventDefault();
        void markdownToHtml(text).then((html) => {
          const current = editorRef.current;
          if (current && !current.isDestroyed) current.chain().focus().insertContent(html).run();
        });
        return true;
      },
    },
    onCreate: ({ editor }) => {
      report({ words: countWords(plainText(editor)) });
      // A page converted from its blocks is saved the moment it opens, so the
      // conversion happens once and the page becomes searchable by content.
      if (converted) queue(editor, true);
    },
    onUpdate: ({ editor }) => queue(editor),
  });

  // Taken from the hook on every render, never from onCreate. React creates,
  // discards and recreates the editor when it remounts (StrictMode in
  // development, a Suspense reconnect in production), and a reference captured
  // at creation can be the discarded one: a paste then went to an editor no
  // longer on the page, and vanished.
  editorRef.current = editor;

  // Leaving the page, or the app, sends what has not been saved yet.
  useEffect(() => {
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") send();
    };
    const warnIfUnsaved = (event: BeforeUnloadEvent) => {
      if (!pending.current && !inFlight.current) return;
      send();
      event.preventDefault();
    };
    document.addEventListener("visibilitychange", flushWhenHidden);
    window.addEventListener("beforeunload", warnIfUnsaved);
    return () => {
      document.removeEventListener("visibilitychange", flushWhenHidden);
      window.removeEventListener("beforeunload", warnIfUnsaved);
      send();
    };
  }, [send]);

  if (!editor) return null;

  return (
    <div>
      <Toolbar editor={editor} />
      <EditorContent editor={editor} />
    </div>
  );
}

/* ── Toolbar ───────────────────────────────────────────────────────────────── */

function ToolButton({
  label,
  shortcut,
  active,
  disabled,
  onClick,
  children,
}: {
  label: string;
  shortcut?: string;
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={label}
          aria-pressed={active}
          disabled={disabled}
          // Keep the text selection: a toolbar that steals focus formats nothing.
          onMouseDown={(event) => event.preventDefault()}
          onClick={onClick}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors md:h-8 md:w-8",
            "hover:bg-muted hover:text-foreground disabled:pointer-events-none disabled:opacity-35",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40",
            active && "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
          )}
        >
          {children}
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="text-xs">
        {label}
        {shortcut && <span className="ml-2 text-muted-foreground">{shortcut}</span>}
      </TooltipContent>
    </Tooltip>
  );
}

const Divider = () => <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-border" />;

function Swatches({
  colors,
  current,
  onPick,
  resetLabel,
}: {
  colors: { label: string; value: string }[];
  current: string | null;
  onPick: (value: string | null) => void;
  resetLabel: string;
}) {
  return (
    <div className="space-y-2">
      <div className="grid grid-cols-7 gap-1.5">
        {colors.map((color) => (
          <button
            key={color.value}
            type="button"
            aria-label={color.label}
            title={color.label}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => onPick(color.value)}
            className={cn(
              "h-6 w-6 rounded-md border border-black/10 transition-transform hover:scale-110",
              current?.toLowerCase() === color.value.toLowerCase() && "ring-2 ring-primary ring-offset-1",
            )}
            style={{ background: color.value }}
          />
        ))}
      </div>
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onPick(null)}
        className="w-full rounded-md px-2 py-1 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
      >
        {resetLabel}
      </button>
    </div>
  );
}

function Toolbar({ editor }: { editor: Editor }) {
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState("");

  // TipTap v3 does not re-render on every keystroke; this reads just what the
  // toolbar shows, and re-renders only when one of those values changes.
  const s = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive("bold"),
      italic: e.isActive("italic"),
      underline: e.isActive("underline"),
      strike: e.isActive("strike"),
      bullet: e.isActive("bulletList"),
      ordered: e.isActive("orderedList"),
      task: e.isActive("taskList"),
      quote: e.isActive("blockquote"),
      code: e.isActive("codeBlock"),
      link: e.isActive("link"),
      table: e.isActive("table"),
      h1: e.isActive("heading", { level: 1 }),
      h2: e.isActive("heading", { level: 2 }),
      h3: e.isActive("heading", { level: 3 }),
      align: e.isActive({ textAlign: "center" }) ? "center" : e.isActive({ textAlign: "right" }) ? "right" : "left",
      color: (e.getAttributes("textStyle").color as string | undefined) ?? null,
      highlight: (e.getAttributes("textStyle").backgroundColor as string | undefined) ?? null,
      size: (e.getAttributes("textStyle").fontSize as string | undefined) ?? null,
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
      href: (e.getAttributes("link").href as string | undefined) ?? "",
    }),
  });

  const chain = () => editor.chain().focus();
  const style = s.h1 ? "Heading 1" : s.h2 ? "Heading 2" : s.h3 ? "Heading 3" : "Normal text";
  const sizeLabel = TEXT_SIZES.find((size) => size.value === s.size)?.label ?? "Normal";
  const AlignIcon = s.align === "center" ? AlignCenter : s.align === "right" ? AlignRight : AlignLeft;

  const applyLink = () => {
    const href = withScheme(linkUrl);
    if (!href) {
      chain().extendMarkRange("link").unsetLink().run();
    } else if (editor.state.selection.empty && !s.link) {
      // Nothing selected: put the address in as its own linked text.
      chain().insertContent({ type: "text", text: linkUrl.trim(), marks: [{ type: "link", attrs: { href } }] }).run();
    } else {
      chain().extendMarkRange("link").setLink({ href }).run();
    }
    setLinkOpen(false);
  };

  const copyPage = async () => {
    const html = editor.getHTML();
    const text = plainText(editor);
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          "text/html": new Blob([html], { type: "text/html" }),
          "text/plain": new Blob([text], { type: "text/plain" }),
        }),
      ]);
    } catch {
      await navigator.clipboard.writeText(text);
    }
    toast({ title: "Page copied", description: "Paste it into an email, a doc or a chat with its formatting." });
  };

  return (
    // One row that swipes sideways on a phone. Wrapped, its tools took three or
    // four rows, and pinned to the top they covered a third of the screen.
    <div className="sticky top-0 z-10 -mx-1 flex items-center gap-0.5 overflow-x-auto border-b border-border bg-background/95 px-1 py-1.5 backdrop-blur [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:flex-wrap md:overflow-visible">
      <ToolButton label="Undo" shortcut="⌘Z" disabled={!s.canUndo} onClick={() => chain().undo().run()}>
        <Undo2 size={15} />
      </ToolButton>
      <ToolButton label="Redo" shortcut="⇧⌘Z" disabled={!s.canRedo} onClick={() => chain().redo().run()}>
        <Redo2 size={15} />
      </ToolButton>
      <Divider />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-9 w-[118px] shrink-0 justify-between px-2 text-xs font-normal md:h-8" onMouseDown={(event) => event.preventDefault()}>
            {style}
            <ChevronDown size={12} className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-48" onCloseAutoFocus={(event) => event.preventDefault()}>
          <DropdownMenuItem onClick={() => chain().setParagraph().run()}>Normal text</DropdownMenuItem>
          <DropdownMenuItem onClick={() => chain().setHeading({ level: 1 }).run()} className="text-lg font-semibold">Heading 1</DropdownMenuItem>
          <DropdownMenuItem onClick={() => chain().setHeading({ level: 2 }).run()} className="text-base font-semibold">Heading 2</DropdownMenuItem>
          <DropdownMenuItem onClick={() => chain().setHeading({ level: 3 }).run()} className="text-sm font-semibold">Heading 3</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="sm" className="h-9 w-[92px] shrink-0 justify-between px-2 text-xs font-normal md:h-8" onMouseDown={(event) => event.preventDefault()}>
            {sizeLabel}
            <ChevronDown size={12} className="text-muted-foreground" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-40" onCloseAutoFocus={(event) => event.preventDefault()}>
          {TEXT_SIZES.map((size) => (
            <DropdownMenuItem
              key={size.label}
              onClick={() => (size.value ? chain().setFontSize(size.value).run() : chain().unsetFontSize().run())}
              style={size.value ? { fontSize: size.value } : undefined}
            >
              {size.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      <Divider />

      <ToolButton label="Bold" shortcut="⌘B" active={s.bold} onClick={() => chain().toggleBold().run()}>
        <Bold size={15} />
      </ToolButton>
      <ToolButton label="Italic" shortcut="⌘I" active={s.italic} onClick={() => chain().toggleItalic().run()}>
        <Italic size={15} />
      </ToolButton>
      <ToolButton label="Underline" shortcut="⌘U" active={s.underline} onClick={() => chain().toggleUnderline().run()}>
        <UnderlineIcon size={15} />
      </ToolButton>
      <ToolButton label="Strikethrough" shortcut="⇧⌘X" active={s.strike} onClick={() => chain().toggleStrike().run()}>
        <Strikethrough size={15} />
      </ToolButton>

      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Text colour"
                onMouseDown={(event) => event.preventDefault()}
                className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:h-8 md:w-8"
              >
                <Baseline size={15} />
                <span className="absolute bottom-1.5 left-2 right-2 h-[3px] rounded-full" style={{ background: s.color ?? "currentColor" }} />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Text colour</TooltipContent>
        </Tooltip>
        <PopoverContent align="start" className="w-auto p-3" onOpenAutoFocus={(event) => event.preventDefault()}>
          <Swatches
            colors={TEXT_COLORS}
            current={s.color}
            resetLabel="Default colour"
            onPick={(value) => (value ? chain().setColor(value).run() : chain().unsetColor().run())}
          />
        </PopoverContent>
      </Popover>

      <Popover>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Highlight"
                onMouseDown={(event) => event.preventDefault()}
                className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:h-8 md:w-8"
              >
                <Highlighter size={15} />
                {s.highlight && <span className="absolute bottom-1.5 left-2 right-2 h-[3px] rounded-full" style={{ background: s.highlight }} />}
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Highlight</TooltipContent>
        </Tooltip>
        <PopoverContent align="start" className="w-auto p-3" onOpenAutoFocus={(event) => event.preventDefault()}>
          <Swatches
            colors={HIGHLIGHTS}
            current={s.highlight}
            resetLabel="No highlight"
            onPick={(value) => (value ? chain().setBackgroundColor(value).run() : chain().unsetBackgroundColor().run())}
          />
        </PopoverContent>
      </Popover>
      <Divider />

      <ToolButton label="Bulleted list" shortcut="⇧⌘8" active={s.bullet} onClick={() => chain().toggleBulletList().run()}>
        <List size={15} />
      </ToolButton>
      <ToolButton label="Numbered list" shortcut="⇧⌘7" active={s.ordered} onClick={() => chain().toggleOrderedList().run()}>
        <ListOrdered size={15} />
      </ToolButton>
      <ToolButton label="Checklist" shortcut="⇧⌘9" active={s.task} onClick={() => chain().toggleTaskList().run()}>
        <ListTodo size={15} />
      </ToolButton>
      <Divider />

      <ToolButton label="Quote" active={s.quote} onClick={() => chain().toggleBlockquote().run()}>
        <Quote size={15} />
      </ToolButton>
      <ToolButton label="Code block" active={s.code} onClick={() => chain().toggleCodeBlock().run()}>
        <Code2 size={15} />
      </ToolButton>
      <ToolButton label="Divider" onClick={() => chain().setHorizontalRule().run()}>
        <Minus size={15} />
      </ToolButton>

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Table"
                onMouseDown={(event) => event.preventDefault()}
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:h-8 md:w-8",
                  s.table && "bg-primary/10 text-primary",
                )}
              >
                <Table2 size={15} />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Table</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" className="w-52" onCloseAutoFocus={(event) => event.preventDefault()}>
          <DropdownMenuItem onClick={() => chain().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
            Insert table
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!s.table} onClick={() => chain().addRowAfter().run()}>Add row below</DropdownMenuItem>
          <DropdownMenuItem disabled={!s.table} onClick={() => chain().addColumnAfter().run()}>Add column right</DropdownMenuItem>
          <DropdownMenuItem disabled={!s.table} onClick={() => chain().toggleHeaderRow().run()}>Toggle header row</DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={!s.table} onClick={() => chain().deleteRow().run()}>Delete row</DropdownMenuItem>
          <DropdownMenuItem disabled={!s.table} onClick={() => chain().deleteColumn().run()}>Delete column</DropdownMenuItem>
          <DropdownMenuItem disabled={!s.table} className="text-destructive" onClick={() => chain().deleteTable().run()}>
            Delete table
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Divider />

      <Popover
        open={linkOpen}
        onOpenChange={(open) => {
          setLinkOpen(open);
          if (open) setLinkUrl(s.href);
        }}
      >
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Link"
                onMouseDown={(event) => event.preventDefault()}
                className={cn(
                  "flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:h-8 md:w-8",
                  s.link && "bg-primary/10 text-primary",
                )}
              >
                <Link2 size={15} />
              </button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Link</TooltipContent>
        </Tooltip>
        <PopoverContent align="start" className="w-80 p-3">
          <form
            className="flex gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              applyLink();
            }}
          >
            <Input
              id="workspace-link-url"
              autoFocus
              value={linkUrl}
              onChange={(event) => setLinkUrl(event.target.value)}
              placeholder="Paste or type a link"
              className="h-9 text-base md:h-8 md:text-sm"
            />
            <Button type="submit" size="sm" className="h-9 md:h-8">Apply</Button>
          </form>
          {s.link && (
            <button
              type="button"
              onClick={() => {
                chain().extendMarkRange("link").unsetLink().run();
                setLinkOpen(false);
              }}
              className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive"
            >
              <Unlink size={12} />
              Remove link
            </button>
          )}
        </PopoverContent>
      </Popover>

      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                aria-label="Alignment"
                onMouseDown={(event) => event.preventDefault()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground md:h-8 md:w-8"
              >
                <AlignIcon size={15} />
              </button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="text-xs">Alignment</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="start" onCloseAutoFocus={(event) => event.preventDefault()}>
          <DropdownMenuItem onClick={() => chain().setTextAlign("left").run()}><AlignLeft size={14} /> Left</DropdownMenuItem>
          <DropdownMenuItem onClick={() => chain().setTextAlign("center").run()}><AlignCenter size={14} /> Center</DropdownMenuItem>
          <DropdownMenuItem onClick={() => chain().setTextAlign("right").run()}><AlignRight size={14} /> Right</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <ToolButton label="Clear formatting" onClick={() => chain().unsetAllMarks().clearNodes().run()}>
        <RemoveFormatting size={15} />
      </ToolButton>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={copyPage}
        className="ml-auto h-9 shrink-0 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground md:h-8"
      >
        <Copy size={13} />
        Copy page
      </Button>
    </div>
  );
}
