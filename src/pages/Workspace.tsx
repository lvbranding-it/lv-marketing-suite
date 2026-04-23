import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  FileText,
  FolderTree,
  GripVertical,
  Heading1,
  Heading2,
  Info,
  List,
  Loader2,
  MoreHorizontal,
  MoveRight,
  Plus,
  Quote,
  Search,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import AppShell from "@/components/layout/AppShell";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "@/hooks/use-toast";
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

const BLOCK_COMMANDS: Array<{
  type: WorkspaceBlockType;
  label: string;
  description: string;
  icon: typeof Type;
}> = [
  { type: "paragraph", label: "Text", description: "Start with plain writing", icon: Type },
  { type: "heading", label: "Heading", description: "Large section title", icon: Heading1 },
  { type: "subheading", label: "Subheading", description: "Smaller section title", icon: Heading2 },
  { type: "bullet", label: "Bullet list", description: "Capture points quickly", icon: List },
  { type: "todo", label: "To-do", description: "Track an action item", icon: Check },
  { type: "quote", label: "Quote", description: "Call out context or notes", icon: Quote },
  { type: "divider", label: "Divider", description: "Separate sections", icon: Type },
];

const PAGE_TEMPLATES: Array<{
  id: string;
  label: string;
  description: string;
  title: string;
  metadata: Json;
  blocks: Array<{ type: WorkspaceBlockType; content: WorkspaceBlockContent }>;
}> = [
  {
    id: "campaign",
    label: "Campaign Plan",
    description: "Goals, audience, channels, timeline",
    title: "Campaign plan",
    metadata: { category: "campaign" },
    blocks: [
      { type: "heading", content: { text: "Campaign overview" } },
      { type: "paragraph", content: { text: "Objective, target audience, core offer, and launch window." } },
      { type: "subheading", content: { text: "Channel plan" } },
      { type: "bullet", content: { text: "Email, social, paid, website, and partner touchpoints." } },
      { type: "subheading", content: { text: "Launch checklist" } },
      { type: "todo", content: { text: "Confirm final assets and owner", checked: false } },
    ],
  },
  {
    id: "brief",
    label: "Client Brief",
    description: "Scope, audience, approvals, constraints",
    title: "Client brief",
    metadata: { category: "client-brief" },
    blocks: [
      { type: "heading", content: { text: "Client context" } },
      { type: "paragraph", content: { text: "Business background, stakeholders, and current priorities." } },
      { type: "subheading", content: { text: "Deliverables" } },
      { type: "bullet", content: { text: "List what the team needs to create and by when." } },
      { type: "subheading", content: { text: "Approvals" } },
      { type: "todo", content: { text: "Confirm reviewer, due date, and decision criteria", checked: false } },
    ],
  },
  {
    id: "sop",
    label: "SOP",
    description: "Repeatable process and quality bar",
    title: "Standard operating procedure",
    metadata: { category: "sop" },
    blocks: [
      { type: "heading", content: { text: "Purpose" } },
      { type: "paragraph", content: { text: "What this process is for and when the team should use it." } },
      { type: "subheading", content: { text: "Steps" } },
      { type: "todo", content: { text: "Step one", checked: false } },
      { type: "todo", content: { text: "Step two", checked: false } },
      { type: "quote", content: { text: "Definition of done: add the quality bar here." } },
    ],
  },
  {
    id: "meeting",
    label: "Meeting Notes",
    description: "Decisions, action items, follow-up",
    title: "Meeting summary",
    metadata: { category: "meeting" },
    blocks: [
      { type: "heading", content: { text: "Summary" } },
      { type: "paragraph", content: { text: "Key decisions, context, and open questions." } },
      { type: "subheading", content: { text: "Action items" } },
      { type: "todo", content: { text: "Add owner and due date", checked: false } },
    ],
  },
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

function ancestorsOf(pages: WorkspacePage[], page: WorkspacePage | null) {
  if (!page) return [];
  const byId = new Map(pages.map((item) => [item.id, item]));
  const ancestors: WorkspacePage[] = [];
  let parent = page.parent_id ? byId.get(page.parent_id) : null;
  while (parent) {
    ancestors.unshift(parent);
    parent = parent.parent_id ? byId.get(parent.parent_id) : null;
  }
  return ancestors;
}

function plainContent(content: Json) {
  if (!content || typeof content !== "object" || Array.isArray(content)) return "";
  const text = (content as WorkspaceBlockContent).text;
  return typeof text === "string" ? text : "";
}

function useDebouncedValue<T>(value: T, delay = 250) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [delay, value]);

  return debounced;
}

