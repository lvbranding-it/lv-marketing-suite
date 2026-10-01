import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  PanelLeftOpen, PanelRightOpen, FolderOpen, LayoutGrid,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import BossHeader from "@/components/boss/BossHeader";
import AgentProjectSidebar from "@/components/agents/AgentProjectSidebar";
import AgentRunChat from "@/components/agents/AgentRunChat";
import AgentBrandSnapshot from "@/components/agents/AgentBrandSnapshot";
import AgentProjectLanding from "@/components/agents/AgentProjectLanding";
import { useOrg } from "@/hooks/useOrg";
import { useProject, useProjects } from "@/hooks/useProjects";
import { useAgentProjectActivity } from "@/hooks/useAgentRuns";
import { sortProjectsByActivity } from "@/lib/agents/runHistory";
import type { RunResult } from "@/hooks/useAgentRuns";

export default function AgentWorkspace() {
  const { projectId: urlProjectId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();
  const { org }  = useOrg();

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(urlProjectId ?? null);
  const [snapshot,          setSnapshot]          = useState<Record<string, unknown> | null>(null);
  const [loadRunId,         setLoadRunId]         = useState<string | null>(null);
  const [chatKey,           setChatKey]           = useState(0);

  // On a phone both panels are overlays that cover the chat, so both wait until
  // they are asked for. Choosing a project starts from the landing's cards.
  const isPhone = typeof window !== "undefined" && window.innerWidth < 768;
  const [leftOpen,  setLeftOpen]  = useState(() => !isPhone);
  const [rightOpen, setRightOpen] = useState(() => !isPhone);

  // Resizable snapshot panel
  const SNAP_MIN = 220;
  const SNAP_MAX = 600;
  const SNAP_DEFAULT = 288;
  const [snapshotWidth, setSnapshotWidth] = useState(SNAP_DEFAULT);
  const isResizing   = useRef(false);
  const startX       = useRef(0);
  const startWidth   = useRef(SNAP_DEFAULT);

  const onResizeStart = useCallback((e: React.MouseEvent) => {
    isResizing.current = true;
    startX.current     = e.clientX;
    startWidth.current = snapshotWidth;
    document.body.style.cursor    = "col-resize";
    document.body.style.userSelect = "none";

    const onMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      // dragging left = wider panel
      const delta = startX.current - ev.clientX;
      const next  = Math.min(SNAP_MAX, Math.max(SNAP_MIN, startWidth.current + delta));
      setSnapshotWidth(next);
    };
    const onUp = () => {
      isResizing.current = false;
      document.body.style.cursor    = "";
      document.body.style.userSelect = "";
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  }, [snapshotWidth]);

  const { data: project } = useProject(selectedProjectId ?? undefined);
  const { data: allProjects = [], isLoading: projectsLoading } = useProjects();
  const { data: activity = {} } = useAgentProjectActivity();
  // The landing shows where work was last happening first, so the usual next
  // step is one click instead of a hunt through the switcher.
  const projectsByActivity = sortProjectsByActivity(allProjects, activity);

  // Sync URL → state when navigating directly to /agents/:projectId, and back
  // to the landing at /agents: the Agents tab and All projects lead there, and
  // the open project used to stay on screen.
  useEffect(() => {
    if ((urlProjectId ?? null) !== selectedProjectId) {
      setSelectedProjectId(urlProjectId ?? null);
      setSnapshot(null);
      setLoadRunId(null);
    }
  }, [urlProjectId]);

  const handleSelectProject = useCallback((id: string) => {
    setSelectedProjectId(id);
    setLoadRunId(null);
    setSnapshot(null);
    setChatKey((k) => k + 1);
    navigate(`/agents/${id}`, { replace: true });
  }, [navigate]);

  const handleSelectRun = useCallback((runId: string) => {
    setLoadRunId(runId);
  }, []);

  const handleRunComplete = useCallback((result: RunResult) => {
    if (Object.keys(result.brandSnapshot).length > 0) {
      setSnapshot(result.brandSnapshot);
    }
  }, []);

  // Show whatever snapshot we have: newly returned from a run, or the one stored on the project
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const storedSnapshot = (project as any)?.brand_snapshot as Record<string, unknown> | undefined;
  const displaySnapshot = snapshot
    ?? (storedSnapshot && Object.keys(storedSnapshot).length > 0 ? storedSnapshot : null);

  return (
    <AppShell noPadding>
      <div className="flex h-full flex-col overflow-hidden">
      <BossHeader active="agents" />
      <div className="relative flex flex-1 min-h-0 overflow-hidden">

        {/* ── Left sidebar — desktop always visible, mobile overlay ──
            Only once a project is open: before that it could only say "choose a
            project", which the landing's cards already offer with the room to do it. */}
        {!selectedProjectId ? null : leftOpen ? (
          <>
            {/* Mobile backdrop */}
            <div
              className="absolute inset-0 z-20 bg-black/40 md:hidden"
              onClick={() => setLeftOpen(false)}
            />
            <div className="absolute z-30 h-full md:relative md:z-auto shrink-0">
              <AgentProjectSidebar
                selectedProjectId={selectedProjectId}
                onSelectProject={(id) => {
                  handleSelectProject(id);
                  if (window.innerWidth < 768) setLeftOpen(false);
                }}
                onSelectRun={(id) => {
                  handleSelectRun(id);
                  if (window.innerWidth < 768) setLeftOpen(false);
                }}
                selectedRunId={loadRunId}
                onClose={() => setLeftOpen(false)}
              />
            </div>
          </>
        ) : null}

        {/* ── Main chat area ── */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">

          {/* Project context header. The panel buttons sit in this row; floating
              over it, they covered the start and end of the project's name. */}
          {project && (
            <div className="shrink-0 flex items-center gap-2 px-2 sm:px-4 py-1.5 sm:py-2 border-b bg-muted/30">
              {!leftOpen && (
                <button
                  onClick={() => setLeftOpen(true)}
                  className="shrink-0 flex items-center justify-center w-9 h-9 sm:w-8 sm:h-8 rounded-md border border-gray-200 bg-background text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Open sidebar"
                  title="Projects and run history"
                >
                  <PanelLeftOpen size={15} />
                </button>
              )}
              <button
                onClick={() => navigate("/agents")}
                className="shrink-0 flex items-center gap-1 h-9 sm:h-8 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-background hover:text-foreground transition-colors"
                title="All projects"
                aria-label="All projects"
              >
                <LayoutGrid size={14} />
                <span className="hidden sm:inline">All projects</span>
              </button>
              <span className="h-4 w-px shrink-0 bg-gray-200" aria-hidden />
              <FolderOpen size={13} className="text-rose-500 shrink-0" />
              <div className="min-w-0 flex-1 truncate">
                <span className="text-sm font-semibold">{project.name}</span>
                {project.client_name && (
                  <span className="text-xs text-muted-foreground ml-2">· {project.client_name}</span>
                )}
              </div>
              {!rightOpen && (
                <button
                  onClick={() => setRightOpen(true)}
                  className="shrink-0 flex items-center justify-center w-9 h-9 sm:w-8 sm:h-8 rounded-md border border-gray-200 bg-background text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Open snapshot panel"
                  title="Brand snapshot"
                >
                  <PanelRightOpen size={15} />
                </button>
              )}
            </div>
          )}

          {selectedProjectId && org ? (
            // The chat takes what the header leaves. At full height it was
            // taller than the column by the header's height, and scrolling to a
            // new message scrolled the column too and pushed the header off the top.
            <div className="flex-1 min-h-0">
              <AgentRunChat
                key={`${selectedProjectId}-${chatKey}`}
                projectId={selectedProjectId}
                projectName={project?.name ?? ""}
                orgId={org.id}
                onRunComplete={handleRunComplete}
                loadRunId={loadRunId}
              />
            </div>
          ) : (
            <AgentProjectLanding
              projects={projectsByActivity}
              activity={activity}
              onSelect={handleSelectProject}
              loading={projectsLoading}
            />
          )}
        </div>

        {/* ── Right: Brand Snapshot — resizable, desktop always visible, mobile overlay ──
            Only once a project is open: a snapshot belongs to a project, and with
            none chosen the panel could only take room from the landing. */}
        {!selectedProjectId || !rightOpen ? null : (
          <>
            {/* Mobile backdrop */}
            <div
              className="absolute inset-0 z-20 bg-black/40 md:hidden"
              onClick={() => setRightOpen(false)}
            />
            <div
              className="absolute right-0 z-30 h-full md:relative md:z-auto shrink-0 flex"
              style={{ width: snapshotWidth }}
            >
              {/* ── Drag handle ── */}
              <div
                onMouseDown={onResizeStart}
                onDoubleClick={() => setSnapshotWidth(SNAP_DEFAULT)}
                className="hidden md:flex w-1.5 shrink-0 cursor-col-resize items-center justify-center group h-full hover:bg-rose-100 transition-colors"
                title="Drag to resize · Double-click to reset"
              >
                <div className="h-8 w-0.5 rounded-full bg-gray-300 group-hover:bg-rose-400 transition-colors" />
              </div>

              {/* Panel content fills the rest */}
              <div className="flex-1 min-w-0 h-full overflow-hidden">
                <AgentBrandSnapshot
                  snapshot={displaySnapshot}
                  projectId={selectedProjectId ?? undefined}
                />
              </div>
            </div>
          </>
        )}
      </div>
      </div>
    </AppShell>
  );
}
