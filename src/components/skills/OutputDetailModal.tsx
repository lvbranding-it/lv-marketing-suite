import { Star, Trash2, Copy, X } from "lucide-react";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useUpdateSkillOutput, useDeleteSkillOutput } from "@/hooks/useSkillOutputs";
import { getSkill, SKILL_CATEGORIES } from "@/data/skills";
import type { SkillOutputRow } from "@/integrations/supabase/types";
import { formatDistanceToNow } from "date-fns";
import { useToast } from "@/hooks/use-toast";

interface OutputDetailModalProps {
  output: SkillOutputRow;
  open: boolean;
  onClose: () => void;
}

export default function OutputDetailModal({ output, open, onClose }: OutputDetailModalProps) {
  const { toast } = useToast();
  const updateOutput = useUpdateSkillOutput();
  const deleteOutput = useDeleteSkillOutput();

  const skill = getSkill(output.skill_id);
  const categoryMeta = skill ? SKILL_CATEGORIES[skill.category] : null;
  const timeAgo = formatDistanceToNow(new Date(output.created_at), { addSuffix: true });

  const handleCopy = () => {
    navigator.clipboard.writeText(output.output_text);
    toast({ description: "Copied to clipboard!" });
  };

  const handleStar = () => {
    updateOutput.mutate({ id: output.id, is_starred: !output.is_starred });
  };

  const handleDelete = () => {
    if (confirm("Delete this output?")) {
      deleteOutput.mutate(output.id);
      onClose();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl h-[80vh] flex flex-col p-0">
        <DialogHeader className="px-6 pt-6 pb-4 border-b shrink-0">
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1 flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-lg">{skill?.icon ?? "📄"}</span>
                {categoryMeta && (
                  <Badge
                    variant="outline"
                    className={cn("text-[10px]", categoryMeta.color)}
                  >
                    {skill?.name ?? output.skill_name}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">{timeAgo}</span>
              </div>
              <DialogTitle className="text-base">
                {output.title ?? "Untitled Output"}
              </DialogTitle>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleStar}
              >
                <Star
                  size={14}
                  className={cn(
                    output.is_starred ? "fill-amber-400 text-amber-400" : "text-muted-foreground"
                  )}
                />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopy}>
                <Copy size={14} className="text-muted-foreground" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={handleDelete}
              >
                <Trash2 size={14} />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onClose}>
                <X size={14} className="text-muted-foreground" />
              </Button>
            </div>
          </div>
        </DialogHeader>

        <ScrollArea className="flex-1 px-6 py-4">
          <MarkdownContent>{output.output_text}</MarkdownContent>
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
