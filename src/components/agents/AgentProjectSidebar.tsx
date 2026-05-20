import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, ChevronRight, Clock, Plus, Filter, History } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { useProjects } from "@/hooks/useProjects";
import { useAgentRuns } from "@/hooks/useAgentRuns";
import { getAgent, CATEGORY_COLORS } from "@/lib/agents";
import { cn } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface Props {
  selectedProjectId: string | null;
  onSelectProject:   (id: string) => void;
  onSelectRun:       (runId: string) => void;
  selectedRunId?:    string | null;
  refreshKey?:       number;
  onClose?:          () => void;
}

const STATUS_DOT: Record<string, string> = {
  active:   "bg-green-500",
  paused:   "bg-amber-400",
  archived: "bg-gray-300",
};

export default function AgentProjectSidebar({
  selectedProjectId,
  onSelectProject,
  onSelectRun,
  selectedRunId,
  onClose,
}: Props) {
  const navigate = useNavigate();
  const { data: projects = [], isLoading } = useProjects();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: runs = [], isLoading: runsLoading } = useAgentRuns(selectedProjectId ?? undefined) as any;

  // Filter: when a project is selected, default to showing only that project
  const [showAll, setShowAll] = useState(false);

  const visibleProjects = (showAll || !selectedProjectId)
    ? projects
    : projects.filter((p: { id: string }) => p.id === selectedProjectId);

  return (
    <div className="w-72 flex flex-col h-full bg-gray-50 border-r border-gray-200 shrink-0">
      {/* Header */}
      <div className="px-3 pt-3 pb-2 border-b border-gray-200 shrink-0">
        <div className="flex items-center gap-2 mb-2.5">
          <Bot size={15} className="text-rose-600 shrink-0" />
          <span className="text-xs font-bold text-gray-800 uppercase tracking-wide flex-1">Agents</span>
          {selectedProjectId && (
            <button
              onClick={() => setShowAll((s) => !s)}
              title={showAll ? "Show current project only" : "Show all projects"}
              className={cn(
                "flex items-center justify-center w-6 h-6 rounded text-gray-400 hover:bg-gray-200 transition-colors",
                !showAll && "text-rose-500 bg-rose-50",
              )}
            >
              <Filter size={12} />
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="flex items-center justify-center w-6 h-6 rounded text-gray-400 hover:bg-gray-200 transition-colors"
              title="Close sidebar"
            >
              <ChevronRight size={12} />
            </button>
          )}
        </div>
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1.5 text-xs h-7 border-gray-200 text-gray-600 hover:bg-white hover:text-gray-900"
          onClick={() => navigate("/projects")}
        >
          <Plus size={12} />
          New Project
        </Button>
      </div>

      <ScrollArea className="flex-1 min-h-0">
        {/* Projects list */}
        <div className="px-2 pt-2 pb-1">
          <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1 mb-1">
            Projects
          </p>

          {isLoading ? (
            <div className="space-y-1 px-1">
              {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-9 w-full rounded-md" />)}
            </div>
          ) : projects.length === 0 ? (
            <p className="text-xs text-gray-400 px-1 py-2 italic">No projects yet.</p>
          ) : (
            <>
              {visibleProjects.map((p: { id: string; name: string; status?: string | null; client_name?: string | null }) => {
                const isSelected = selectedProjectId === p.id;
                const dot = STATUS_DOT[p.status ?? "active"] ?? STATUS_DOT.active;
                return (
                  <button
                    key={p.id}
                    onClick={() => onSelectProject(p.id)}
                    className={cn(
                      "w-full text-left flex items-center gap-2 px-2 py-2 rounded-lg transition-all duration-100 group mb-0.5",
                      isSelected
                        ? "bg-rose-50 border border-rose-200 shadow-sm"
                        : "hover:bg-white hover:shadow-sm border border-transparent",
                    )}
                  >
                    <span className={cn("w-1.5 h-1.5 rounded-full shrink-0 mt-0.5", dot)} />
                    <div className="flex-1 min-w-0">
                      <p className={cn(
                        "text-xs font-medium truncate leading-tight",
                        isSelected ? "text-rose-700" : "text-gray-800",
                      )}>
                        {p.name}
                      </p>
                      {p.client_name && (
                        <p className="text-[10px] text-gray-400 truncate leading-tight mt-0.5">
                          {p.client_name}
                        </p>
                      )}
                    </div>
                    {isSelected && (
                      <ChevronRight size={12} className="shrink-0 text-rose-400" />
                    )}
                  </button>
                );
              })}

              {/* Show-all toggle when a project is selected and we're in filter mode */}
              {selectedProjectId && !showAll && projects.length > 1 && (
                <button
                  onClick={() => setShowAll(true)}
                  className="w-full text-left text-[11px] text-gray-400 hover:text-gray-600 px-2 py-1 mt-0.5"
                >
                  + {projects.length - 1} more project{projects.length - 1 !== 1 ? "s" : ""}…
                </button>
              )}
            </>
          )}
        </div>

        {/* Run history */}
        {selectedProjectId && (
          <div className="px-2 pt-1 pb-2 border-t border-gray-200 mt-1">
            <p className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider px-1 mb-1.5 flex items-center gap-1">
              <History size={9} /> Run History
            </p>

            {runsLoading ? (
              <div className="space-y-1 px-1">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-10 w-full rounded-md" />)}
              </div>
            ) : runs.length === 0 ? (
              <p className="text-[11px] text-gray-400 px-1 py-1 italic">
                No runs yet — pick an agent and start.
              </p>
            ) : (
              <div className="space-y-0.5">
                {runs.map((run: {
                  id: string;
                  agent_id: string;
                  mode?: string;
                  created_at: string;
                  input?: { text?: string };
                }) => {
                  const agent = getAgent(run.agent_id);
                  const catColor = agent ? CATEGORY_COLORS[agent.category] : "bg-gray-100 text-gray-500 border-gray-200";
                  const isSelected = selectedRunId === run.id;
                  const inputPreview = run.input?.text?.slice(0, 45) || "";
                  return (
                    <button
                      key={run.id}
                      onClick={() => onSelectRun(run.id)}
                      className={cn(
                        "w-full text-left flex flex-col gap-0.5 px-2 py-1.5 rounded-lg transition-all",
                        isSelected
                          ? "bg-rose-50 border border-rose-200"
                          : "hover:bg-white border border-transparent",
                      )}
                    >
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <Badge
                          variant="outline"
                          className={cn("text-[9px] px-1.5 py-0 h-4 shrink-0 border font-medium", catColor)}
                        >
                          {agent?.shortName ?? run.agent_id}
                        </Badge>
                        {run.mode === "revise" && (
                          <span className="text-[9px] text-gray-400">↩ revise</span>
                        )}
                      </div>
                      {inputPreview && (
                        <p className="text-[10px] text-gray-500 truncate leading-tight px-0.5">
                          {inputPreview}
                          {(run.input?.text?.length ?? 0) > 45 ? "…" : ""}
                        </p>
                      )}
                      <div className="flex items-center gap-1 text-[10px] text-gray-400">
                        <Clock size={9} />
                        {formatDistanceToNow(new Date(run.created_at), { addSuffix: true })}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}
