import { useNavigate } from "react-router-dom";
import { useState } from "react";
import { Zap, FolderOpen, BarChart3, Clock, MapPin, Megaphone } from "lucide-react";
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
import { useLanguage } from "@/hooks/useLanguage";
import BranchSelect from "@/components/branches/BranchSelect";
import {
  branchMatchesFilter,
  formatBranchLocalTime,
  getBranchFlag,
  useAccessibleBranches,
  type BranchFilterValue,
} from "@/hooks/useBranches";

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
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [branchFilter, setBranchFilter] = useState<BranchFilterValue>("all");
  const { data: projects = [], isLoading: projectsLoading } = useProjects();
  const { data: recentOutputs = [], isLoading: outputsLoading } = useSkillOutputs({ limit: 5 });
  const { data: accessibleBranches = [] } = useAccessibleBranches();
  const selectedBranch = accessibleBranches.find((branch) => branch.id === branchFilter) ?? null;

  const visibleProjects = projects.filter((p) => branchMatchesFilter(p.branch_id, branchFilter));
  const visibleOutputs = recentOutputs.filter((o) => branchMatchesFilter(o.branch_id, branchFilter));
  const activeProjects = visibleProjects.filter((p) => p.status === "active");
  const hasContext = projects.some((p) => p.context_complete);

  const featuredSkills = FEATURED_SKILL_IDS.map((id) =>
    SKILLS.find((s) => s.id === id)
  ).filter(Boolean);

  // Week's outputs
  const weekAgo = new Date();
  weekAgo.setDate(weekAgo.getDate() - 7);
  const weekOutputs = visibleOutputs.filter(
    (o) => new Date(o.created_at) >= weekAgo
  );

  const userName = user?.user_metadata?.full_name?.split(" ")[0] ?? "there";

  return (
    <AppShell>
      <Header
        title={t("dashboard.greeting", { name: userName })}
        subtitle={t("dashboard.subtitle")}
      />

      <div className="p-3 sm:p-6 space-y-4 sm:space-y-8 max-w-6xl mx-auto">
        <div className="flex justify-end">
          <BranchSelect value={branchFilter} onValueChange={setBranchFilter} />
        </div>

        {selectedBranch && (
          <div className="rounded-lg border border-border bg-card p-4">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  {getBranchFlag(selectedBranch) && (
                    <span className="text-xl leading-none" aria-hidden="true">
                      {getBranchFlag(selectedBranch)}
                    </span>
                  )}
                  <h2 className="truncate text-sm font-semibold text-foreground">
                    {selectedBranch.name}
                  </h2>
                  {selectedBranch.code && (
                    <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                      {selectedBranch.code}
                    </span>
                  )}
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span className="inline-flex items-center gap-1">
                    <MapPin size={11} />
                    {[selectedBranch.city, selectedBranch.country].filter(Boolean).join(", ")}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Clock size={11} />
                    {formatBranchLocalTime(selectedBranch.timezone)}
                  </span>
                </div>
              </div>
            </div>
            {selectedBranch.notification_banner?.trim() && (
              <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-3 text-xs text-foreground">
                <div className="flex items-start gap-2">
                  <Megaphone size={14} className="mt-0.5 shrink-0 text-primary" />
                  <p className="leading-relaxed">{selectedBranch.notification_banner}</p>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          <StatCard
            icon={BarChart3}
            label={t("dashboard.totalOutputs")}
            value={visibleOutputs.length}
            loading={outputsLoading}
          />
          <StatCard
            icon={FolderOpen}
            label={t("dashboard.activeProjects")}
            value={activeProjects.length}
            loading={projectsLoading}
          />
          <StatCard
            icon={Zap}
            label={t("dashboard.skillsAvailable")}
            value={SKILLS.length}
          />
          <StatCard
            icon={Clock}
            label={t("dashboard.thisWeek")}
            value={weekOutputs.length}
            loading={outputsLoading}
          />
        </div>

        {/* Quick Start */}
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">{t("dashboard.quickStart")}</h2>
            <button
              onClick={() => navigate("/skills")}
              className="text-xs text-primary hover:underline"
            >
              {t("dashboard.viewAllSkills")} →
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
              <h2 className="text-sm font-semibold text-foreground">{t("dashboard.recentOutputs")}</h2>
              <button
                onClick={() => navigate("/history")}
                className="text-xs text-primary hover:underline"
              >
                {t("dashboard.viewAll")} →
              </button>
            </div>
            {outputsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
              </div>
            ) : visibleOutputs.length === 0 ? (
              <div className="bg-muted/40 rounded-lg p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  {t("dashboard.noOutputs")}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {visibleOutputs.slice(0, 5).map((output) => (
                  <SkillOutputCard key={output.id} output={output} />
                ))}
              </div>
            )}
          </section>

          {/* Active Projects */}
          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold text-foreground">{t("dashboard.activeProjects")}</h2>
              <button
                onClick={() => navigate("/projects")}
                className="text-xs text-primary hover:underline"
              >
                {t("dashboard.viewAll")} →
              </button>
            </div>
            {projectsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-24 w-full" />)}
              </div>
            ) : activeProjects.length === 0 ? (
              <div className="bg-muted/40 rounded-lg p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  {t("dashboard.noProjects")}
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
