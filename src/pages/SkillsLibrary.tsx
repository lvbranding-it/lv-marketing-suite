import { useEffect, useMemo, useRef, useState } from "react";
import { Search, X, LayoutGrid, Rows3, ArrowRight, History, Check, Compass } from "lucide-react";
import { useNavigate } from "react-router-dom";
import AppShell from "@/components/layout/AppShell";
import Header from "@/components/layout/Header";
import SkillGrid, { filterSkills } from "@/components/skills/SkillGrid";
import SkillCard, { type SkillLayout } from "@/components/skills/SkillCard";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useProjects } from "@/hooks/useProjects";
import { useSkillOutputs } from "@/hooks/useSkillOutputs";
import { SKILLS, SKILL_CATEGORIES, CATEGORY_ORDER, type SkillCategory } from "@/data/skills";
import { useLanguage } from "@/hooks/useLanguage";
import { translateSkillCategory } from "@/data/skillTranslations";

const LAYOUT_KEY = "lv-skills-layout";
/** How many recent outputs to read to work out what has been used lately. */
const RECENT_WINDOW = 60;
const RECENT_SHOWN = 4;

/** A density choice is a preference, so it outlives the visit that made it. */
function storedLayout(): SkillLayout {
  try {
    return localStorage.getItem(LAYOUT_KEY) === "list" ? "list" : "grid";
  } catch {
    return "grid";
  }
}

