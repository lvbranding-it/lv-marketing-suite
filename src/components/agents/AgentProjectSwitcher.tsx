import { useState } from "react";
import { Check, ChevronsUpDown, FolderOpen, Plus } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { runDateLabel, type ProjectActivity } from "@/lib/agents/runHistory";

export interface SwitcherProject {
  id: string;
  name: string;
  client_name?: string | null;
}

const runsLabel = (count: number) => `${count} run${count === 1 ? "" : "s"}`;

/**
 * The current project, and the way to change it.
 *
 * Choosing a project is occasional and reading its runs is constant, so the
 * project list lives behind this one button instead of filling the sidebar. It
 * opens searchable, sorted by recent work, and closes itself on a pick — the
 * old list could be expanded and then not closed again.
 */
export default function AgentProjectSwitcher({
  projects,
  activity,
  selectedProjectId,
  onSelect,
  onNewProject,
}: {
  projects: SwitcherProject[];
  activity: Record<string, ProjectActivity>;
  selectedProjectId: string | null;
  onSelect: (id: string) => void;
  onNewProject: () => void;
}) {
  const [open, setOpen] = useState(false);
  const selected = projects.find((project) => project.id === selectedProjectId);
  const selectedRuns = selected ? activity[selected.id]?.runs ?? 0 : 0;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={selected ? `Current project: ${selected.name}. Change project` : "Choose a project"}
          className={cn(
            "group flex w-full items-center gap-2.5 rounded-lg border bg-white px-2.5 py-2 text-left shadow-sm transition-colors",
            "hover:border-rose-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-300",
            open ? "border-rose-300" : "border-gray-200",
          )}
        >
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-rose-50 text-rose-600">
            <FolderOpen size={14} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold leading-tight text-gray-900">
              {selected?.name ?? "Choose a project"}
            </span>
            <span className="mt-0.5 block truncate text-[11px] leading-tight text-gray-500">
              {selected
                ? [selected.client_name?.trim(), runsLabel(selectedRuns)].filter(Boolean).join(" · ")
                : `${projects.length} project${projects.length === 1 ? "" : "s"}`}
            </span>
          </span>
          <ChevronsUpDown size={14} className="shrink-0 text-gray-400 group-hover:text-gray-600" />
        </button>
      </PopoverTrigger>

      <PopoverContent align="start" sideOffset={6} className="w-[320px] p-0">
        <Command>
          <CommandInput placeholder="Search projects or clients…" />
          <CommandList className="max-h-[min(420px,60vh)]">
            <CommandEmpty>No project matches that.</CommandEmpty>
            <CommandGroup heading="Most recent work first">
              {projects.map((project) => {
                const entry = activity[project.id];
                const isSelected = project.id === selectedProjectId;
                return (
                  <CommandItem
                    key={project.id}
                    // Searchable by client as well as project name.
                    value={`${project.name} ${project.client_name ?? ""} ${project.id}`}
                    onSelect={() => {
                      onSelect(project.id);
                      setOpen(false);
                    }}
                    className="flex items-start gap-2 py-2"
                  >
                    <Check size={14} className={cn("mt-0.5 shrink-0 text-rose-600", isSelected ? "opacity-100" : "opacity-0")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-medium">{project.name}</span>
                      {project.client_name?.trim() && (
                        <span className="block truncate text-[11px] text-muted-foreground">{project.client_name}</span>
                      )}
                    </span>
                    <span className="shrink-0 pt-0.5 text-right text-[11px] tabular-nums text-muted-foreground">
                      {entry?.runs ? (
                        <>
                          {runsLabel(entry.runs)}
                          {entry.lastRun && <span className="block text-[10px] opacity-75">{runDateLabel(entry.lastRun)}</span>}
                        </>
                      ) : (
                        "No runs yet"
                      )}
                    </span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
            <CommandSeparator />
            <CommandGroup>
              <CommandItem
                value="new project create"
                onSelect={() => {
                  setOpen(false);
                  onNewProject();
                }}
                className="gap-2 py-2 text-[13px]"
              >
                <Plus size={14} className="text-rose-600" />
                New project
              </CommandItem>
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
