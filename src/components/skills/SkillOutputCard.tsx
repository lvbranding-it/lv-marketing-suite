import { Star, Trash2, ExternalLink, FileDown, FileText } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useUpdateSkillOutput, useDeleteSkillOutput } from "@/hooks/useSkillOutputs";
import { getSkill, SKILL_CATEGORIES } from "@/data/skills";
import { useLanguage } from "@/hooks/useLanguage";
import { localizeSkill } from "@/data/skillTranslations";
import type { SkillOutputRow } from "@/integrations/supabase/types";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

interface SkillOutputCardProps {
  output: SkillOutputRow;
  onDownloadPdf?: (output: SkillOutputRow) => void;
  onDownloadWord?: (output: SkillOutputRow) => void;
}

export default function SkillOutputCard({ output, onDownloadPdf, onDownloadWord }: SkillOutputCardProps) {
  const navigate = useNavigate();
  const { language, t } = useLanguage();
  const updateOutput = useUpdateSkillOutput();
  const deleteOutput = useDeleteSkillOutput();

  const skill = getSkill(output.skill_id);
  const localizedSkill = skill ? localizeSkill(skill, language) : null;
  const categoryMeta = skill ? SKILL_CATEGORIES[skill.category] : null;
  const timeAgo = formatDistanceToNow(new Date(output.created_at), {
    addSuffix: true,
    locale: language === "es" ? es : undefined,
  });

  const handleStar = (e: React.MouseEvent) => {
    e.stopPropagation();
    updateOutput.mutate({ id: output.id, is_starred: !output.is_starred });
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm(t("skills.deleteOutputConfirm"))) {
      deleteOutput.mutate(output.id);
    }
  };

  const handleOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/outputs/${output.id}`);
  };

  const handleDownloadPdf = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDownloadPdf?.(output);
  };

  const handleDownloadWord = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDownloadWord?.(output);
  };

  return (
    <div
      onClick={() => navigate(`/outputs/${output.id}`)}
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
              {localizedSkill?.name ?? output.skill_name}
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
          <Button
            variant="ghost"
            size="icon"
            className="h-7 w-7 text-muted-foreground"
            onClick={handleOpen}
            title={t("skills.openFullPage")}
          >
            <ExternalLink size={13} />
          </Button>
          {onDownloadPdf && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              onClick={handleDownloadPdf}
              title="Download print-ready PDF"
            >
              <FileDown size={13} />
            </Button>
          )}
          {onDownloadWord && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground"
              onClick={handleDownloadWord}
              title="Download Word document"
            >
              <FileText size={13} />
            </Button>
          )}
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
  );
}
