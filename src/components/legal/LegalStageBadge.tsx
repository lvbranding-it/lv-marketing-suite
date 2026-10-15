import { Ban, CheckCircle2, Clock3, Hourglass, PenLine } from "lucide-react";
import { cn } from "@/lib/utils";
import { STAGE_LABELS, type LegalStage } from "@/lib/legal/status";

const STAGE_STYLE: Record<LegalStage, { icon: typeof Ban; className: string }> = {
  countersign: { icon: PenLine, className: "border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-300" },
  waiting: { icon: Hourglass, className: "border-sky-500/30 bg-sky-500/10 text-sky-800 dark:text-sky-300" },
  completed: { icon: CheckCircle2, className: "border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300" },
  expired: { icon: Clock3, className: "border-destructive/30 bg-destructive/10 text-destructive" },
  voided: { icon: Ban, className: "border-border bg-muted text-muted-foreground" },
};

export default function LegalStageBadge({ stage, className }: { stage: LegalStage; className?: string }) {
  const { icon: Icon, className: tone } = STAGE_STYLE[stage];
  return (
    <span className={cn("inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium", tone, className)}>
      <Icon className="h-3 w-3" />
      {STAGE_LABELS[stage]}
    </span>
  );
}
