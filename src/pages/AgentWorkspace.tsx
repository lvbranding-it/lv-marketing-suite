import { useState, useCallback, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import {
  PanelLeftOpen, PanelRightOpen, FolderOpen,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import AgentProjectSidebar from "@/components/agents/AgentProjectSidebar";
import AgentRunChat from "@/components/agents/AgentRunChat";
import AgentBrandSnapshot from "@/components/agents/AgentBrandSnapshot";
import { useOrg } from "@/hooks/useOrg";
import { useProject } from "@/hooks/useProjects";
import type { RunResult } from "@/hooks/useAgentRuns";

export default function AgentWorkspace() {
  const { projectId: urlProjectId } = useParams<{ projectId?: string }>();
  const navigate = useNavigate();
  const { org }  = useOrg();

  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(urlProjectId ?? null);
  const [snapshot,          setSnapshot]          = useState<Record<string, unknown> | null>(null);
  const [loadRunId,         setLoadRunId]         = useState<string | null>(null);
  const [chatKey,           setChatKey]           = useState(0);
  const [refreshKey,        setRefreshKey]        = useState(0);

  const [leftOpen,  setLeftOpen]  = useState(true);
  const [rightOpen, setRightOpen] = useState(true);

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
    setRefreshKey((k) => k + 1);
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
                refreshKey={refreshKey}
                onClose={() => setLeftOpen(false)}
              />
            </div>
          </>
        ) : (
          <button
            onClick={() => setLeftOpen(true)}
            className="absolute left-2 top-2 z-10 flex items-center justify-center w-8 h-8 bg-background border border-gray-200 rounded-md shadow-sm text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Open sidebar"
          >
            <PanelLeftOpen size={14} />
          </button>
        )}

        {/* ── Main chat area ── */}
        <div className="flex-1 flex flex-col min-w-0 h-full overflow-hidden">

          {/* Project context header */}
          {project && (
            <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b bg-muted/30">
              <FolderOpen size={13} className="text-rose-500 shrink-0" />
              <div className="min-w-0 flex-1">
                <span className="text-sm font-semibold truncate">{project.name}</span>
                {project.client_name && (
                  <span className="text-xs text-muted-foreground ml-2">· {project.client_name}</span>
                )}
              </div>
            </div>
          )}

          {selectedProjectId && org ? (
            <AgentRunChat
              key={`${selectedProjectId}-${chatKey}`}
              projectId={selectedProjectId}
              projectName={project?.name ?? ""}
              orgId={org.id}
              onRunComplete={handleRunComplete}
              loadRunId={loadRunId}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full text-center px-6">
              <p className="text-4xl mb-3">🤖</p>
              <p className="text-lg font-semibold mb-1">Agent Workspace</p>
              <p className="text-muted-foreground text-sm max-w-sm">
                Select a project from the left sidebar to start running agents. Agents automatically read the project's marketing context and client brief so they're already briefed before you type.
              </p>
            </div>
          )}
        </div>

        {/* ── Right: Brand Snapshot — resizable, desktop always visible, mobile overlay ── */}
        {rightOpen ? (
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
        ) : (
          <button
            onClick={() => setRightOpen(true)}
            className="absolute right-2 top-2 z-10 flex items-center justify-center w-8 h-8 bg-background border border-gray-200 rounded-md shadow-sm text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Open snapshot panel"
          >
            <PanelRightOpen size={14} />
          </button>
        )}
      </div>
    </AppShell>
  );
}
