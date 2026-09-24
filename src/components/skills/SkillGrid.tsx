import { SearchX } from "lucide-react";
import {
  SKILLS,
  SKILL_CATEGORIES,
  CATEGORY_ORDER,
  CATEGORY_RAIL_COLORS,
  type SkillCategory,
  type Skill,
} from "@/data/skills";
import { useLanguage, type Language } from "@/hooks/useLanguage";
import { localizeSkill, translateSkillCategory } from "@/data/skillTranslations";
import { Button } from "@/components/ui/button";
import SkillCard, { type SkillLayout } from "./SkillCard";

interface SkillGridProps {
  searchQuery?: string;
  activeCategory?: SkillCategory | "all";
  hasContext?: boolean;
  layout?: SkillLayout;
  /** Skill id to the time it was last run, for the skills run recently. */
  lastUsed?: Record<string, string>;
  onClearFilters?: () => void;
  /**
   * Leaves the foundation skill out, for when the page is already showing it as
   * the prerequisite strip. It stays in the list whenever someone is searching,
   * because a skill you are looking for by name must be findable by name.
   */
  hideFoundation?: boolean;
}

/** Everything a search looks at, in both languages, lowercased once. */
function haystack(skill: Skill, language: Language) {
  const localized = localizeSkill(skill, language);
  return [
    skill.name,
    skill.description,
    skill.category,
    SKILL_CATEGORIES[skill.category].label,
    localized.name,
    localized.description,
    translateSkillCategory(skill.category, language) ?? "",
  ]
    .join(" ")
    .toLowerCase();
}

export function filterSkills(
  searchQuery: string,
  activeCategory: SkillCategory | "all",
  language: Language,
): Skill[] {
  const q = searchQuery.toLowerCase().trim();
  return SKILLS.filter((skill) => {
    if (activeCategory !== "all" && skill.category !== activeCategory) return false;
    return !q || haystack(skill, language).includes(q);
  });
}

export default function SkillGrid({
  searchQuery = "",
  activeCategory = "all",
  hasContext = false,
  layout = "grid",
  lastUsed = {},
  onClearFilters,
  hideFoundation = false,
}: SkillGridProps) {
  const { language, t } = useLanguage();
  const matched = filterSkills(searchQuery, activeCategory, language);
  const filtered = hideFoundation ? matched.filter((skill) => !skill.isFoundation) : matched;

  const body = (skills: Skill[]) =>
    layout === "list" ? (
      <div className="space-y-1.5">
        {skills.map((skill) => (
          <SkillCard
            key={skill.id}
            skill={skill}
            hasContext={hasContext}
            layout="list"
            lastUsed={lastUsed[skill.id]}
          />
        ))}
      </div>
    ) : (
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {skills.map((skill) => (
          <SkillCard
            key={skill.id}
            skill={skill}
            hasContext={hasContext}
            layout="grid"
            lastUsed={lastUsed[skill.id]}
          />
        ))}
      </div>
    );

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed px-4 py-16 text-center">
        <SearchX size={28} className="mb-3 text-muted-foreground/50" />
        <p className="text-sm font-medium">{t("skills.noMatch")}</p>
        {onClearFilters && (
          <Button variant="outline" size="sm" className="mt-4" onClick={onClearFilters}>
            {t("skills.clearFilters")}
          </Button>
        )}
      </div>
    );
  }

  // A single category is already named by the chip above, so it gets no heading.
  if (activeCategory !== "all") return body(filtered);

  const grouped = new Map<SkillCategory, Skill[]>();
  for (const skill of filtered) {
    const bucket = grouped.get(skill.category) ?? [];
    bucket.push(skill);
    grouped.set(skill.category, bucket);
  }

  return (
    <div className="space-y-8">
      {CATEGORY_ORDER.map((category) => {
        const skills = grouped.get(category);
        if (!skills?.length) return null;
        return (
          <section key={category} id={`skills-${category}`} className="scroll-mt-32">
            <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              <span aria-hidden className={`h-2 w-2 rounded-full ${CATEGORY_RAIL_COLORS[category]}`} />
              {translateSkillCategory(category, language) ?? SKILL_CATEGORIES[category].label}
              <span className="font-normal normal-case tracking-normal text-muted-foreground/60">
                {skills.length}
              </span>
            </h2>
            {body(skills)}
          </section>
        );
      })}
    </div>
  );
}
