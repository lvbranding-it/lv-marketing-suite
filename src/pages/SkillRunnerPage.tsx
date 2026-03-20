import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import SkillRunner from "@/components/skills/SkillRunner";
import { Badge } from "@/components/ui/badge";
import { getSkill, SKILL_CATEGORIES } from "@/data/skills";
import { cn } from "@/lib/utils";

export default function SkillRunnerPage() {
  const { skillId } = useParams<{ skillId: string }>();
  const navigate = useNavigate();

  const skill = skillId ? getSkill(skillId) : undefined;

  if (!skill) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <p className="text-4xl mb-3">❓</p>
          <p className="text-muted-foreground text-sm mb-4">Skill not found.</p>
          <Link to="/skills" className="text-primary text-sm underline">
            Back to Skills Library
          </Link>
        </div>
      </AppShell>
    );
  }

  // Foundation skill → redirect to projects
  if (skill.isFoundation) {
    navigate("/projects");
    return null;
  }

  const categoryMeta = SKILL_CATEGORIES[skill.category];

  return (
    <AppShell>
      <div className="flex flex-col h-full">
        {/* Page header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b bg-background shrink-0">
          <button
            onClick={() => navigate("/skills")}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={13} />
            Skills
          </button>
          <span className="text-muted-foreground">/</span>
          <div className="flex items-center gap-2">
            <span className="text-lg">{skill.icon}</span>
            <span className="text-sm font-medium">{skill.name}</span>
            <Badge
              variant="outline"
              className={cn("text-[10px] px-1.5 py-0", categoryMeta.color)}
            >
              {categoryMeta.label}
            </Badge>
          </div>
        </div>

        {/* Runner — takes remaining height */}
        <div className="flex-1 min-h-0">
          <SkillRunner skill={skill} />
        </div>
      </div>
    </AppShell>
  );
}
