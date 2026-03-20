import { useState } from "react";
import { Star, Trash2, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useUpdateSkillOutput, useDeleteSkillOutput } from "@/hooks/useSkillOutputs";
import { getSkill, SKILL_CATEGORIES } from "@/data/skills";
import type { SkillOutputRow } from "@/integrations/supabase/types";
import { formatDistanceToNow } from "date-fns";
import OutputDetailModal from "./OutputDetailModal";

interface SkillOutputCardProps {
  output: SkillOutputRow;
}

export default function SkillOutputCard({ output }: SkillOutputCardProps) {
  const [showDetail, setShowDetail] = useState(false);
  const updateOutput = useUpdateSkillOutput();
  const deleteOutput = useDeleteSkillOutput();

  const skill = getSkill(output.skill_id);
  const categoryMeta = skill ? SKILL_CATEGORIES[skill.category] : null;
  const timeAgo = formatDistanceToNow(new Date(output.created_at), { addSuffix: true });

  const handleStar = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateOutput.mutate({ id: output.id, is_starred: !output.is_starred });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Delete this output?")) {
      deleteOutput.mutate(output.id);
    }
  };

  return (
    <>
      <div
        onClick={() => setShowDetail(true)}
        className="group bg-card border border-border rounded-lg p-4 cursor-pointer hover:shadow-sm hover:border-primary/30 transition-all"
      >
        <div className="flex items-start justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-lg">{skill?.icon ?? "📄"}</span>
            {categoryMeta && (
              <Badge
                variant="outline"
                className={cn("text-[10px] px-1.5 py-0", categoryMeta.color)}
              >
                {skill?.name ?? output.skill_name}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={handleStar}
            >
              <Star
                size={13}
                className={cn(
                  output.is_starred ? "fill-amber-400 text-amber-400" : "text-muted-foreground"
                )}
              />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={handleDelete}
            >
              <Trash2 size={13} />
            </Button>
            <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
              <ExternalLink size={13} />
            </Button>
          </div>
        </div>

        {output.title && (
          <p className="text-sm font-medium text-foreground mb-1">{output.title}</p>
        )}

        <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
          {output.output_text}
        </p>

        <p className="text-[11px] text-muted-foreground/60 mt-2">{timeAgo}</p>
      </div>

      <OutputDetailModal
        output={output}
        open={showDetail}
        onClose={() => setShowDetail(false)}
      />
    </>
  );
}