function relativeTime(date: string | null | undefined) {
  if (!date) return "No updates yet";
  return `${formatDistanceToNow(new Date(date), { addSuffix: true })}`;
}

export default function Workspace() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [focusedBlockId, setFocusedBlockId] = useState<string | null>(null);
  const [draggedBlockId, setDraggedBlockId] = useState<string | null>(null);
  const [dragOverBlockId, setDragOverBlockId] = useState<string | null>(null);
  const [pageToDelete, setPageToDelete] = useState<WorkspacePage | null>(null);
  const debouncedSearch = useDebouncedValue(search.trim(), 250);

  const { data: pages = [], isLoading: pagesLoading } = useWorkspacePages();
  const { data: searchBlocks = [], isFetching: searchLoading } = useWorkspaceBlockSearch(debouncedSearch);
  const createPage = useCreateWorkspacePage();
  const updatePage = useUpdateWorkspacePage();
  const deletePage = useDeleteWorkspacePage();

  const pageTree = useMemo(() => buildPageTree(pages), [pages]);
  const selectedPageId = searchParams.get("page");
  const selectedPage = pages.find((page) => page.id === selectedPageId) ?? pages[0] ?? null;
  const selectedAncestors = useMemo(() => ancestorsOf(pages, selectedPage), [pages, selectedPage]);

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
    const q = debouncedSearch.toLowerCase();
    if (q.length < 2) return new Set<string>();
    const ids = new Set<string>();
    pages.forEach((page) => {
      if (page.title.toLowerCase().includes(q)) ids.add(page.id);
    });
    searchBlocks.forEach((block) => ids.add(block.page_id));
    return ids;
  }, [debouncedSearch, pages, searchBlocks]);

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
    try {
      const page = await createPage.mutateAsync({
        title: parentId ? "New subpage" : "Untitled",
        parent_id: parentId ?? null,
      });
      if (parentId) setExpanded((current) => new Set(current).add(parentId));
      selectPage(page.id);
    } catch (error) {
      toast({
        title: "Page was not created",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleCreateFromTemplate = async (templateId: string, parentId?: string | null) => {
    const template = PAGE_TEMPLATES.find((item) => item.id === templateId);
    if (!template) return;
    try {
      const page = await createPage.mutateAsync({
        title: template.title,
        parent_id: parentId ?? null,
        metadata: template.metadata,
        blocks: template.blocks,
      });
      if (parentId) setExpanded((current) => new Set(current).add(parentId));
      selectPage(page.id);
    } catch (error) {
      toast({
        title: "Template was not created",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleDeletePage = async (page: WorkspacePage) => {
    try {
      await deletePage.mutateAsync(page);
      const descendantIds = descendantsOf(pages, page.id);
      if (selectedPage?.id === page.id || (selectedPage?.id && descendantIds.has(selectedPage.id))) {
        const fallback = pages.find((item) => item.id !== page.id && !descendantIds.has(item.id));
        if (fallback) selectPage(fallback.id);
      }
      setPageToDelete(null);
    } catch (error) {
      toast({
        title: "Page was not deleted",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    }
  };

  const handleMovePage = async (page: WorkspacePage, parentId: string | null) => {
    if ((page.parent_id ?? null) === parentId) return;
    const blocked = descendantsOf(pages, page.id);
    if (parentId && blocked.has(parentId)) {
      toast({
        title: "That move is not allowed",
        description: "A page cannot be moved inside one of its own subpages.",
        variant: "destructive",
      });
      return;
    }
    const siblingPositions = pages
      .filter((item) => item.id !== page.id && (item.parent_id ?? null) === parentId)
      .map((item) => item.position);
    const position = siblingPositions.length ? Math.max(...siblingPositions) + 1000 : 0;

    try {
      await updatePage.mutateAsync({ id: page.id, parent_id: parentId, position });
      if (parentId) setExpanded((current) => new Set(current).add(parentId));
    } catch (error) {
      toast({
        title: "Page was not moved",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
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
          <NewPageMenu
            isPending={createPage.isPending}
            onBlank={() => handleCreatePage(null)}
            onTemplate={(templateId) => handleCreateFromTemplate(templateId, null)}
          />
        }
      />

      <div className="flex h-[calc(100vh-73px)] flex-col border-t border-border bg-background md:flex-row">
        <aside className="flex max-h-72 w-full shrink-0 flex-col border-b border-border bg-muted/20 md:max-h-none md:w-80 md:border-b-0 md:border-r">
          <div className="space-y-3 border-b border-border p-3">
            <div className="flex items-center justify-between gap-2">
              <div>
                <p className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">Workspace</p>
                <p className="text-sm font-semibold text-foreground">{pages.length} page{pages.length === 1 ? "" : "s"}</p>
              </div>
              <NewPageMenu
                compact
                isPending={createPage.isPending}
                onBlank={() => handleCreatePage(null)}
                onTemplate={(templateId) => handleCreateFromTemplate(templateId, null)}
              />
            </div>
            <div className="relative">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search workspace"
                className="h-9 w-full rounded-md border border-input bg-background pl-8 pr-8 text-sm outline-none transition-shadow focus:ring-2 focus:ring-ring/20"
              />
              {search ? (
                <button
                  aria-label="Clear search"
                  onClick={() => setSearch("")}
                  className="absolute right-2 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                >
                  <X size={13} />
                </button>
              ) : null}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {pagesLoading ? (
              <div className="space-y-2 p-2">
                {[1, 2, 3].map((item) => <Skeleton key={item} className="h-8 w-full" />)}
              </div>
            ) : pages.length === 0 ? (
              <WorkspaceEmptySidebar
                onBlank={() => handleCreatePage(null)}
                onTemplate={(templateId) => handleCreateFromTemplate(templateId, null)}
              />
            ) : debouncedSearch.length >= 2 ? (
              <div className="space-y-1">
                {searchLoading ? (
                  <div className="space-y-2 p-2">
                    {[1, 2, 3].map((item) => <Skeleton key={item} className="h-10 w-full" />)}
                  </div>
                ) : searchResults.length === 0 ? (
                  <div className="px-3 py-10 text-center">
                    <Search size={18} className="mx-auto mb-2 text-muted-foreground/70" />
                    <p className="text-sm font-medium">No matching pages</p>
                    <p className="mt-1 text-xs text-muted-foreground">Try a campaign name, client, SOP, or deliverable.</p>
                  </div>
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
                onMovePage={handleMovePage}
                onDeletePage={setPageToDelete}
                allPages={pages}
              />
            )}
          </div>
          {pages.length > 0 && (
            <div className="border-t border-border p-3 text-xs text-muted-foreground">
              Use pages for plans, briefs, SOPs, meeting summaries, and reusable team context.
            </div>
          )}
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
              ancestors={selectedAncestors}
              blocks={orderedBlocks}
              blocksLoading={blocksLoading}
              saving={updatePage.isPending || updateBlock.isPending || reorderBlocks.isPending}
              saveError={updatePage.error || updateBlock.error || reorderBlocks.error}
              focusedBlockId={focusedBlockId}
              draggedBlockId={draggedBlockId}
              dragOverBlockId={dragOverBlockId}
              onTitleChange={(title) => updatePage.mutate({ id: selectedPage.id, title })}
              onCreateSubpage={() => handleCreatePage(selectedPage.id)}
              onCreateTemplateSubpage={(templateId) => handleCreateFromTemplate(templateId, selectedPage.id)}
              onMovePage={(parentId) => handleMovePage(selectedPage, parentId)}
              onDeletePage={() => setPageToDelete(selectedPage)}
              onSelectPage={selectPage}
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

      <AlertDialog open={!!pageToDelete} onOpenChange={(open) => !open && setPageToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this page?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete "{pageToDelete?.title || "Untitled"}" and any nested pages below it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deletePage.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!pageToDelete || deletePage.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (pageToDelete) handleDeletePage(pageToDelete);
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletePage.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Delete page
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppShell>
  );
}

function NewPageMenu({
  compact = false,
  label = "New Page",
  isPending,
  onBlank,
  onTemplate,
}: {
  compact?: boolean;
  label?: string;
  isPending: boolean;
  onBlank: () => void;
  onTemplate: (templateId: string) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size={compact ? "icon" : "sm"}
          className={cn(compact && "h-8 w-8")}
          disabled={isPending}
          aria-label={compact ? label : undefined}
        >
          {isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
          {!compact && label}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-72">
        <DropdownMenuItem onClick={onBlank}>
          <FileText size={13} />
          Blank page
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-medium uppercase tracking-[0.12em] text-muted-foreground">
          Starters
        </DropdownMenuLabel>
        {PAGE_TEMPLATES.map((template) => (
          <DropdownMenuItem key={template.id} onClick={() => onTemplate(template.id)} className="items-start gap-3 py-2">
            <BookOpen size={14} className="mt-0.5" />
            <span className="min-w-0">
              <span className="block font-medium">{template.label}</span>
              <span className="block truncate text-xs text-muted-foreground">{template.description}</span>
            </span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function WorkspaceEmptySidebar({
  onBlank,
  onTemplate,
}: {
  onBlank: () => void;
  onTemplate: (templateId: string) => void;
}) {
  return (
    <div className="space-y-3 rounded-md border border-dashed border-border bg-background/70 p-3 text-sm">
      <div className="flex items-start gap-2">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
          <BookOpen size={16} />
        </div>
        <div>
          <p className="font-medium">Start your workspace</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Create a lightweight home for plans, briefs, notes, and operating docs.
          </p>
        </div>
      </div>
      <Button size="sm" className="w-full" onClick={onBlank}>
        <Plus size={13} />
        Blank page
      </Button>
      <div className="space-y-1">
        {PAGE_TEMPLATES.slice(0, 3).map((template) => (
          <button
            key={template.id}
            onClick={() => onTemplate(template.id)}
            className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <span>{template.label}</span>
            <ChevronRight size={12} />
          </button>
        ))}
      </div>
    </div>
  );
}

function PageMoveMenu({
  page,
  pages,
  onMove,
}: {
  page: WorkspacePage;
  pages: WorkspacePage[];
  onMove: (parentId: string | null) => void;
}) {
  const blocked = descendantsOf(pages, page.id);
  const moveTargets = pages
    .filter((item) => item.id !== page.id && !blocked.has(item.id))
    .sort((a, b) => a.title.localeCompare(b.title));

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <MoveRight size={13} />
        Move to
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-64">
        <DropdownMenuItem disabled={!page.parent_id} onClick={() => onMove(null)}>
          <BookOpen size={13} />
          Top level
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {moveTargets.length === 0 ? (
          <DropdownMenuItem disabled>
            <Info size={13} />
            No other pages yet
          </DropdownMenuItem>
        ) : (
          moveTargets.slice(0, 18).map((target) => (
            <DropdownMenuItem
              key={target.id}
              disabled={page.parent_id === target.id}
              onClick={() => onMove(target.id)}
            >
              <FileText size={13} />
              <span className="truncate">{target.title || "Untitled"}</span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
}

function SaveStatus({
  dirty,
  saving,
  error,
}: {
  dirty: boolean;
  saving: boolean;
  error: Error | null;
}) {
  if (error) {
    return (
      <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-destructive/20 bg-destructive/5 px-2.5 text-xs font-medium text-destructive">
        <AlertCircle size={13} />
        Save failed
      </span>
    );
  }

  if (saving) {
    return (
      <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2.5 text-xs font-medium text-muted-foreground">
        <Loader2 size={13} className="animate-spin" />
        Saving
      </span>
    );
  }

  if (dirty) {
    return (
      <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-muted/50 px-2.5 text-xs font-medium text-muted-foreground">
        <Clock3 size={13} />
        Unsaved
      </span>
    );
  }

  return (
    <span className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-muted-foreground">
      <CheckCircle2 size={13} className="text-primary" />
      Saved
    </span>
  );
}

function PageTree({
  nodes,
  allPages,
  selectedPageId,
  expanded,
  onToggle,
  onSelect,
  onCreatePage,
  onMovePage,
  onDeletePage,
  depth = 0,
}: {
  nodes: PageNode[];
  allPages: WorkspacePage[];
  selectedPageId: string | null;
  expanded: Set<string>;
  onToggle: (pageId: string) => void;
  onSelect: (pageId: string) => void;
  onCreatePage: (parentId?: string | null) => void;
  onMovePage: (page: WorkspacePage, parentId: string | null) => void;
  onDeletePage: (page: WorkspacePage) => void;
  depth?: number;
}) {
  return (
    <div className="space-y-0.5">
      {nodes.map((node) => {
        const hasChildren = node.children.length > 0;
        const isOpen = expanded.has(node.id);
        const isSelected = selectedPageId === node.id;

        return (
          <div key={node.id}>
            <div
              className={cn(
                "group flex h-8 items-center gap-1 rounded-md px-1.5 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                isSelected && "bg-background text-foreground shadow-sm ring-1 ring-border/70"
              )}
              style={{ paddingLeft: 6 + depth * 14 }}
            >
              {hasChildren ? (
                <button
                  aria-label={`${isOpen ? "Collapse" : "Expand"} ${node.title || "Untitled"}`}
                  className="flex h-5 w-5 items-center justify-center rounded text-muted-foreground hover:bg-background"
                  onClick={(event) => {
                    event.stopPropagation();
                    onToggle(node.id);
                  }}
                >
                  {isOpen ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </button>
              ) : (
                <span className="h-5 w-5 shrink-0" />
              )}
              <button onClick={() => onSelect(node.id)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                <FileText size={13} className={cn("shrink-0", isSelected && "text-primary")} />
                <span className="truncate">{node.title || "Untitled"}</span>
                {hasChildren && (
                  <span className="ml-auto rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
                    {node.children.length}
                  </span>
                )}
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className={cn(
                    "h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-background",
                    isSelected ? "flex" : "hidden group-hover:flex"
                  )}
                    aria-label={`Open actions for ${node.title || "Untitled"}`}
                  >
                    <MoreHorizontal size={13} />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuItem onClick={() => onCreatePage(node.id)}>
                    <Plus size={13} />
                    Add subpage
                  </DropdownMenuItem>
                  <PageMoveMenu page={node} pages={allPages} onMove={(parentId) => onMovePage(node, parentId)} />
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
                allPages={allPages}
                expanded={expanded}
                onToggle={onToggle}
                onSelect={onSelect}
                onCreatePage={onCreatePage}
                onMovePage={onMovePage}
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
        "w-full rounded-md px-2 py-2 text-left transition-colors hover:bg-muted",
        selected && "bg-background shadow-sm ring-1 ring-border/70"
      )}
    >
      <span className="flex items-center gap-2 text-sm font-medium text-foreground">
        <FileText size={13} className={cn("shrink-0 text-muted-foreground", selected && "text-primary")} />
        <span className="truncate">{page.title || "Untitled"}</span>
      </span>
      {excerpt && <span className="mt-1 block truncate pl-5 text-xs text-muted-foreground">{excerpt}</span>}
      <span className="mt-1 block pl-5 text-[11px] text-muted-foreground/75">Updated {relativeTime(page.updated_at)}</span>
    </button>
  );
}

function DocumentEditor({
  page,
  pages,
  ancestors,
  blocks,
  blocksLoading,
  saving,
  saveError,
  focusedBlockId,
  draggedBlockId,
  dragOverBlockId,
  onTitleChange,
  onCreateSubpage,
  onCreateTemplateSubpage,
  onMovePage,
  onDeletePage,
  onSelectPage,
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
  ancestors: WorkspacePage[];
  blocks: WorkspaceBlock[];
  blocksLoading: boolean;
  saving: boolean;
  saveError: Error | null;
  focusedBlockId: string | null;
  draggedBlockId: string | null;
  dragOverBlockId: string | null;
  onTitleChange: (title: string) => void;
  onCreateSubpage: () => void;
  onCreateTemplateSubpage: (templateId: string) => void;
  onMovePage: (parentId: string | null) => void;
  onDeletePage: () => void;
  onSelectPage: (pageId: string) => void;
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
  const totalWords = blocks.reduce((count, block) => {
    const text = blockText(block).trim();
    return count + (text ? text.split(/\s+/).length : 0);
  }, 0);
  const hasDraftTitle = title.trim() !== page.title;

  useEffect(() => {
    setTitle(page.title);
  }, [page.id, page.title]);

  useEffect(() => {
    if (title.trim() === page.title) return;
    const timer = window.setTimeout(() => onTitleChange(title.trim() || "Untitled"), 600);
    return () => window.clearTimeout(timer);
  }, [onTitleChange, page.title, title]);

  return (
    <div className="mx-auto min-h-full max-w-5xl px-4 py-5 sm:px-8 lg:px-12">
      <div className="mb-5 flex flex-col gap-3 border-b border-border pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            <BookOpen size={13} className="shrink-0" />
            {ancestors[0] ? (
              <button onClick={() => onSelectPage(ancestors[0].id)} className="rounded px-1 py-0.5 hover:bg-muted hover:text-foreground">
                Workspace
              </button>
            ) : (
              <span className="px-1 py-0.5">Workspace</span>
            )}
            {ancestors.map((ancestor) => (
              <span key={ancestor.id} className="inline-flex min-w-0 items-center gap-1">
                <ChevronRight size={12} />
                <button onClick={() => onSelectPage(ancestor.id)} className="max-w-36 truncate rounded px-1 py-0.5 hover:bg-muted hover:text-foreground">
                  {ancestor.title || "Untitled"}
                </button>
              </span>
            ))}
          </div>

          <input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            onBlur={() => onTitleChange(title.trim() || "Untitled")}
            className="w-full border-none bg-transparent text-3xl font-semibold leading-tight tracking-normal outline-none placeholder:text-muted-foreground/40 sm:text-4xl"
            placeholder="Untitled"
          />

          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <Badge variant="secondary" className="gap-1 rounded-md font-medium">
              <FileText size={12} />
              {blocks.length} block{blocks.length === 1 ? "" : "s"}
            </Badge>
            <Badge variant="secondary" className="gap-1 rounded-md font-medium">
              <FolderTree size={12} />
              {childPages.length} subpage{childPages.length === 1 ? "" : "s"}
            </Badge>
            <span>{totalWords} word{totalWords === 1 ? "" : "s"}</span>
            <span>Updated {relativeTime(page.updated_at)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <SaveStatus dirty={hasDraftTitle} saving={saving} error={saveError} />
          <NewPageMenu
            compact
            label="Subpage"
            isPending={false}
            onBlank={onCreateSubpage}
            onTemplate={onCreateTemplateSubpage}
          />
          <Button size="sm" variant="ghost" onClick={() => onAddBlock(blocks[blocks.length - 1]?.id ?? null)}>
            <Plus size={13} />
            Block
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="icon" variant="ghost" className="h-8 w-8" aria-label="Open page actions">
                <MoreHorizontal size={15} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <PageMoveMenu page={page} pages={pages} onMove={onMovePage} />
              <DropdownMenuSeparator />
              <DropdownMenuItem className="text-destructive" onClick={onDeletePage}>
                <Trash2 size={13} />
                Delete page
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {childPages.length > 0 && (
        <div className="mb-8 grid gap-2 sm:grid-cols-2">
          {childPages.map((child) => (
            <button
              key={child.id}
              onClick={() => onSelectPage(child.id)}
              className="flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-left text-sm transition-colors hover:border-primary/30 hover:bg-muted/50"
            >
              <FileText size={14} className="shrink-0 text-muted-foreground" />
              <span className="truncate font-medium">{child.title || "Untitled"}</span>
              <ChevronRight size={13} className="ml-auto shrink-0 text-muted-foreground" />
            </button>
          ))}
        </div>
      )}

      {blocksLoading ? (
        <div className="space-y-2">
          {[1, 2, 3].map((item) => <Skeleton key={item} className="h-10 w-full" />)}
        </div>
      ) : (
        <div className="space-y-1 pb-24">
          {blocks.length === 0 && (
            <div className="rounded-md border border-dashed border-border bg-muted/20 px-4 py-10 text-center">
              <FileText size={20} className="mx-auto mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">This page is ready for notes.</p>
              <p className="mt-1 text-xs text-muted-foreground">Start with a heading, checklist, brief, or campaign context.</p>
              <Button className="mt-4" size="sm" variant="outline" onClick={() => onAddBlock(null)}>
                <Plus size={13} />
                Add first block
              </Button>
            </div>
          )}
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
  const [isFocused, setIsFocused] = useState(false);
  const [commandIndex, setCommandIndex] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const commandQuery = text.startsWith("/") ? text.slice(1).trim().toLowerCase() : "";
  const commandItems = BLOCK_COMMANDS.filter((item) =>
    `${item.label} ${item.description} ${item.type}`.toLowerCase().includes(commandQuery)
  );
  const showCommandMenu = isFocused && text.startsWith("/") && commandItems.length > 0;

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
    if (text.startsWith("/")) return;
    const timer = window.setTimeout(() => {
      onUpdate({ content: { ...content, text } as Json });
    }, 700);
    return () => window.clearTimeout(timer);
  }, [block, content, onUpdate, text]);

  useEffect(() => {
    if (commandIndex >= commandItems.length) setCommandIndex(0);
  }, [commandIndex, commandItems.length]);

  const TypeIcon = BLOCK_TYPES.find((item) => item.type === block.type)?.icon ?? Type;
  const isDivider = block.type === "divider";

  const updateType = (type: WorkspaceBlockType) => {
    onUpdate({ type, content: { ...content, text } as Json });
  };

  const applyCommand = (type: WorkspaceBlockType) => {
    setText("");
    setCommandIndex(0);
    onUpdate({ type, content: { ...content, text: "" } as Json });
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (showCommandMenu) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setCommandIndex((current) => (current + 1) % commandItems.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setCommandIndex((current) => (current - 1 + commandItems.length) % commandItems.length);
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        applyCommand(commandItems[commandIndex]?.type ?? "paragraph");
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setText("");
        return;
      }
    }
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
            <button
              className="flex h-6 w-4 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Open block menu"
            >
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
        <span
          className="flex h-6 w-4 cursor-grab items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          aria-hidden="true"
        >
          <GripVertical size={14} />
        </span>
      </div>

      <div className="min-w-0 flex-1">
        {isDivider ? (
          <button
            onClick={() => updateType("paragraph")}
            className="my-3 h-px w-full bg-border transition-colors hover:bg-primary/40"
            title="Convert divider to text"
            aria-label="Convert divider to text"
          />
        ) : (
          <div className="relative flex items-start gap-2">
            {block.type === "bullet" && <span className="mt-2.5 h-1.5 w-1.5 rounded-full bg-foreground/70" />}
            {block.type === "todo" && (
              <button
                onClick={() => onUpdate({ content: { ...content, checked: !content.checked, text } as Json })}
                aria-label={content.checked ? "Mark to-do incomplete" : "Mark to-do complete"}
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
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
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
            {showCommandMenu && (
              <div className="absolute left-0 top-9 z-20 w-72 overflow-hidden rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg">
                <div className="px-2 py-1.5 text-[11px] font-medium uppercase tracking-[0.12em] text-muted-foreground">
                  Blocks
                </div>
                {commandItems.map((item, index) => (
                  <button
                    key={item.type}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => applyCommand(item.type)}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left text-sm",
                      index === commandIndex ? "bg-accent text-accent-foreground" : "hover:bg-muted"
                    )}
                  >
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded border border-border bg-background">
                      <item.icon size={14} />
                    </span>
                    <span className="min-w-0">
                      <span className="block font-medium">{item.label}</span>
                      <span className="block truncate text-xs text-muted-foreground">{item.description}</span>
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="mt-2 hidden w-6 justify-center text-muted-foreground/40 group-hover:flex">
        <TypeIcon size={13} />
      </div>
    </div>
  );
}
