import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  GripVertical,
  Heading1,
  Heading2,
  List,
  Loader2,
  MoreHorizontal,
  Plus,
  Quote,
  Search,
  Trash2,
  Type,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { Json, WorkspaceBlock, WorkspacePage } from "@/integrations/supabase/types";
import {
  blockText,
  getBlockContent,
  useCreateWorkspaceBlock,
  useCreateWorkspacePage,
  useDeleteWorkspaceBlock,
  useDeleteWorkspacePage,
  useReorderWorkspaceBlocks,
  useUpdateWorkspaceBlock,
  useUpdateWorkspacePage,
  useWorkspaceBlockSearch,
  useWorkspaceBlocks,
  useWorkspacePages,
  type WorkspaceBlockContent,
  type WorkspaceBlockType,
} from "@/hooks/useWorkspace";

type PageNode = WorkspacePage & { children: PageNode[] };

const BLOCK_TYPES: Array<{
  type: WorkspaceBlockType;
  label: string;
  icon: typeof Type;
}> = [
  { type: "paragraph", label: "Text", icon: Type },
  { type: "heading", label: "Heading", icon: Heading1 },
  { type: "subheading", label: "Subheading", icon: Heading2 },
  { type: "bullet", label: "Bullet", icon: List },
  { type: "todo", label: "To-do", icon: Check },
  { type: "quote", label: "Quote", icon: Quote },
];

function buildPageTree(pages: WorkspacePage[]) {
  const nodes = new Map<string, PageNode>();
  const roots: PageNode[] = [];

  pages.forEach((page) => nodes.set(page.id, { ...page, children: [] }));
  nodes.forEach((node) => {
    const parent = node.parent_id ? nodes.get(node.parent_id) : null;
    if (parent) parent.children.push(node);
    else roots.push(node);
  });

  const sortNodes = (items: PageNode[]) => {
    items.sort((a, b) => a.position - b.position || a.title.localeCompare(b.title));
    items.forEach((item) => sortNodes(item.children));
  };

  sortNodes(roots);
  return roots;
}

function descendantsOf(pages: WorkspacePage[], pageId: string) {
  const childrenByParent = pages.reduce<Record<string, WorkspacePage[]>>((acc, page) => {
    if (page.parent_id) acc[page.parent_id] = [...(acc[page.parent_id] ?? []), page];
    return acc;
  }, {});
  const ids = new Set<string>();
  const visit = (id: string) => {
    (childrenByParent[id] ?? []).forEach((child) => {
      ids.add(child.id);
      visit(child.id);
    });
  };
  visit(pageId);
  return ids;
}

function plainContent(content: Json) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return "";
  const text = (content as WorkspaceBlockContent).text;
  return typeof text === "string" ? text : "";
}

