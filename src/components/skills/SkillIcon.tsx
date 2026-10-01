import { FileText } from "lucide-react";
import { SKILL_CATEGORIES, type Skill } from "@/data/skills";
import { cn } from "@/lib/utils";

const BOX = {
  sm: "h-6 w-6 rounded-md",
  md: "h-8 w-8 rounded-lg",
  lg: "h-14 w-14 rounded-2xl",
} as const;

const GLYPH = { sm: 13, md: 16, lg: 26 } as const;

/**
 * A skill's icon on its category's tint — the same colors as its category
 * badge. Without a skill (a saved output whose skill no longer exists) it
 * shows a plain document.
 */
export default function SkillIcon({
  skill,
  size = "md",
  className,
}: {
  skill?: Skill | null;
  size?: keyof typeof BOX;
  className?: string;
}) {
  const Icon = skill?.icon ?? FileText;
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center border",
        skill ? SKILL_CATEGORIES[skill.category].color : "border-border bg-muted text-muted-foreground",
        BOX[size],
        className,
      )}
    >
      <Icon size={GLYPH[size]} />
    </span>
  );
}