export default function SkillsLibrary() {
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<"all" | SkillCategory>("all");
  const [layout, setLayout] = useState<SkillLayout>(storedLayout);
  const searchRef = useRef<HTMLInputElement>(null);
  const { data: projects = [] } = useProjects();
  const { data: outputs = [] } = useSkillOutputs({ limit: RECENT_WINDOW });

  const hasContext = projects.some((p) => p.context_complete);

  useEffect(() => {
    try {
      localStorage.setItem(LAYOUT_KEY, layout);
    } catch {
      /* A refused store only costs the preference, not the page. */
    }
  }, [layout]);

  // "/" jumps to search, the convention anywhere a long list is searched. It
  // must not fire while someone is already typing somewhere else.
  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target?.tagName ?? "")) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  /** Skill id to when it was last run, for the recent window only. */
  const lastUsed = useMemo(() => {
    const seen: Record<string, string> = {};
    // The query returns newest first, so the first sighting is the latest run.
    for (const output of outputs) {
      if (output.skill_id && !seen[output.skill_id]) seen[output.skill_id] = output.created_at;
    }
    return seen;
  }, [outputs]);

  const recent = useMemo(
    () =>
      Object.keys(lastUsed)
        .map((id) => SKILLS.find((skill) => skill.id === id))
        .filter((skill): skill is (typeof SKILLS)[number] => !!skill && !skill.isFoundation)
        .slice(0, RECENT_SHOWN),
    [lastUsed],
  );

  const foundation = SKILLS.find((skill) => skill.isFoundation);
  const results = filterSkills(searchQuery, activeCategory, language);
  const filtering = !!searchQuery.trim() || activeCategory !== "all";
  const clearFilters = () => {
    setSearchQuery("");
    setActiveCategory("all");
  };

  const categories: Array<{ value: "all" | SkillCategory; label: string }> = [
    { value: "all", label: t("skills.all") },
    ...CATEGORY_ORDER.map((key) => ({
      value: key,
      label: translateSkillCategory(key, language) ?? SKILL_CATEGORIES[key].label,
    })),
  ];

  return (
    <AppShell>
      <Header
        title={t("skills.title")}
        subtitle={t("skills.subtitle", { count: SKILLS.length })}
      />

      <div className="mx-auto max-w-7xl px-3 pb-10 sm:px-6">
        {/* Filters stay reachable while 33 skills scroll past underneath. */}
        <div className="sticky top-0 z-10 -mx-3 border-b bg-background/95 px-3 py-3 backdrop-blur supports-[backdrop-filter]:bg-background/80 sm:-mx-6 sm:px-6">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search
                size={16}
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <Input
                ref={searchRef}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => e.key === "Escape" && setSearchQuery("")}
                placeholder={t("skills.searchPlaceholder")}
                aria-label={t("skills.searchPlaceholder")}
                className="h-10 pl-9 pr-9"
              />
              {searchQuery ? (
                <button
                  type="button"
                  onClick={() => {
                    setSearchQuery("");
                    searchRef.current?.focus();
                  }}
                  aria-label={t("skills.clearSearch")}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  <X size={14} />
                </button>
              ) : (
                <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded border px-1.5 text-[10px] text-muted-foreground sm:block">
                  /
                </kbd>
              )}
            </div>

            <div className="flex shrink-0 rounded-lg border p-0.5">
              {([
                ["grid", LayoutGrid, t("skills.viewGrid")],
                ["list", Rows3, t("skills.viewList")],
              ] as const).map(([value, Icon, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setLayout(value)}
                  aria-pressed={layout === value}
                  aria-label={label}
                  title={label}
                  className={cn(
                    "rounded-md p-1.5 transition-colors",
                    layout === value
                      ? "bg-[#CB2039] text-white"
                      : "text-muted-foreground hover:bg-muted",
                  )}
                >
                  <Icon size={15} />
                </button>
              ))}
            </div>
          </div>

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {categories.map(({ value, label }) => (
              <button
                key={value}
                type="button"
                onClick={() => setActiveCategory(value)}
                aria-pressed={activeCategory === value}
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs transition-colors",
                  activeCategory === value
                    ? "bg-[#CB2039] font-medium text-white"
                    : "text-muted-foreground hover:bg-muted",
                )}
              >
                {label}
              </button>
            ))}
            {filtering && (
              <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
                {t("skills.resultCount", { count: results.length, total: SKILLS.length })}
                <button
                  type="button"
                  onClick={clearFilters}
                  className="underline underline-offset-2 hover:text-foreground"
                >
                  {t("skills.clearFilters")}
                </button>
              </span>
            )}
          </div>
        </div>

        <div className="space-y-8 pt-5">
          {/* The prerequisite, and the recent work, only make sense against the
              whole library; once a filter is on, they are noise over results. */}
          {!filtering && foundation && (
            <button
              onClick={() => navigate("/projects")}
              className={cn(
                "group flex w-full items-center gap-4 rounded-xl border p-4 text-left transition-colors",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CB2039]/50 focus-visible:ring-offset-1",
                hasContext
                  ? "border-border bg-card hover:border-[#CB2039]/40"
                  : "border-amber-200 bg-amber-50/60 hover:border-amber-300",
              )}
            >
              {/* An icon rather than the emoji: the cards no longer carry one,
                  and a single emoji left on the page reads as a leftover. */}
              <span
                className={cn(
                  "flex h-10 w-10 shrink-0 items-center justify-center rounded-lg",
                  hasContext ? "bg-muted text-muted-foreground" : "bg-amber-100 text-amber-700",
                )}
              >
                {hasContext ? <Check size={18} /> : <Compass size={18} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[15px] font-semibold tracking-tight">
                  {hasContext ? t("skills.contextReady") : t("skills.contextMissing")}
                </span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                  {hasContext ? t("skills.contextReadyBody") : t("skills.contextMissingBody")}
                </span>
              </span>
              <ArrowRight
                size={16}
                className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              />
            </button>
          )}

          {!filtering && recent.length > 0 && (
            <section>
              <h2 className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <History size={13} />
                {t("skills.recentlyUsed")}
              </h2>
              {/* Follows the density choice: someone who asked for a list meant
                  the whole page, and the heading is what marks these as recent. */}
              <div
                className={cn(
                  layout === "list"
                    ? "space-y-1.5"
                    : "grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4",
                )}
              >
                {recent.map((skill) => (
                  <SkillCard
                    key={skill.id}
                    skill={skill}
                    hasContext={hasContext}
                    layout={layout}
                    lastUsed={lastUsed[skill.id]}
                  />
                ))}
              </div>
            </section>
          )}

          <SkillGrid
            searchQuery={searchQuery}
            activeCategory={activeCategory}
            hasContext={hasContext}
            layout={layout}
            lastUsed={lastUsed}
            onClearFilters={clearFilters}
            hideFoundation={!filtering && !!foundation}
          />
        </div>
      </div>
    </AppShell>
  );
}
