import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Bot, ChevronLeft, History, Search, X } from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjects } from "@/hooks/useProjects";
import { useAgentProjectActivity, useAgentRuns } from "@/hooks/useAgentRuns";
import { agents, getAgent, CATEGORY_COLORS } from "@/lib/agents";
import { groupRunsByDate, runDateLabel, sortProjectsByActivity } from "@/lib/agents/runHistory";
import { cn } from "@/lib/utils";
import AgentProjectSwitcher from "./AgentProjectSwitcher";

interface Props {
  selectedProjectId: string | null;
  onSelectProject:   (id: string) => void;
  onSelectRun:       (runId: string) => void;
  selectedRunId?:    string | null;
  onClose?:          () => void;
}

interface RunRow {
  id: string;
  agent_id: string;
  mode?: string;
  created_at: string;
  input?: { text?: string };
}

/**
 * The Agents sidebar: which project you are in, and what has been run in it.
 *
 * It used to hold both the full project list and the run history in one
 * scrolling column, so expanding either buried the other: with every project
 * showing, a project's runs started below the bottom of the screen, and the
 * only way to collapse the list again was an unlabelled filter icon. The
 * project list now lives in the switcher at the top, and the rest of the
 * column belongs to the selected project's runs.
 */
export default function AgentProjectSidebar({
  selectedProjectId,
  onSelectProject,
  onSelectRun,
  selectedRunId,
  onClose,
}: Props) {
  const navigate = useNavigate();
  const { data: projects = [], isLoading: projectsLoading } = useProjects();
  const { data: activity = {} } = useAgentProjectActivity();
  const { data: runs = [], isLoading: runsLoading } = useAgentRuns(selectedProjectId ?? undefined);
  const [query, setQuery] = useState("");
  const [agentFilter, setAgentFilter] = useState<string>("all");

  // A search or filter belongs to the project it was typed in.
  useEffect(() => {
    setQuery("");
    setAgentFilter("all");
  }, [selectedProjectId]);

  const sortedProjects = useMemo(() => sortProjectsByActivity(projects, activity), [projects, activity]);

  // Only the agents this project has actually used, in the registry's order.
  const agentsUsed = useMemo(() => {
    const counts = new Map<string, number>();
    (runs as RunRow[]).forEach((run) => counts.set(run.agent_id, (counts.get(run.agent_id) ?? 0) + 1));
    return agents.filter((agent) => counts.has(agent.id)).map((agent) => ({ agent, count: counts.get(agent.id)! }));
  }, [runs]);

  const filteredRuns = useMemo(() => {
    const term = query.trim().toLowerCase();
    return (runs as RunRow[]).filter((run) => {
      if (agentFilter !== "all" && run.agent_id !== agentFilter) return false;
      if (!term) return true;
      const agentName = getAgent(run.agent_id)?.shortName ?? run.agent_id;
      return `${run.input?.text ?? ""} ${agentName}`.toLowerCase().includes(term);
    });
  }, [agentFilter, query, runs]);

  const groups = useMemo(() => groupRunsByDate(filteredRuns), [filteredRuns]);
  const filtering = !!query.trim() || agentFilter !== "all";

  return (
    <div className="flex h-full w-72 shrink-0 flex-col border-r border-gray-200 bg-gray-50">
      <div className="shrink-0 space-y-2.5 border-b border-gray-200 px-3 pb-3 pt-3">
        <div className="flex items-center gap-2">
          <Bot size={15} className="shrink-0 text-rose-600" />
          <span className="flex-1 text-xs font-bold uppercase tracking-wide text-gray-800">Agents</span>
          {onClose && (
            <button
              onClick={onClose}
              className="flex h-6 w-6 items-center justify-center rounded text-gray-400 transition-colors hover:bg-gray-200 hover:text-gray-700"
              title="Hide sidebar"
              aria-label="Hide sidebar"
            >
              <ChevronLeft size={14} />
            </button>
          )}
        </div>

        {projectsLoading ? (
          <Skeleton className="h-[52px] w-full rounded-lg" />
        ) : (
          <AgentProjectSwitcher
            projects={sortedProjects}
            activity={activity}
            selectedProjectId={selectedProjectId}
            onSelect={onSelectProject}
            onNewProject={() => navigate("/projects")}
          />
        )}
      </div>

      {!selectedProjectId ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <History size={18} className="mb-2 text-gray-300" />
          <p className="text-xs text-gray-500">Choose a project to see everything its agents have produced.</p>
        </div>
      ) : (
        <>
          <div className="shrink-0 space-y-2 border-b border-gray-200 px-3 py-2.5">
            <div className="relative">
              <Search size={13} className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                onKeyDown={(event) => event.key === "Escape" && setQuery("")}
                placeholder="Search this project's runs"
                aria-label="Search this project's runs"
                className="h-8 w-full rounded-md border border-gray-200 bg-white pl-8 pr-7 text-xs outline-none transition-shadow placeholder:text-gray-400 focus:border-rose-300 focus:ring-2 focus:ring-rose-100"
              />
              {query && (
                <button
                  onClick={() => setQuery("")}
                  aria-label="Clear search"
                  className="absolute right-1.5 top-1/2 flex h-5 w-5 -translate-y-1/2 items-center justify-center rounded text-gray-400 hover:bg-gray-100 hover:text-gray-700"
                >
                  <X size={12} />
                </button>
              )}
            </div>

            {agentsUsed.length > 1 && (
              <div className="flex flex-wrap gap-1" role="group" aria-label="Filter by agent">
                {[{ id: "all", label: "All", count: runs.length }, ...agentsUsed.map(({ agent, count }) => ({ id: agent.id, label: agent.shortName, count }))].map(
                  (chip) => (
                    <button
                      key={chip.id}
                      onClick={() => setAgentFilter(chip.id)}
                      aria-pressed={agentFilter === chip.id}
                      className={cn(
                        "rounded-full px-2 py-0.5 text-[11px] transition-colors",
                        agentFilter === chip.id
                          ? "bg-rose-600 font-medium text-white"
                          : "bg-white text-gray-600 ring-1 ring-inset ring-gray-200 hover:ring-gray-300",
                      )}
                    >
                      {chip.label}
                      <span className={cn("ml-1 tabular-nums", agentFilter === chip.id ? "text-white/75" : "text-gray-400")}>{chip.count}</span>
                    </button>
                  ),
                )}
              </div>
            )}
          </div>

          {/* The scroll area's inner wrapper is a table by default and grew to fit
              the longest unbroken word, so one pasted URL widened every row past
              the sidebar and clipped them all. Block keeps it to the sidebar. */}
          <ScrollArea className="min-h-0 flex-1 [&_[data-radix-scroll-area-viewport]>div]:!block">
            <div className="px-2 pb-3">
              {runsLoading ? (
                <div className="space-y-1.5 px-1 pt-3">
                  {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-12 w-full rounded-md" />)}
                </div>
              ) : runs.length === 0 ? (
                <p className="px-2 pt-4 text-[11px] italic text-gray-400">No runs yet — pick an agent and start.</p>
              ) : filteredRuns.length === 0 ? (
                <div className="px-2 pt-4 text-center">
                  <p className="text-[11px] text-gray-500">No runs match.</p>
                  <button
                    onClick={() => {
                      setQuery("");
                      setAgentFilter("all");
                    }}
                    className="mt-1 text-[11px] font-medium text-rose-600 hover:underline"
                  >
                    Clear filters
                  </button>
                </div>
              ) : (
                groups.map((group) => (
                  <section key={group.label} className="pt-2">
                    {/* Headings stay in view while their runs scroll past. */}
                    <h3 className="sticky top-0 z-10 flex items-center justify-between bg-gray-50/95 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 backdrop-blur">
                      {group.label}
                      <span className="font-normal normal-case tracking-normal tabular-nums">{group.runs.length}</span>
                    </h3>
                    <div className="space-y-0.5">
                      {group.runs.map((run) => {
                        const agent = getAgent(run.agent_id);
                        const catColor = agent ? CATEGORY_COLORS[agent.category] : "bg-gray-100 text-gray-500 border-gray-200";
                        const isSelected = selectedRunId === run.id;
                        const text = run.input?.text?.trim();
                        return (
                          <button
                            key={run.id}
                            onClick={() => onSelectRun(run.id)}
                            aria-current={isSelected ? "true" : undefined}
                            className={cn(
                              "w-full rounded-lg border px-2 py-1.5 text-left transition-colors",
                              isSelected ? "border-rose-200 bg-rose-50" : "border-transparent hover:bg-white",
                            )}
                          >
                            <span className="flex items-center gap-1.5">
                              <span className={cn("shrink-0 rounded border px-1.5 text-[10px] font-medium leading-4", catColor)}>
                                {agent?.shortName ?? run.agent_id}
                              </span>
                              {run.mode === "revise" && <span className="text-[10px] text-gray-400">↩ revision</span>}
                              <span className="ml-auto shrink-0 text-[10px] tabular-nums text-gray-400">{runDateLabel(run.created_at)}</span>
                            </span>
                            {text && <span className="mt-1 line-clamp-2 text-[11px] leading-snug text-gray-600 [overflow-wrap:anywhere]">{text}</span>}
                          </button>
                        );
                      })}
                    </div>
                  </section>
                ))
              )}
            </div>
          </ScrollArea>
        </>
      )}
    </div>
  );
}
