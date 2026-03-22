import { useState } from "react";
import { Search } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import Header from "@/components/layout/Header";
import SkillOutputCard from "@/components/skills/SkillOutputCard";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useSkillOutputs } from "@/hooks/useSkillOutputs";
import { useProjects } from "@/hooks/useProjects";
import { SKILLS } from "@/data/skills";

export default function History() {
  const [searchQuery, setSearchQuery] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [skillFilter, setSkillFilter] = useState<string>("all");

  const { data: outputs = [], isLoading } = useSkillOutputs({
    projectId: projectFilter !== "all" ? projectFilter : undefined,
    skillId: skillFilter !== "all" ? skillFilter : undefined,
  });

  const { data: projects = [] } = useProjects();

  const filtered = outputs.filter((o) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      o.output_text.toLowerCase().includes(q) ||
      o.skill_name.toLowerCase().includes(q) ||
      (o.title?.toLowerCase().includes(q) ?? false)
    );
  });

  return (
    <AppShell>
      <Header
        title="Output History"
        subtitle={`${filtered.length} output${filtered.length !== 1 ? "s" : ""}`}
      />

      <div className="p-3 sm:p-6 max-w-5xl mx-auto space-y-4">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-2">
          <div className="relative flex-1">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search outputs..."
              className="pl-9 h-9"
            />
          </div>
          <Select value={projectFilter} onValueChange={setProjectFilter}>
            <SelectTrigger className="h-9 w-full sm:w-44 text-sm">
              <SelectValue placeholder="All projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={skillFilter} onValueChange={setSkillFilter}>
            <SelectTrigger className="h-9 w-full sm:w-44 text-sm">
              <SelectValue placeholder="All skills" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All skills</SelectItem>
              {SKILLS.filter((s) => !s.isFoundation).map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.icon} {s.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* Outputs */}
        {isLoading ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
            {[1, 2, 3, 4, 5, 6].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-20 text-center">
            <p className="text-4xl mb-3">📭</p>
            <p className="text-muted-foreground text-sm">
              {searchQuery || projectFilter !== "all" || skillFilter !== "all"
                ? "No outputs match your filters."
                : "No outputs saved yet. Run a skill and save your results!"}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
            {filtered.map((output) => (
              <SkillOutputCard key={output.id} output={output} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
