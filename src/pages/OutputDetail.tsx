import { useParams, useNavigate } from "react-router-dom";
import { ArrowLeft, Star, Trash2, Copy, Zap } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSkillOutput, useUpdateSkillOutput, useDeleteSkillOutput } from "@/hooks/useSkillOutputs";
import { useProject } from "@/hooks/useProjects";
import { getSkill, SKILL_CATEGORIES } from "@/data/skills";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

export default function OutputDetail() {
  const { outputId } = useParams<{ outputId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();

  const { data: output, isLoading } = useSkillOutput(outputId);
  const { data: project } = useProject(output?.project_id ?? undefined);
  const updateOutput = useUpdateSkillOutput();
  const deleteOutput = useDeleteSkillOutput();

  const skill = output ? getSkill(output.skill_id) : null;
  const categoryMeta = skill ? SKILL_CATEGORIES[skill.category] : null;

  const handleCopy = () => {
    if (!output) return;
    navigator.clipboard.writeText(output.output_text);
    toast({ description: "Copied to clipboard!" });
  };

  const handleStar = () => {
    if (!output) return;
    updateOutput.mutate({ id: output.id, is_starred: !output.is_starred });
  };

  const handleDelete = () => {
    if (!output) return;
    if (confirm("Delete this output? This cannot be undone.")) {
      deleteOutput.mutate(output.id, {
        onSuccess: () => {
          if (output.project_id) {
            navigate(`/projects/${output.project_id}`);
          } else {
            navigate("/history");
          }
        },
      });
    }
  };

  const handleRunAgain = () => {
    if (!output) return;
    navigate(`/skills/${output.skill_id}`, {
      state: { projectId: output.project_id },
    });
  };

  const handleBack = () => {
    if (output?.project_id) {
      navigate(`/projects/${output.project_id}`);
    } else {
      navigate("/history");
    }
  };

  if (isLoading) {
    return (
      <AppShell>
        <div className="p-3 sm:p-6 max-w-4xl mx-auto space-y-4">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-8 w-96" />
          <Skeleton className="h-[60vh] w-full" />
        </div>
      </AppShell>
    );
  }

  if (!output) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <p className="text-4xl mb-3">❓</p>
          <p className="text-muted-foreground text-sm mb-4">Output not found.</p>
          <Button variant="outline" size="sm" onClick={() => navigate("/history")}>
            <ArrowLeft size={13} className="mr-1.5" />
            Back to History
          </Button>
        </div>
      </AppShell>
    );
  }

  const timeAgo = formatDistanceToNow(new Date(output.created_at), { addSuffix: true });

  return (
    <AppShell>
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 px-4 py-3 border-b bg-background shrink-0 text-xs">
        <button
          onClick={handleBack}
          className="flex items-center gap-1.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={13} />
          {project ? project.name : "History"}
        </button>
        <span className="text-muted-foreground">/</span>
        <span className="font-medium text-foreground truncate max-w-[200px] sm:max-w-sm">
          {output.title ?? skill?.name ?? "Output"}
        </span>
      </div>

      <div className="flex flex-col h-[calc(100vh-3.25rem)] md:h-[calc(100vh-2.5rem)]">
        {/* Header bar */}
        <div className="px-4 sm:px-6 py-4 border-b bg-background shrink-0">
          <div className="max-w-4xl mx-auto flex items-start justify-between gap-4 flex-wrap">
            <div className="space-y-1.5 flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xl">{skill?.icon ?? "📄"}</span>
                {categoryMeta && (
                  <Badge
                    variant="outline"
                    className={cn("text-[10px]", categoryMeta.color)}
                  >
                    {skill?.name ?? output.skill_name}
                  </Badge>
                )}
                {project && (
                  <Badge variant="secondary" className="text-[10px]">
                    {project.name}
                  </Badge>
                )}
                <span className="text-xs text-muted-foreground">{timeAgo}</span>
              </div>
              {output.title && (
                <h1 className="text-lg font-semibold text-foreground leading-snug">
                  {output.title}
                </h1>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1.5 shrink-0">
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleStar}
                title={output.is_starred ? "Unstar" : "Star"}
              >
                <Star
                  size={15}
                  className={cn(
                    output.is_starred
                      ? "fill-amber-400 text-amber-400"
                      : "text-muted-foreground"
                  )}
                />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={handleCopy}
                title="Copy to clipboard"
              >
                <Copy size={15} className="text-muted-foreground" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-muted-foreground hover:text-destructive"
                onClick={handleDelete}
                title="Delete output"
              >
                <Trash2 size={15} />
              </Button>
              <Button
                size="sm"
                onClick={handleRunAgain}
                className="ml-1 gap-1.5"
              >
                <Zap size={13} />
                Run Again
              </Button>
            </div>
          </div>
        </div>

        {/* Content */}
        <ScrollArea className="flex-1">
          <div className="px-4 sm:px-6 py-6 max-w-4xl mx-auto">
            <div className="bg-card border border-border rounded-xl p-5 sm:p-8">
              <MarkdownContent>{output.output_text}</MarkdownContent>
            </div>
          </div>
        </ScrollArea>
      </div>
    </AppShell>
  );
}
