import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronLeft, ChevronRight, CircleCheck, FolderOpen, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { fitGrid, matchesProject, pageNumbers, type GridFit } from "@/lib/agents/projectGrid";
import { runDateLabel, type ProjectActivity } from "@/lib/agents/runHistory";

/** Every card is this tall, so a page can be worked out from the space. */
const CARD_HEIGHT = 148;
const MIN_CARD_WIDTH = 260;
const GAP = 12;

interface LandingProject {
  id: string;
  name: string;
  client_name: string | null;
  description: string | null;
  context_complete: boolean;
}

interface AgentProjectLandingProps {
  /** In the order to show them: most recent agent work first. */
  projects: LandingProject[];
  activity: Record<string, ProjectActivity>;
  onSelect: (projectId: string) => void;
  loading?: boolean;
}

/**
 * The Agents page before a project is chosen: every project as a card, in
 * pages that fill the screen with whole rows, and a search across them.
 */
export default function AgentProjectLanding({ projects, activity, onSelect, loading = false }: AgentProjectLandingProps) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [fit, setFit] = useState<GridFit>({ columns: 3, rows: 3, pageSize: 9 });
  const gridRef = useRef<HTMLDivElement>(null);

  // The page size follows the space the grid has, as the window or the
  // panels beside it change size.
  useEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const measure = () => {
      const { width, height } = grid.getBoundingClientRect();
      const next = fitGrid(width, height, { minCardWidth: MIN_CARD_WIDTH, cardHeight: CARD_HEIGHT, gap: GAP });
      setFit((last) => (last.columns === next.columns && last.rows === next.rows ? last : next));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(grid);
    return () => observer.disconnect();
  }, []);

  const matches = useMemo(() => projects.filter((project) => matchesProject(project, query)), [projects, query]);
  const pageCount = Math.max(1, Math.ceil(matches.length / fit.pageSize));
  const current = Math.min(page, pageCount);
  const first = (current - 1) * fit.pageSize;
  const shown = matches.slice(first, first + fit.pageSize);

  useEffect(() => setPage(1), [query]);
  // A new page starts at its top; a single column scrolls within its page.
  useEffect(() => gridRef.current?.scrollTo({ top: 0 }), [current]);

  return (
    <div className="flex h-full flex-col bg-muted/40 px-4 pt-4 sm:px-6 sm:pt-5">
      <div className="flex shrink-0 flex-wrap items-end justify-between gap-3">
        <div className="min-w-0 max-w-2xl">
          <h2 className="text-lg font-semibold text-balance">Pick up where you left off</h2>
          <p className="text-sm text-muted-foreground">
            BOSS reads a project's marketing context and client brief before you type, so every agent starts already briefed.
          </p>
        </div>
        <div className="relative w-full sm:w-72">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Escape" && setQuery("")}
            placeholder="Search projects or clients"
            aria-label="Search projects or clients"
            className="h-9 bg-background pl-9 pr-9 text-base md:text-sm"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Measured: the cards on a page are the whole rows that fit here. */}
      <div ref={gridRef} className="mt-4 min-h-0 flex-1 overflow-y-auto">
        {loading ? (
          <div className="grid" style={{ gap: GAP, gridTemplateColumns: `repeat(${fit.columns}, minmax(0, 1fr))` }}>
            {Array.from({ length: fit.pageSize }, (_, i) => (
              <Skeleton key={i} className="rounded-xl" style={{ height: CARD_HEIGHT }} />
            ))}
          </div>
        ) : shown.length > 0 ? (
          <div className="grid" style={{ gap: GAP, gridTemplateColumns: `repeat(${fit.columns}, minmax(0, 1fr))` }}>
            {shown.map((project) => (
              <ProjectCard key={project.id} project={project} activity={activity[project.id]} onSelect={onSelect} />
            ))}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-sm text-muted-foreground">
            <FolderOpen size={22} aria-hidden />
            {projects.length === 0 ? (
              <>
                <p>No projects yet. BOSS's agents work inside a project.</p>
                <Button asChild variant="outline" size="sm">
                  <Link to="/projects">Create a project</Link>
                </Button>
              </>
            ) : (
              <p>No project or client matches "{query.trim()}".</p>
            )}
          </div>
        )}
      </div>

      {/* Always shown, so the grid's space does not change when pages appear. */}
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="tabular-nums">
          {loading
            ? ""
            : matches.length <= fit.pageSize
              ? `${matches.length} project${matches.length === 1 ? "" : "s"}`
              : `${first + 1}–${first + shown.length} of ${matches.length} projects`}
        </span>
        {pageCount > 1 && (
          <nav aria-label="Project pages" className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 bg-background p-0"
              disabled={current === 1}
              onClick={() => setPage(current - 1)}
              aria-label="Previous page"
            >
              <ChevronLeft size={15} />
            </Button>
            {pageNumbers(current, pageCount).map((number, i) =>
              number === "gap" ? (
                <span key={`gap-${i}`} className="w-6 text-center" aria-hidden>…</span>
              ) : (
                <Button
                  key={number}
                  variant={number === current ? "default" : "ghost"}
                  size="sm"
                  className="h-8 min-w-8 px-2 tabular-nums"
                  onClick={() => setPage(number)}
                  aria-label={`Page ${number}`}
                  aria-current={number === current ? "page" : undefined}
                >
                  {number}
                </Button>
              ),
            )}
            <Button
              variant="outline"
              size="sm"
              className="h-8 w-8 bg-background p-0"
              disabled={current === pageCount}
              onClick={() => setPage(current + 1)}
              aria-label="Next page"
            >
              <ChevronRight size={15} />
            </Button>
          </nav>
        )}
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  activity,
  onSelect,
}: {
  project: LandingProject;
  activity: ProjectActivity | undefined;
  onSelect: (projectId: string) => void;
}) {
  const runs = activity?.runs ?? 0;
  return (
    <button
      type="button"
      onClick={() => onSelect(project.id)}
      style={{ height: CARD_HEIGHT }}
      className={cn(
        "group flex flex-col rounded-xl border border-gray-200 bg-white p-4 text-left shadow-sm transition-[border-color,box-shadow,transform]",
        "hover:border-rose-300 hover:shadow-md motion-safe:hover:-translate-y-0.5",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300",
      )}
    >
      <div className="flex w-full items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-rose-50 text-rose-600" aria-hidden>
          <FolderOpen size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-foreground">{project.name}</span>
          <span className="block truncate text-xs text-muted-foreground">{project.client_name?.trim() || "No client set"}</span>
        </span>
        <ArrowRight
          size={14}
          className="mt-1 shrink-0 text-gray-300 transition-transform group-hover:text-rose-500 motion-safe:group-hover:translate-x-0.5"
          aria-hidden
        />
      </div>
      <span className="mt-2 line-clamp-2 w-full text-xs text-muted-foreground">{project.description?.trim()}</span>
      <span className="mt-auto flex w-full items-center justify-between gap-2 border-t border-gray-100 pt-2 text-[11px] text-muted-foreground">
        <span className="truncate tabular-nums">
          {runs ? `${runs} run${runs === 1 ? "" : "s"}` : "No runs yet"}
          {activity?.lastRun ? ` · ${runDateLabel(activity.lastRun)}` : ""}
        </span>
        {project.context_complete && (
          <span className="inline-flex shrink-0 items-center gap-1 text-emerald-700">
            <CircleCheck size={11} aria-hidden />
            Context ready
          </span>
        )}
      </span>
    </button>
  );
}
