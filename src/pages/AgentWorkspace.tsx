import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  PanelLeftOpen, PanelRightOpen, FolderOpen, ArrowRight,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import AgentProjectSidebar from "@/components/agents/AgentProjectSidebar";
import AgentRunChat from "@/components/agents/AgentRunChat";
import AgentBrandSnapshot from "@/components/agents/AgentBrandSnapshot";
import { useOrg } from "@/hooks/useOrg";
import { useProject, useProjects } from "@/hooks/useProjects";
import { useAgentProjectActivity } from "@/hooks/useAgentRuns";
import { runDateLabel, sortProjectsByActivity } from "@/lib/agents/runHistory";
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
  // they are asked for. Choosing a project there starts from the landing's list
  // of recent ones, with a button for the rest.
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
  const { data: allProjects = [] } = useProjects();
  const { data: activity = {} } = useAgentProjectActivity();
  // The landing shows where work was last happening, so the usual next step
  // is one click instead of a hunt through the switcher.
  const recentProjects = sortProjectsByActivity(allProjects, activity).slice(0, 6);

  // Sync URL → state when navigating directly to /agents/:projectId
  useEffect(() => {
    if (urlProjectId && urlProjectId !== selectedProjectId) {
      setSelectedProjectId(urlProjectId);
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
      <div className="relative flex h-full overflow-hidden">

        {/* ── Left sidebar — desktop always visible, mobile overlay ── */}
        {leftOpen ? (
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
        ) : !project ? (
          // With no project open there is no header row to hold the button.
          <button
            onClick={() => setLeftOpen(true)}
            className="absolute left-2 top-2 z-10 flex items-center justify-center w-9 h-9 bg-background border border-gray-200 rounded-md shadow-sm text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Open sidebar"
          >
            <PanelLeftOpen size={15} />
          </button>
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
            <div className="h-full overflow-y-auto">
              <div className="mx-auto flex min-h-full max-w-xl flex-col justify-center px-6 py-10">
                <p className="text-lg font-semibold">Pick up where you left off</p>
                <p className="mt-1 max-w-lg text-sm text-muted-foreground">
                  Agents read a project's marketing context and client brief before you type, so they start already briefed.
                </p>
                {recentProjects.length > 0 && (
                  <div className="mt-6 grid gap-2">
                    {recentProjects.map((item) => {
                      const entry = activity[item.id];
                      return (
                        <button
                          key={item.id}
                          onClick={() => handleSelectProject(item.id)}
                          className="group flex items-start gap-3 rounded-lg border border-gray-200 bg-white p-3 text-left transition-colors hover:border-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300"
                        >
                          <FolderOpen size={15} className="mt-0.5 shrink-0 text-rose-500" />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-medium">{item.name}</span>
                            <span className="block truncate text-xs text-muted-foreground">
                              {[
                                item.client_name?.trim(),
                                entry?.runs ? `${entry.runs} run${entry.runs === 1 ? "" : "s"}` : "No runs yet",
                                entry?.lastRun ? runDateLabel(entry.lastRun) : null,
                              ].filter(Boolean).join(" · ")}
                            </span>
                          </span>
                          <ArrowRight size={14} className="mt-0.5 shrink-0 text-gray-300 transition-transform group-hover:translate-x-0.5 group-hover:text-rose-500" />
                        </button>
                      );
                    })}
                  </div>
                )}
                {allProjects.length > recentProjects.length && (
                  <>
                    <p className="mt-4 hidden text-xs text-muted-foreground md:block">
                      {allProjects.length - recentProjects.length} more in the project switcher at the top of the sidebar.
                    </p>
                    {/* The sidebar starts closed on a phone, so the rest are one tap away here. */}
                    <button
                      onClick={() => setLeftOpen(true)}
                      className="mt-3 flex h-11 items-center justify-center gap-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 transition-colors hover:border-rose-300 md:hidden"
                    >
                      <FolderOpen size={15} className="text-rose-500" />
                      Browse all {allProjects.length} projects
                    </button>
                  </>
                )}
              </div>
            </div>
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
    </AppShell>
  );
}
