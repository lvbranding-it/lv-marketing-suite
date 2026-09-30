import { useEffect, useMemo, useRef, useState, type DragEvent } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertCircle,
  BookOpen,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  Download,
  Eye,
  FileText,
  FileImage,
  FileUp,
  FileVideo,
  FolderTree,
  Info,
  Layers3,
  Loader2,
  MoreHorizontal,
  MoveRight,
  Palette,
  Paperclip,
  Play,
  Plus,
  RotateCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import AppShell from "@/components/layout/AppShell";
import Header from "@/components/layout/Header";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
import type { Json, WorkspaceAsset } from "@/integrations/supabase/types";
import {
  isVideoFile,
  maxBytesFor,
  useCreateWorkspacePage,
  useDeleteWorkspaceAsset,
  useDeleteWorkspacePage,
  useUpdateWorkspacePage,
  useUploadWorkspaceAsset,
  useWorkspaceAssetSignedUrl,
  useWorkspaceAssets,
  useWorkspaceDocument,
  useWorkspacePages,
  useWorkspaceSearch,
  WORKSPACE_ASSET_ACCEPT,
  type WorkspaceAssetCategory,
  type WorkspacePageSummary,
} from "@/hooks/useWorkspace";
import WorkspaceDocumentEditor, { type DocumentSaveState } from "@/components/workspace/WorkspaceDocumentEditor";
import WorkspaceAssetPreview, { assetKind, downloadWorkspaceAsset } from "@/components/workspace/WorkspaceAssetPreview";

type PageNode = WorkspacePageSummary & { children: PageNode[] };

const h1 = (text: string) => `<h1>${text}</h1>`;
const h2 = (text: string) => `<h2>${text}</h2>`;
const p = (text: string) => `<p>${text}</p>`;
const bullets = (...items: string[]) => `<ul>${items.map((item) => `<li><p>${item}</p></li>`).join("")}</ul>`;
const tasks = (...items: string[]) =>
  `<ul data-type="taskList">${items.map((item) => `<li data-type="taskItem" data-checked="false"><p>${item}</p></li>`).join("")}</ul>`;
const quote = (text: string) => `<blockquote><p>${text}</p></blockquote>`;

const PAGE_TEMPLATES: Array<{
  id: string;
  label: string;
  description: string;
  title: string;
  metadata: Json;
  html: string;
}> = [
  {
    id: "campaign",
    label: "Campaign Plan",
    description: "Goals, audience, channels, timeline",
    title: "Campaign plan",
    metadata: { category: "campaign" },
    html: [
      h1("Campaign overview"),
      p("Objective, target audience, core offer, and launch window."),
      h2("Channel plan"),
      bullets("Email, social, paid, website, and partner touchpoints."),
      h2("Launch checklist"),
      tasks("Confirm final assets and owner"),
    ].join(""),
  },
  {
    id: "brief",
    label: "Client Brief",
    description: "Scope, audience, approvals, constraints",
    title: "Client brief",
    metadata: { category: "client-brief" },
    html: [
      h1("Client context"),
      p("Business background, stakeholders, and current priorities."),
      h2("Deliverables"),
      bullets("List what the team needs to create and by when."),
      h2("Approvals"),
      tasks("Confirm reviewer, due date, and decision criteria"),
    ].join(""),
  },
  {
    id: "sop",
    label: "SOP",
    description: "Repeatable process and quality bar",
    title: "Standard operating procedure",
    metadata: { category: "sop" },
    html: [
      h1("Purpose"),
      p("What this process is for and when the team should use it."),
      h2("Steps"),
      tasks("Step one", "Step two"),
      quote("Definition of done: add the quality bar here."),
    ].join(""),
  },
  {
    id: "meeting",
    label: "Meeting Notes",
    description: "Decisions, action items, follow-up",
    title: "Meeting summary",
    metadata: { category: "meeting" },
    html: [
      h1("Summary"),
      p("Key decisions, context, and open questions."),
      h2("Action items"),
      tasks("Add owner and due date"),
    ].join(""),
  },
];

