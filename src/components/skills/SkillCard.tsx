import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { cn } from "@/lib/utils";
import { type Skill, CATEGORY_RAIL_COLORS } from "@/data/skills";
import { useLanguage } from "@/hooks/useLanguage";
import { localizeSkill } from "@/data/skillTranslations";

export type SkillLayout = "grid" | "list";

interface SkillCardProps {
  skill: Skill;
  hasContext?: boolean;
  layout?: SkillLayout;
  /** When this skill was last run, if it was run recently enough to know. */
  lastUsed?: string;
}

/** How many answers a skill asks for before it can run. */
export const requiredInputs = (skill: Skill) =>
  skill.contextFields.filter((field) => field.required).length;

/**
 * One skill, as a card or as a row.
 *
 * The category used to be stated three times on this page: the section heading,
 * a coloured border, and a badge on every card. Only the rail survives here,
 * which leaves the card's own words to say something the heading did not.
 */
export default function SkillCard({
  skill,
  hasContext = false,
  layout = "grid",
  lastUsed,
}: SkillCardProps) {
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const localized = localizeSkill(skill, language);
  const inputs = requiredInputs(skill);
  // Nine of the skills ask for exactly one thing, so "1 answers" would be on
  // more than a quarter of the cards. The interpolator has no plural rules.
  const inputLabel =
    inputs === 1 ? t("skills.inputNeeded") : t("skills.inputsNeeded", { count: inputs });

  // The foundation skill is set up in Projects; it is not run like the others.
  const open = () => navigate(skill.isFoundation ? "/projects" : `/skills/${skill.id}`);

  const shell = cn(
    "group relative w-full text-left bg-card border border-border overflow-hidden",
    "transition-[border-color,box-shadow,transform] duration-150",
    "hover:border-[#CB2039]/40 hover:shadow-[0_2px_12px_-4px_rgba(35,31,32,0.18)]",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#CB2039]/50 focus-visible:ring-offset-1",
  );

  /** The one place the category is still encoded on a card. */
  const rail = (
    <span
      aria-hidden
      className={cn("absolute inset-y-0 left-0 w-[3px]", CATEGORY_RAIL_COLORS[skill.category])}
    />
  );

  const meta = [
    skill.isFoundation ? t("skills.setupFirst") : null,
    !skill.isFoundation && inputs > 0 ? inputLabel : null,
    lastUsed
      ? t("skills.lastRun", {
          when: formatDistanceToNow(new Date(lastUsed), { addSuffix: true }),
        })
      : null,
  ].filter(Boolean) as string[];

  if (layout === "list") {
    return (
      <button onClick={open} className={cn(shell, "flex items-center gap-3 rounded-lg py-2.5 pl-5 pr-3")}>
        {rail}
        <span className="text-xl leading-none shrink-0">{skill.icon}</span>
        {/* Stacked on a phone, side by side once there is room. Hiding the
            description below sm left a list of bare names, which is the one
            thing a denser view must not cost. */}
        <span className="min-w-0 flex-1 sm:flex sm:items-baseline sm:gap-2">
          <span className="block truncate text-sm font-semibold leading-tight transition-colors group-hover:text-[#CB2039] sm:shrink-0">
            {localized.name}
          </span>
          <span className="block truncate text-xs text-muted-foreground">
            {localized.description}
          </span>
        </span>
        {meta.length > 0 && (
          <span className="hidden shrink-0 text-[11px] text-muted-foreground md:inline">{meta[0]}</span>
        )}
        <ChevronRight
          size={16}
          className="shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5 group-hover:text-[#CB2039]"
        />
      </button>
    );
  }

  return (
    <button onClick={open} className={cn(shell, "flex h-full flex-col rounded-xl p-4 pl-5")}>
      {rail}
      <span className="mb-2.5 flex items-start justify-between gap-2">
        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-muted text-xl leading-none">
          {skill.icon}
        </span>
        {skill.isFoundation ? (
          <span className="rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-700">
            {t("skills.setupFirst")}
          </span>
        ) : (
          !hasContext && (
            <span className="text-[10px] font-medium text-muted-foreground/60">
              {t("skills.noContext")}
            </span>
          )
        )}
      </span>

      <h3 className="mb-1 text-sm font-semibold leading-tight text-foreground transition-colors group-hover:text-[#CB2039]">
        {localized.name}
      </h3>
      <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
        {localized.description}
      </p>

      {/* Pushed to the bottom so cards of differing description length still
          line their footers up, which is what makes a grid scannable. */}
      <span className="mt-auto flex items-center gap-2 pt-3 text-[11px] text-muted-foreground">
        {!skill.isFoundation && inputs > 0 && <span>{inputLabel}</span>}
        {lastUsed && (
          <span className="ml-auto truncate text-muted-foreground/70">
            {t("skills.lastRun", {
              when: formatDistanceToNow(new Date(lastUsed), { addSuffix: true }),
            })}
          </span>
        )}
      </span>
    </button>
  );
}
