import { SKILLS, SKILL_CATEGORIES, type SkillCategory, type Skill } from "@/data/skills";
import SkillCard from "./SkillCard";

interface SkillGridProps {
  searchQuery?: string;
  activeCategory?: SkillCategory | "all";
  hasContext?: boolean;
}

export default function SkillGrid({
  searchQuery = "",
  activeCategory = "all",
  hasContext = false,
}: SkillGridProps) {
  const q = searchQuery.toLowerCase().trim();

  const filtered = SKILLS.filter((skill) => {
    const matchesCategory =
      activeCategory === "all" || skill.category === activeCategory;
    const matchesSearch =
      !q ||
      skill.name.toLowerCase().includes(q) ||
      skill.description.toLowerCase().includes(q) ||
      skill.category.toLowerCase().includes(q);
    return matchesCategory && matchesSearch;
  });

  if (filtered.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
        <p className="text-4xl mb-3">🔍</p>
        <p className="text-muted-foreground text-sm">No skills match your search.</p>
      </div>
    );
  }

  // Group by category for "all" view
  if (activeCategory === "all") {
    const grouped: Partial<Record<SkillCategory, Skill[]>> = {};
    for (const skill of filtered) {
      if (!grouped[skill.category]) grouped[skill.category] = [];
      grouped[skill.category]!.push(skill);
    }

    // Category order
    const categoryOrder: SkillCategory[] = [
      "foundation",
      "conversion",
      "content",
      "seo",
      "paid",
      "measurement",
      "retention",
      "growth",
      "strategy",
      "sales",
    ];

    return (
      <div className="space-y-8">
        {categoryOrder.map((cat) => {
          const skills = grouped[cat];
          if (!skills || skills.length === 0) return null;
          return (
            <section key={cat}>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                {SKILL_CATEGORIES[cat].label}
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3">
                {skills.map((skill) => (
                  <SkillCard key={skill.id} skill={skill} hasContext={hasContext} />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2 sm:gap-3">
      {filtered.map((skill) => (
        <SkillCard key={skill.id} skill={skill} hasContext={hasContext} />
      ))}
    </div>
  );
}
