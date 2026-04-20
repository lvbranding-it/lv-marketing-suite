import { useState } from "react";
import { Plus } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import Header from "@/components/layout/Header";
import ProjectCard from "@/components/projects/ProjectCard";
import CreateProjectDialog from "@/components/projects/CreateProjectDialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjects } from "@/hooks/useProjects";
import { useSkillOutputs } from "@/hooks/useSkillOutputs";
import BranchSelect from "@/components/branches/BranchSelect";
import { branchMatchesFilter, type BranchFilterValue } from "@/hooks/useBranches";

export default function Projects() {
  const [createOpen, setCreateOpen] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [branchFilter, setBranchFilter] = useState<BranchFilterValue>("all");
  const { data: projects = [], isLoading } = useProjects();
  const { data: allOutputs = [] } = useSkillOutputs();

  const outputCountByProject = allOutputs.reduce<Record<string, number>>((acc, o) => {
    if (o.project_id) acc[o.project_id] = (acc[o.project_id] ?? 0) + 1;
    return acc;
  }, {});

  const filtered =
    projects.filter((p) =>
      (statusFilter === "all" || p.status === statusFilter) &&
      branchMatchesFilter(p.branch_id, branchFilter)
    );

  return (
    <AppShell>
      <Header
        title="Projects"
        subtitle={`${projects.length} project${projects.length !== 1 ? "s" : ""}`}
        actions={
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus size={14} className="mr-1.5" />
            New Project
          </Button>
        }
      />

      <div className="p-3 sm:p-6 max-w-6xl mx-auto space-y-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <Tabs value={statusFilter} onValueChange={setStatusFilter}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="paused">Paused</TabsTrigger>
              <TabsTrigger value="archived">Archived</TabsTrigger>
            </TabsList>
          </Tabs>
          <BranchSelect value={branchFilter} onValueChange={setBranchFilter} />
        </div>

        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
            {[1, 2, 3].map((i) => <Skeleton key={i} className="h-36 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-4xl mb-3">📁</p>
            <p className="text-muted-foreground text-sm mb-4">
              {statusFilter === "all"
                ? "No projects yet."
                : `No ${statusFilter} projects.`}
            </p>
            {statusFilter === "all" && (
              <Button onClick={() => setCreateOpen(true)}>
                <Plus size={14} className="mr-1.5" />
                Create First Project
              </Button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-3">
            {filtered.map((project) => (
              <ProjectCard
                key={project.id}
                project={project}
                outputCount={outputCountByProject[project.id] ?? 0}
              />
            ))}
          </div>
        )}
      </div>

      <CreateProjectDialog open={createOpen} onClose={() => setCreateOpen(false)} />
    </AppShell>
  );
}