export default function Workspace() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [dragOverBlockId, setDragOverBlockId] = useState<string | null>(null);

  const { data: pages = [], isLoading: pagesLoading } = useWorkspacePages();
  const { data: searchBlocks = [] } = useWorkspaceBlockSearch(search);
  const createPage = useCreateWorkspacePage();
  const updatePage = useUpdateWorkspacePage();
  const deletePage = useDeleteWorkspacePage();

  const pageTree = useMemo(() => buildPageTree(pages), [pages]);
  const selectedPageId = searchParams.get("page");
  const selectedPage = pages.find((page) => page.id === selectedPageId) ?? pages[0] ?? null;

  const { data: blocks = [], isLoading: blocksLoading } = useWorkspaceBlocks(selectedPage?.id ?? null);
  const createBlock = useCreateWorkspaceBlock(selectedPage?.id ?? null);
  const updateBlock = useUpdateWorkspaceBlock();
  const deleteBlock = useDeleteWorkspaceBlock();
  const reorderBlocks = useReorderWorkspaceBlocks(selectedPage?.id ?? null);

  const orderedBlocks = useMemo(
    () => [...blocks].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at)),
    [blocks]
  );

  const searchPageIds = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (q.length < 2) return new Set<string>();
    const ids = new Set<string>();
    pages.forEach((page) => {
      if (page.title.toLowerCase().includes(q)) ids.add(page.id);
    });
    searchBlocks.forEach((block) => ids.add(block.page_id));
    return ids;
  }, [pages, search, searchBlocks]);

  const searchResults = useMemo(
    () => pages.filter((page) => searchPageIds.has(page.id)),
    [pages, searchPageIds]
  );

  useEffect(() => {
    if (!selectedPageId && pages[0]) {
      setSearchParams({ page: pages[0].id }, { replace: true });
    }
  }, [pages, selectedPageId, setSearchParams]);

  useEffect(() => {
    if (selectedPage?.parent_id) {
      setExpanded((current) => new Set(current).add(selectedPage.parent_id as string));
    }
  }, [selectedPage?.parent_id]);

  const selectPage = (pageId: string) => setSearchParams({ page: pageId });

  const handleCreatePage = async (parentId?: string | null) => {
    const page = await createPage.mutateAsync({ title: parentId ? "New subpage" : "Untitled", parent_id: parentId ?? null });
    if (parentId) setExpanded((current) => new Set(current).add(parentId));
    selectPage(page.id);
  };

  const handleDeletePage = async (page: WorkspacePage) => {
    if (!window.confirm(`Delete "${page.title}" and its subpages?`)) return;
    await deletePage.mutateAsync(page);
    const descendantIds = descendantsOf(pages, page.id);
    if (selectedPage?.id === page.id || (selectedPage?.id && descendantIds.has(selectedPage.id))) {
      const fallback = pages.find((item) => item.id !== page.id && !descendantIds.has(item.id));
      if (fallback) selectPage(fallback.id);
    }
  };

  const handleAddBlock = async (afterBlockId?: string | null) => {
    const block = await createBlock.mutateAsync({ afterBlockId, type: "paragraph", content: { text: "" } });
    setFocusedBlockId(block.id);
  };

  const handleDropBlock = (targetBlockId: string) => {
    if (!draggedBlockId || draggedBlockId === targetBlockId) return;
    const moving = orderedBlocks.find((block) => block.id === draggedBlockId);
    if (!moving) return;
    const withoutMoving = orderedBlocks.filter((block) => block.id !== draggedBlockId);
    const targetIndex = withoutMoving.findIndex((block) => block.id === targetBlockId);
    const next = [...withoutMoving];
    next.splice(Math.max(targetIndex, 0), 0, moving);
    reorderBlocks.mutate(next);
    setDraggedBlockId(null);
    setDragOverBlockId(null);
  };

  return (
    <AppShell>
      <Header
        title="Workspace"
        subtitle="Pages, notes, drafts, and operating docs"
        actions={
          <Button size="sm" onClick={() => handleCreatePage(null)} disabled={createPage.isPending}>
            {createPage.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            New Page
          </Button>
        }
      />

      <div className="flex h-[calc(100vh-73px)] flex-col border-t border-border bg-background md:flex-row">
        <aside className="flex max-h-64 w-full shrink-0 flex-col border-b border-border bg-muted/20 md:max-h-none md:w-72 md:border-b-0 md:border-r">
          <div className="p-3 border-b border-border">
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search workspace"
                className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring/20"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {pagesLoading ? (
              <div className="space-y-2 p-2">
                {[1, 2, 3].map((item) => <Skeleton key={item} className="h-8 w-full" />)}
              </div>
            ) : pages.length === 0 ? (
              <button
                onClick={() => handleCreatePage(null)}
                className="w-full rounded-md border border-dashed border-border px-3 py-8 text-center text-sm text-muted-foreground hover:border-primary hover:text-primary"
              >
                Create your first workspace page
              </button>
            ) : search.trim().length >= 2 ? (
              <div className="space-y-1">
                {searchResults.length === 0 ? (
                  <p className="px-2 py-8 text-center text-xs text-muted-foreground">No pages found.</p>
                ) : (
                  searchResults.map((page) => (
                    <SearchResultRow
                      key={page.id}
                      page={page}
                      blocks={searchBlocks.filter((block) => block.page_id === page.id)}
                      selected={selectedPage?.id === page.id}
                      onSelect={() => selectPage(page.id)}
                    />
                  ))
                )}
              </div>
            ) : (
              <PageTree
                nodes={pageTree}
                selectedPageId={selectedPage?.id ?? null}
                expanded={expanded}
                onToggle={(pageId) =>
                  setExpanded((current) => {
                    const next = new Set(current);
                    if (next.has(pageId)) next.delete(pageId);
                    else next.add(pageId);
                    return next;
                  })
                }
                onSelect={selectPage}
                onCreatePage={handleCreatePage}
                onDeletePage={handleDeletePage}
              />
            )}
          </div>
        </aside>

        <main className="min-h-0 flex-1 overflow-y-auto">
          {!selectedPage ? (
            <div className="mx-auto flex min-h-full max-w-2xl flex-col items-center justify-center px-6 text-center">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <BookOpen size={22} />
              </div>
              <h2 className="text-xl font-semibold">Build your team knowledge base</h2>
              <p className="mt-2 text-sm text-muted-foreground">
                Start with a page for SOPs, campaign notes, client playbooks, or branch operating docs.
              </p>
              <Button className="mt-5" onClick={() => handleCreatePage(null)}>
                <Plus size={14} />
                Create First Page
              </Button>
            </div>
          ) : (
            <DocumentEditor
              page={selectedPage}
              pages={pages}
              blocks={orderedBlocks}
              blocksLoading={blocksLoading}
              focusedBlockId={focusedBlockId}
              draggedBlockId={draggedBlockId}
              dragOverBlockId={dragOverBlockId}
              onTitleChange={(title) => updatePage.mutate({ id: selectedPage.id, title })}
              onCreateSubpage={() => handleCreatePage(selectedPage.id)}
              onAddBlock={handleAddBlock}
              onUpdateBlock={(blockId, updates) => updateBlock.mutate({ id: blockId, ...updates })}
              onDeleteBlock={(block) => deleteBlock.mutate(block)}
              onDragStart={setDraggedBlockId}
              onDragEnter={setDragOverBlockId}
              onDropBlock={handleDropBlock}
              onDragEnd={() => {
                setDraggedBlockId(null);
                setDragOverBlockId(null);
              }}
              onFocusSettled={() => setFocusedBlockId(null)}
            />
          )}
        </main>
      </div>
    </AppShell>
  );
}

