import { useNavigate } from "react-router-dom";
import { Zap, FolderOpen, BarChart3, Clock } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import Header from "@/components/layout/Header";
import SkillCard from "@/components/skills/SkillCard";
import ProjectCard from "@/components/projects/ProjectCard";
import SkillOutputCard from "@/components/skills/SkillOutputCard";
import { Skeleton } from "@/components/ui/skeleton";
import { useProjects } from "@/hooks/useProjects";
import { useSkillOutputs } from "@/hooks/useSkillOutputs";
import { SKILLS, FEATURED_SKILL_IDS } from "@/data/skills";
import { useAuth } from "@/hooks/useAuth";

function StatCard({
  icon: Icon,
  label,
  value,
  loading,
}: {
  icon: React.ElementType;
  label: string;
  value: string | number;
  loading?: boolean;
}) {
  return (
    <div className="bg-card border border-border rounded-lg p-4 flex items-center gap-3">
      <div className="bg-primary/10 rounded-lg p-2 shrink-0">
        <Icon size={16} className="text-primary" />
      </div>
      <div>
        {loading ? (
          <Skeleton className="h-5 w-12 mb-1" />
        ) : (
          <p className="text-lg font-bold text-foreground">{value}</p>
        )}
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { data: projects = [], isLoading: projectsLoading } = useProjects();
  const { data: recentOutputs = [], isLoading: outputsLoading } = useSkillOutputs({ limit: 5 });

  const activeProjects = projects.filter((p) => p.status === "active");
  const hasContext = projects.some((p) => p.context_complete);

  const featuredSkills = FEATURED_SKILL_IDS.map((id) =>
    SKILLS.find((s) => s.id === id)
  ).filter(Boolean);

  // Week's outputs
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekOutputs = recentOutputs.filter(
    (o) => new Date(o.created_at) >= weekAgo
  );

  const userName = user?.user_metadata?.full_name?.split(" ")[0] ?? "there";

  return (
    <AppShell>
      <Header
        title={`Hey ${userName} 👋`}
        subtitle="Here's your marketing workspace."
      />

      <div className="p-3 sm:p-6 space-y-4 sm:space-y-8 max-w-6xl mx-auto">
        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          <StatCard
            icon={BarChart3}
            label="Total Outputs"
            value={recentOutputs.length}
            loading={outputsLoading}
          />
          <StatCard
            icon={FolderOpen}
            label="Active Projects"
            value={activeProjects.length}
            loading={projectsLoading}
          />
          <StatCard
            icon={Zap}
            label="Skills Available"
            value={SKILLS.length}
          />
          <StatCard
            icon={Clock}
            label="This Week"
            value={weekOutputs.length}
            loading={outputsLoading}
          />
        </div>

        {/* Quick Start */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">Quick Start</h2>
            <button
              onClick={() => navigate("/skills")}
              className="text-xs text-primary hover:underline"
            >
              View all skills →
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
            {featuredSkills.map((skill) =>
              skill ? (
                <SkillCard key={skill.id} skill={skill} hasContext={hasContext} />
              ) : null
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8">
          {/* Recent Outputs */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground">Recent Outputs</h2>
              <button
                onClick={() => navigate("/history")}
                className="text-xs text-primary hover:underline"
              >
                View all →
              </button>
            </div>
            {outputsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
              </div>
            ) : recentOutputs.length === 0 ? (
              <div className="bg-muted/40 rounded-lg p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No outputs yet. Run a skill to get started!
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {recentOutputs.slice(0, 5).map((output) => (
                  <SkillOutputCard key={output.id} output={output} />
                ))}
              </div>
            )}
          </section>

          {/* Active Projects */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground">Active Projects</h2>
              <button
                onClick={() => navigate("/projects")}
                className="text-xs text-primary hover:underline"
              >
                View all →
              </button>
            </div>
            {projectsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
              </div>
            ) : activeProjects.length === 0 ? (
              <div className="bg-muted/40 rounded-lg p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No active projects. Create one to organize your outputs.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {activeProjects.slice(0, 3).map((project) => (
                  <ProjectCard key={project.id} project={project} />
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