const ASSET_CATEGORIES: Array<{
  value: WorkspaceAssetCategory;
  label: string;
  hint: string;
  icon: typeof Paperclip;
}> = [
  { value: "logo", label: "Logos", hint: "Brand marks and lockups", icon: FileImage },
  { value: "photo", label: "Photos", hint: "Campaign and client images", icon: FileImage },
  { value: "video", label: "Videos", hint: "Clips, reels, and edits", icon: FileVideo },
  { value: "pdf", label: "PDFs", hint: "Briefs, decks, and specs", icon: FileText },
  { value: "palette", label: "Palettes", hint: "Colors, schemas, CSS, JSON", icon: Palette },
  { value: "design_system", label: "Design systems", hint: "Guides and component docs", icon: Layers3 },
  { value: "calendar", label: "Calendars", hint: "Task calendars and schedules", icon: CalendarDays },
  { value: "reference", label: "References", hint: "Any useful support file", icon: Paperclip },
];

function buildPageTree(pages: WorkspacePageSummary[]) {
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

function descendantsOf(pages: WorkspacePageSummary[], pageId: string) {
  const childrenByParent = pages.reduce<Record<string, WorkspacePageSummary[]>>((acc, page) => {
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

function ancestorsOf(pages: WorkspacePageSummary[], page: WorkspacePageSummary | null) {
  if (!page) return [];
  const byId = new Map(pages.map((item) => [item.id, item]));
  const ancestors: WorkspacePageSummary[] = [];
  let parent = page.parent_id ? byId.get(page.parent_id) : null;
  while (parent) {
    ancestors.unshift(parent);
    parent = parent.parent_id ? byId.get(parent.parent_id) : null;
  }
  return ancestors;
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

function formatFileSize(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function assetCategoryMeta(category: WorkspaceAssetCategory) {
  return ASSET_CATEGORIES.find((item) => item.value === category) ?? ASSET_CATEGORIES[ASSET_CATEGORIES.length - 1];
}

export default function Workspace() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState("");
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [pageToDelete, setPageToDelete] = useState<WorkspacePageSummary | null>(null);
  const debouncedSearch = useDebouncedValue(search.trim(), 250);

  const { data: pages = [], isLoading: pagesLoading } = useWorkspacePages();
  const { data: searchHits = [], isFetching: searchLoading } = useWorkspaceSearch(debouncedSearch);
  const createPage = useCreateWorkspacePage();
  const updatePage = useUpdateWorkspacePage();
  const deletePage = useDeleteWorkspacePage();

  const pageTree = useMemo(() => buildPageTree(pages), [pages]);
  const selectedPageId = searchParams.get("page");
  const selectedPage = pages.find((page) => page.id === selectedPageId) ?? pages[0] ?? null;
  const selectedAncestors = useMemo(() => ancestorsOf(pages, selectedPage), [pages, selectedPage]);

  const searchPageIds = useMemo(() => {
    const q = debouncedSearch.toLowerCase();
    if (q.length < 2) return new Set<string>();
    const ids = new Set<string>();
    pages.forEach((page) => {
      if (page.title.toLowerCase().includes(q)) ids.add(page.id);
    });
    searchHits.forEach((hit) => ids.add(hit.pageId));
    return ids;
  }, [debouncedSearch, pages, searchHits]);

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
        documentHtml: template.html,
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

  const handleDeletePage = async (page: WorkspacePageSummary) => {
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

  const handleMovePage = async (page: WorkspacePageSummary, parentId: string | null) => {
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
                      snippet={searchHits.find((hit) => hit.pageId === page.id)?.snippet}
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
              key={selectedPage.id}
              page={selectedPage}
              pages={pages}
              ancestors={selectedAncestors}
              titleSaving={updatePage.isPending}
              titleError={updatePage.error}
              onTitleChange={(title) => updatePage.mutate({ id: selectedPage.id, title })}
              onCreateSubpage={() => handleCreatePage(selectedPage.id)}
              onCreateTemplateSubpage={(templateId) => handleCreateFromTemplate(templateId, selectedPage.id)}
              onMovePage={(parentId) => handleMovePage(selectedPage, parentId)}
              onDeletePage={() => setPageToDelete(selectedPage)}
              onSelectPage={selectPage}
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
  page: WorkspacePageSummary;
  pages: WorkspacePageSummary[];
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
  allPages: WorkspacePageSummary[];
  selectedPageId: string | null;
  expanded: Set<string>;
  onToggle: (pageId: string) => void;
  onSelect: (pageId: string) => void;
  onCreatePage: (parentId?: string | null) => void;
  onMovePage: (page: WorkspacePageSummary, parentId: string | null) => void;
  onDeletePage: (page: WorkspacePageSummary) => void;
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
  snippet,
  selected,
  onSelect,
}: {
  page: WorkspacePageSummary;
  snippet?: string;
  selected: boolean;
  onSelect: () => void;
}) {
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
      {snippet && <span className="mt-1 line-clamp-2 pl-5 text-xs text-muted-foreground">{snippet}</span>}
      <span className="mt-1 block pl-5 text-[11px] text-muted-foreground/75">Updated {relativeTime(page.updated_at)}</span>
    </button>
  );
}

function DocumentEditor({
  page,
  pages,
  ancestors,
  titleSaving,
  titleError,
  onTitleChange,
  onCreateSubpage,
  onCreateTemplateSubpage,
  onMovePage,
  onDeletePage,
  onSelectPage,
}: {
  page: WorkspacePageSummary;
  pages: WorkspacePageSummary[];
  ancestors: WorkspacePageSummary[];
  titleSaving: boolean;
  titleError: Error | null;
  onTitleChange: (title: string) => void;
  onCreateSubpage: () => void;
  onCreateTemplateSubpage: (templateId: string) => void;
  onMovePage: (parentId: string | null) => void;
  onDeletePage: () => void;
  onSelectPage: (pageId: string) => void;
}) {
  const [title, setTitle] = useState(page.title);
  const [doc, setDoc] = useState<DocumentSaveState>({ dirty: false, saving: false, error: null, words: 0 });
  const { data: document, isLoading, isError, refetch } = useWorkspaceDocument(page.id);
  const childPages = pages.filter((item) => item.parent_id === page.id).sort((a, b) => a.position - b.position);
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
              {doc.words} word{doc.words === 1 ? "" : "s"}
            </Badge>
            <Badge variant="secondary" className="gap-1 rounded-md font-medium">
              <FolderTree size={12} />
              {childPages.length} subpage{childPages.length === 1 ? "" : "s"}
            </Badge>
            <span>Updated {relativeTime(page.updated_at)}</span>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 lg:justify-end">
          <SaveStatus
            dirty={hasDraftTitle || doc.dirty}
            saving={titleSaving || doc.saving}
            error={titleError || doc.error}
          />
          <NewPageMenu
            compact
            label="Subpage"
            isPending={false}
            onBlank={onCreateSubpage}
            onTemplate={onCreateTemplateSubpage}
          />
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

      <WorkspaceAssetsPanel pageId={page.id} />

      <div className="pb-24">
        {isLoading ? (
          <div className="space-y-3 pt-4">
            <Skeleton className="h-9 w-full" />
            <Skeleton className="h-5 w-4/5" />
            <Skeleton className="h-5 w-3/5" />
            <Skeleton className="h-5 w-2/3" />
          </div>
        ) : isError || !document ? (
          <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-destructive/30 bg-destructive/5 px-4 py-10 text-center">
            <AlertCircle size={20} className="text-destructive" />
            <div>
              <p className="text-sm font-medium">This page's content could not be loaded.</p>
              <p className="mt-1 text-xs text-muted-foreground">Nothing has been lost. Check your connection and try again.</p>
            </div>
            <Button size="sm" variant="outline" onClick={() => refetch()}>
              <RotateCw size={13} />
              Try again
            </Button>
          </div>
        ) : (
          <WorkspaceDocumentEditor
            key={page.id}
            pageId={page.id}
            initialHtml={document.html}
            converted={document.converted}
            onStateChange={setDoc}
          />
        )}
      </div>
    </div>
  );
}

function WorkspaceAssetsPanel({ pageId }: { pageId: string }) {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [category, setCategory] = useState<WorkspaceAssetCategory>("reference");
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState<{ name: string; progress: number } | null>(null);
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);
  const { data: assets = [], isLoading } = useWorkspaceAssets(pageId);
  const uploadAsset = useUploadWorkspaceAsset();
  const deleteAsset = useDeleteWorkspaceAsset();
  const grouped = ASSET_CATEGORIES.map((item) => ({
    ...item,
    assets: assets.filter((asset) => asset.category === item.value),
  })).filter((item) => item.assets.length > 0);
  // The preview steps through files in the order they are shown, group by group.
  const ordered = grouped.flatMap((group) => group.assets);

  /**
   * Where a file is filed. A video always goes under Videos, whatever chip is
   * selected: a clip filed under Logos would be hard to find again. Anything
   * dropped while Videos is selected that is not a video goes to References.
   */
  const categoryFor = (file: File): WorkspaceAssetCategory => {
    if (isVideoFile(file)) return "video";
    return category === "video" ? "reference" : category;
  };

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    const oversized = list.filter((file) => file.size > maxBytesFor(file));
    if (oversized.length) {
      toast({
        title: "Some files are too large",
        description: `${oversized.map((file) => file.name).join(", ")} ${oversized.length === 1 ? "is" : "are"} over the limit: 500 MB for video, 50 MB for everything else.`,
        variant: "destructive",
      });
      return;
    }

    // Progress is measured in bytes, not files. Counted by files, one large
    // video sat at 0% for its whole upload and then jumped to 100%.
    const totalBytes = list.reduce((sum, file) => sum + file.size, 0) || 1;
    let doneBytes = 0;
    try {
      for (const file of list) {
        setUploading({ name: file.name, progress: Math.round((doneBytes / totalBytes) * 100) });
        await uploadAsset.mutateAsync({
          pageId,
          file,
          category: categoryFor(file),
          onProgress: (sent) =>
            setUploading({ name: file.name, progress: Math.min(99, Math.round(((doneBytes + sent) / totalBytes) * 100)) }),
        });
        doneBytes += file.size;
      }
      toast({
        title: "Workspace assets uploaded",
        description: `${list.length} file${list.length === 1 ? "" : "s"} added to this page.`,
      });
    } catch (error) {
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Please try again.",
        variant: "destructive",
      });
    } finally {
      setUploading(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const onDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setDragging(false);
    if (event.dataTransfer.files.length) handleFiles(event.dataTransfer.files);
  };

  const SelectedIcon = assetCategoryMeta(category).icon;

  return (
    <section className="mb-8 rounded-md border border-border bg-muted/10">
      <div className="flex flex-col gap-3 border-b border-border p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <Paperclip size={15} className="text-primary" />
            <h3 className="text-sm font-semibold">Reference library</h3>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Attach logos, photos, videos, PDFs, palettes, design systems, task calendars, and source context to this page.
          </p>
        </div>
        <Badge variant="secondary" className="w-fit rounded-md font-medium">
          {assets.length} file{assets.length === 1 ? "" : "s"}
        </Badge>
      </div>

      <div className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1fr)_minmax(280px,360px)]">
        <div className="space-y-3">
          <div className="flex flex-wrap gap-1.5">
            {ASSET_CATEGORIES.map((item) => {
              const Icon = item.icon;
              const active = item.value === category;
              return (
                <button
                  key={item.value}
                  onClick={() => setCategory(item.value)}
                  className={cn(
                    "inline-flex h-8 items-center gap-1.5 rounded-md border px-2.5 text-xs font-medium transition-colors",
                    active
                      ? "border-primary/30 bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground"
                  )}
                >
                  <Icon size={13} />
                  {item.label}
                </button>
              );
            })}
          </div>

          {isLoading ? (
            <div className="grid gap-2 sm:grid-cols-2">
              {[1, 2, 3, 4].map((item) => <Skeleton key={item} className="h-24 w-full" />)}
            </div>
          ) : assets.length === 0 ? (
            <div className="flex min-h-32 flex-col items-center justify-center rounded-md border border-dashed border-border bg-background/70 px-4 py-8 text-center">
              <FileUp size={20} className="mb-2 text-muted-foreground" />
              <p className="text-sm font-medium">No reference files yet.</p>
              <p className="mt-1 max-w-md text-xs text-muted-foreground">
                Upload the assets this page depends on so strategy, brand, and delivery context stay together.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {grouped.map((group) => (
                <div key={group.value} className="space-y-2">
                  <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                    <group.icon size={13} />
                    {group.label}
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px]">{group.assets.length}</span>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {group.assets.map((asset) => (
                      <WorkspaceAssetCard
                        key={asset.id}
                        asset={asset}
                        deleting={deleteAsset.isPending}
                        onOpen={() => setPreviewIndex(ordered.findIndex((item) => item.id === asset.id))}
                        onDelete={() => deleteAsset.mutate(asset, {
                          onError: (error) => toast({
                            title: "Asset was not deleted",
                            description: error instanceof Error ? error.message : "Please try again.",
                            variant: "destructive",
                          }),
                        })}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={onDrop}
          onClick={() => inputRef.current?.click()}
          className={cn(
            "flex min-h-52 cursor-pointer flex-col justify-between rounded-md border border-dashed bg-background p-4 transition-colors",
            dragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/30",
            uploading && "pointer-events-none opacity-80"
          )}
        >
          <input
            ref={inputRef}
            type="file"
            multiple
            accept={WORKSPACE_ASSET_ACCEPT}
            className="sr-only"
            onChange={(event) => event.target.files && handleFiles(event.target.files)}
          />
          <div className="space-y-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
              {uploading ? <Loader2 size={18} className="animate-spin" /> : <SelectedIcon size={18} />}
            </div>
            <div>
              <p className="text-sm font-semibold">
                {uploading ? "Uploading" : `Upload ${assetCategoryMeta(category).label.toLowerCase()}`}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {uploading
                  ? uploading.name
                  : "Drag files here or click to choose. Videos up to 500 MB; images, PDFs, JSON, CSS, CSV, ICS, Office docs, and ZIP files up to 50 MB."}
              </p>
            </div>
          </div>
          <div className="mt-4 space-y-2">
            {uploading ? (
              <>
                <Progress value={uploading.progress} className="h-1.5" />
                <p className="text-xs text-muted-foreground">{uploading.progress}% uploaded</p>
              </>
            ) : (
              <Button type="button" size="sm" variant="outline" className="pointer-events-none w-full">
                <FileUp size={13} />
                Choose files
              </Button>
            )}
          </div>
        </div>
      </div>

      <WorkspaceAssetPreview assets={ordered} index={previewIndex} onIndexChange={setPreviewIndex} />
    </section>
  );
}

function WorkspaceAssetCard({
  asset,
  deleting,
  onOpen,
  onDelete,
}: {
  asset: WorkspaceAsset;
  deleting: boolean;
  onOpen: () => void;
  onDelete: () => void;
}) {
  const { data: signedUrl } = useWorkspaceAssetSignedUrl(asset.storage_path);
  const meta = assetCategoryMeta(asset.category);
  const Icon = meta.icon;
  const kind = assetKind(asset);

  return (
    <div className="group overflow-hidden rounded-md border border-border bg-background">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`View ${asset.file_name}`}
        className="relative flex h-24 w-full items-center justify-center overflow-hidden bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary/50"
      >
        {kind === "image" && signedUrl ? (
          <img src={signedUrl} alt={asset.file_name} className="h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.03]" />
        ) : kind === "video" && signedUrl ? (
          <>
            {/* Loads only the header of the file, enough to draw a first frame. */}
            <video src={`${signedUrl}#t=0.1`} preload="metadata" muted playsInline className="h-full w-full bg-black object-cover" />
            <span className="absolute flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white backdrop-blur-sm">
              <Play size={16} className="ml-0.5 fill-current" />
            </span>
          </>
        ) : (
          <span className="flex h-10 w-10 items-center justify-center rounded-md bg-background text-muted-foreground shadow-sm">
            <Icon size={18} />
          </span>
        )}
      </button>
      <div className="space-y-2 p-2.5">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium" title={asset.file_name}>{asset.file_name}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{meta.label} · {formatFileSize(asset.file_size)}</p>
        </div>
        <div className="flex items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-7 flex-1 px-2 text-xs" onClick={onOpen}>
            <Eye size={12} />
            View
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            onClick={() => downloadWorkspaceAsset(asset)}
            aria-label={`Download ${asset.file_name}`}
          >
            <Download size={13} />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            className="h-7 w-7 text-muted-foreground hover:text-destructive"
            onClick={onDelete}
            disabled={deleting}
            aria-label={`Delete ${asset.file_name}`}
          >
            {deleting ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
          </Button>
        </div>
      </div>
    </div>
  );
}