function PageTree({
  nodes,
  selectedPageId,
  expanded,
  onToggle,
  onSelect,
  onCreatePage,
  onDeletePage,
  depth = 0,
}: {
  nodes: PageNode[];
  selectedPageId: string | null;
  expanded: Set<string>;
  onToggle: (pageId: string) => void;
  onSelect: (pageId: string) => void;
  onCreatePage: (parentId?: string | null) => void;
  onDeletePage: (page: WorkspacePage) => void;
  depth?: number;
}) {
  return (
    <div className="space-y-0.5">
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0;
        const isOpen = expanded.has(node.id);

        return (
          <div key={node.id}>
            <div
              className={cn(
                "group flex h-8 items-center gap-1 rounded-md px-1.5 text-sm text-muted-foreground hover:bg-muted hover:text-foreground",
                selectedPageId === node.id && "bg-background text-foreground shadow-sm"
              )}
              style={{ paddingLeft: 6 + depth * 14 }}
            >
              <button
                className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-background"
                onClick={(event) => {
                  event.stopPropagation();
                  if (hasChildren) onToggle(node.id);
                }}
              >
                {hasChildren ? (isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />) : <span className="w-3" />}
              </button>
              <button onClick={() => onSelect(node.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <FileText size={13} className="shrink-0" />
                <span className="truncate">{node.title || "Untitled"}</span>
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="hidden h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-background group-hover:flex">
                    <MoreHorizontal size={13} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => onCreatePage(node.id)}>
                    <Plus size={13} />
                    Add subpage
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="text-destructive" onClick={() => onDeletePage(node)}>
                    <Trash2 size={13} />
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
            {hasChildren && isOpen && (
              <PageTree
                nodes={node.children}
                selectedPageId={selectedPageId}
                expanded={expanded}
                onToggle={onToggle}
                onSelect={onSelect}
                onCreatePage={onCreatePage}
                onDeletePage={onDeletePage}
                depth={depth + 1}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function SearchResultRow({
  page,
  blocks,
  selected,
  onSelect,
}: {
  page: WorkspacePage;
  blocks: WorkspaceBlock[];
  selected: boolean;
  onSelect: () => void;
}) {
  const excerpt = blocks.map((block) => plainContent(block.content)).find(Boolean);

  return (
    <button
      onClick={onSelect}
      className={cn(
        "w-full rounded-md px-2 py-2 text-left hover:bg-muted",
        selected && "bg-background shadow-sm"
      )}
    >
      <span className="flex items-center gap-2 text-sm font-medium">
        <FileText size={13} />
        <span className="truncate">{page.title}</span>
      </span>
      {excerpt && <span className="mt-1 block truncate pl-5 text-xs text-muted-foreground">{excerpt}</span>}
    </button>
  );
}

function DocumentEditor({
  page,
  pages,
  blocks,
  blocksLoading,
  focusedBlockId,
  draggedBlockId,
  dragOverBlockId,
  onTitleChange,
  onCreateSubpage,
  onAddBlock,
  onUpdateBlock,
  onDeleteBlock,
  onDragStart,
  onDragEnter,
  onDropBlock,
  onDragEnd,
  onFocusSettled,
}: {
  page: WorkspacePage;
  pages: WorkspacePage[];
  blocks: WorkspaceBlock[];
  blocksLoading: boolean;
  focusedBlockId: string | null;
  draggedBlockId: string | null;
  dragOverBlockId: string | null;
  onTitleChange: (title: string) => void;
  onCreateSubpage: () => void;
  onAddBlock: (afterBlockId?: string | null) => void;
  onUpdateBlock: (blockId: string, updates: Partial<WorkspaceBlock>) => void;
  onDeleteBlock: (block: WorkspaceBlock) => void;
  onDragStart: (blockId: string) => void;
  onDragEnter: (blockId: string) => void;
  onDropBlock: (blockId: string) => void;
  onDragEnd: () => void;
  onFocusSettled: () => void;
}) {
  const [title, setTitle] = useState(page.title);
  const childPages = pages.filter((item) => item.parent_id === page.id).sort((a, b) => a.position - b.position);

  useEffect(() => {
    setTitle(page.title);
  }, [page.id, page.title]);

  useEffect(() => {
    if (title.trim() === page.title) return;
    const timer = window.setTimeout(() => onTitleChange(title.trim() || "Untitled"), 600);
    return () => window.clearTimeout(timer);
  }, [onTitleChange, page.title, title]);

  return (
    <div className="mx-auto min-h-full max-w-4xl px-4 py-6 sm:px-8 lg:px-12">
      <div className="mb-6 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1">
          <BookOpen size={13} />
          Workspace
        </span>
        {page.parent_id && <span>/ Nested page</span>}
      </div>

      <input
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onBlur={() => onTitleChange(title.trim() || "Untitled")}
        className="mb-3 w-full border-none bg-transparent text-4xl font-bold tracking-normal outline-none placeholder:text-muted-foreground/40"
        placeholder="Untitled"
      />

      <div className="mb-8 flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={onCreateSubpage}>
          <Plus size={13} />
          Subpage
        </Button>
        <Button size="sm" variant="ghost" onClick={() => onAddBlock(blocks[blocks.length - 1]?.id ?? null)}>
          <Plus size={13} />
          Block
        </Button>
        <span className="text-xs text-muted-foreground">
          Autosaves as you write
        </span>
      </div>

      {childPages.length > 0 && (
        <div className="mb-8 grid gap-2 sm:grid-cols-2">
          {childPages.map((child) => (
            <div key={child.id} className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
              <FileText size={14} className="text-muted-foreground" />
              <span className="truncate">{child.title}</span>
            </div>
          ))}
        </div>
      )}

      {blocksLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((item) => <Skeleton key={item} className="h-10 w-full" />)}
        </div>
      ) : (
        <div className="space-y-1 pb-24">
          {blocks.map((block) => (
            <BlockRow
              key={block.id}
              block={block}
              blocksCount={blocks.length}
              shouldFocus={focusedBlockId === block.id}
              dragging={draggedBlockId === block.id}
              dragOver={dragOverBlockId === block.id && draggedBlockId !== block.id}
              onFocusSettled={onFocusSettled}
              onAddAfter={() => onAddBlock(block.id)}
              onUpdate={(updates) => onUpdateBlock(block.id, updates)}
              onDelete={() => onDeleteBlock(block)}
              onDragStart={() => onDragStart(block.id)}
              onDragEnter={() => onDragEnter(block.id)}
              onDrop={() => onDropBlock(block.id)}
              onDragEnd={onDragEnd}
            />
          ))}

          <button
            onClick={() => onAddBlock(blocks[blocks.length - 1]?.id ?? null)}
            className="mt-3 flex h-9 w-full items-center gap-2 rounded-md px-9 text-left text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Plus size={14} />
            Add a block
          </button>
        </div>
      )}
    </div>
  );
}

function BlockRow({
  block,
  blocksCount,
  shouldFocus,
  dragging,
  dragOver,
  onFocusSettled,
  onAddAfter,
  onUpdate,
  onDelete,
  onDragStart,
  onDragEnter,
  onDrop,
  onDragEnd,
}: {
  block: WorkspaceBlock;
  blocksCount: number;
  shouldFocus: boolean;
  dragging: boolean;
  dragOver: boolean;
  onFocusSettled: () => void;
  onAddAfter: () => void;
  onUpdate: (updates: Partial<WorkspaceBlock>) => void;
  onDelete: () => void;
  onDragStart: () => void;
  onDragEnter: () => void;
  onDrop: () => void;
  onDragEnd: () => void;
}) {
  const content = getBlockContent(block);
  const [text, setText] = useState(content.text ?? "");
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setText(blockText(block));
  }, [block.id, block.content]);

  useEffect(() => {
    if (!shouldFocus) return;
    textareaRef.current?.focus();
    onFocusSettled();
  }, [onFocusSettled, shouldFocus]);

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = "0px";
    textarea.style.height = `${textarea.scrollHeight}px`;
  }, [text, block.type]);

  useEffect(() => {
    if (text === blockText(block)) return;
    const timer = window.setTimeout(() => {
      onUpdate({ content: { ...content, text } as Json });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [block, content, onUpdate, text]);

  const TypeIcon = BLOCK_TYPES.find((item) => item.type === block.type)?.icon ?? Type;
  const isDivider = block.type === "divider";

  const updateType = (type: WorkspaceBlockType) => {
    onUpdate({ type, content: { ...content, text } as Json });
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onAddAfter();
    }
    if (event.key === "Backspace" && text.length === 0 && blocksCount > 1) {
      event.preventDefault();
      onDelete();
    }
  };

  return (
    <div
      className={cn(
        "group relative flex gap-1 rounded-md px-1 py-0.5 transition-colors",
        dragOver && "bg-primary/5 ring-1 ring-primary/20",
        dragging && "opacity-40"
      )}
      draggable
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = "move";
        onDragStart();
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        onDragEnter();
      }}
      onDragOver={(event) => event.preventDefault()}
      onDrop={(event) => {
        event.preventDefault();
        onDrop();
      }}
      onDragEnd={onDragEnd}
    >
      <div className="mt-1.5 flex w-8 shrink-0 items-start justify-end gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="flex h-6 w-4 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
              <Plus size={13} />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {BLOCK_TYPES.map((item) => (
              <DropdownMenuItem key={item.type} onClick={() => updateType(item.type)}>
                <item.icon size={13} />
                {item.label}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => updateType("divider")}>
              <span className="h-px w-3 bg-current" />
              Divider
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={onAddAfter}>
              <Plus size={13} />
              Add below
            </DropdownMenuItem>
            {blocksCount > 1 && (
              <DropdownMenuItem className="text-destructive" onClick={onDelete}>
                <Trash2 size={13} />
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
        <button className="flex h-6 w-4 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground">
          <GripVertical size={14} />
        </button>
      </div>

      <div className="min-w-0 flex-1">
        {isDivider ? (
          <button
            onClick={() => updateType("paragraph")}
            className="my-3 h-px w-full bg-border transition-colors hover:bg-primary/40"
            title="Convert divider to text"
          />
        ) : (
          <div className="flex items-start gap-2">
            {block.type === "bullet" && <span className="mt-2.5 h-1.5 w-1.5 rounded-full bg-foreground/70" />}
            {block.type === "todo" && (
              <button
                onClick={() => onUpdate({ content: { ...content, checked: !content.checked, text } as Json })}
                className={cn(
                  "mt-1.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border",
                  content.checked ? "border-primary bg-primary text-primary-foreground" : "border-input"
                )}
              >
                {content.checked && <Check size={11} />}
              </button>
            )}
            {block.type === "quote" && <span className="mt-1 h-7 w-0.5 rounded-full bg-primary/60" />}
            <textarea
              ref={textareaRef}
              value={text}
              onChange={(event) => setText(event.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={block.type === "heading" ? "Heading" : "Type '/' for commands or start writing"}
              className={cn(
                "min-h-8 w-full resize-none overflow-hidden border-0 bg-transparent px-0 py-1 text-sm leading-6 outline-none placeholder:text-muted-foreground/45 focus:ring-0",
                block.type === "heading" && "text-2xl font-semibold leading-8",
                block.type === "subheading" && "text-lg font-semibold leading-7",
                block.type === "quote" && "text-muted-foreground",
                block.type === "todo" && content.checked && "text-muted-foreground line-through"
              )}
              rows={1}
            />
          </div>
        )}
      </div>

      <div className="mt-2 hidden w-6 justify-center text-muted-foreground/40 group-hover:flex">
        <TypeIcon size={13} />
      </div>
    </div>
  );
}
