import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { type Skill, SKILL_CATEGORIES, CATEGORY_BORDER_COLORS } from "@/data/skills";
import { useLanguage } from "@/hooks/useLanguage";
import { localizeSkill, translateSkillCategory } from "@/data/skillTranslations";

interface SkillCardProps {
  skill: Skill;
  hasContext?: boolean;
}

export default function SkillCard({ skill, hasContext = false }: SkillCardProps) {
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const localizedSkill = localizeSkill(skill, language);
  const categoryMeta = SKILL_CATEGORIES[skill.category];

  const handleClick = () => {
    if (skill.isFoundation) {
      navigate("/projects");
    } else {
      navigate(`/skills/${skill.id}`);
    }
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "group text-left w-full bg-card border border-border rounded-lg p-3 sm:p-4 transition-all duration-150",
        "hover:shadow-md hover:border-primary/30 hover:-translate-y-0.5",
        "border-t-[3px]",
        CATEGORY_BORDER_COLORS[skill.category]
      )}
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <span className="text-2xl leading-none">{skill.icon}</span>
        {skill.isFoundation && (
          <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 border border-amber-200">
            {t("skills.setupFirst")}
          </span>
        )}
        {!skill.isFoundation && !hasContext && (
          <span className="text-[10px] font-medium text-muted-foreground/60">{t("skills.noContext")}</span>
        )}
      </div>

      <h3 className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors leading-tight mb-1">
        {localizedSkill.name}
      </h3>

      <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">
        {localizedSkill.description}
      </p>

      <div className="mt-3">
        <Badge
          variant="outline"
          className={cn("text-[10px] px-2 py-0.5 border", categoryMeta.color)}
        >
          {translateSkillCategory(skill.category, language) ?? categoryMeta.label}
        </Badge>
      </div>
    </button>
  );
}
