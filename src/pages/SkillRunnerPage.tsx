import { useParams, useNavigate, Link } from "react-router-dom";
import { ArrowLeft, SearchX } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import SkillRunner from "@/components/skills/SkillRunner";
import SkillIcon from "@/components/skills/SkillIcon";
import { Badge } from "@/components/ui/badge";
import { getSkill, SKILL_CATEGORIES } from "@/data/skills";
import { useLanguage } from "@/hooks/useLanguage";
import { localizeSkill, translateSkillCategory } from "@/data/skillTranslations";
import { cn } from "@/lib/utils";

export default function SkillRunnerPage() {
  const { skillId } = useParams<{ skillId: string }>();
  const navigate = useNavigate();
  const { language, t } = useLanguage();

  const skill = skillId ? getSkill(skillId) : undefined;
  const localizedSkill = skill ? localizeSkill(skill, language) : undefined;

  if (!skill) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
            <SearchX size={22} />
          </span>
          <p className="text-muted-foreground text-sm mb-4">{t("skills.notFound")}</p>
          <Link to="/skills" className="text-primary text-sm underline">
            {t("skills.backToLibrary")}
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
        <div className="flex items-center gap-3 px-3 sm:px-4 py-2 sm:py-3 border-b bg-background shrink-0">
          <button
            onClick={() => navigate("/skills")}
            className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft size={13} />
            {t("skills.back")}
          </button>
          <span className="text-muted-foreground">/</span>
          <div className="flex min-w-0 items-center gap-2">
            <SkillIcon skill={skill} size="sm" />
            <span className="truncate text-sm font-medium">{localizedSkill?.name ?? skill.name}</span>
            {/* The runner repeats the category on a phone; the header keeps to one line there. */}
            <Badge
              variant="outline"
              className={cn("hidden sm:inline-flex shrink-0 text-[10px] px-1.5 py-0", categoryMeta.color)}
            >
              {translateSkillCategory(skill.category, language) ?? categoryMeta.label}
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
