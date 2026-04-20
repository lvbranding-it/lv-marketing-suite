import { useParams, useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft, Star, Trash2, Copy, Send, Save, Loader2, AlertCircle,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  useSkillOutput,
  useUpdateSkillOutput,
  useDeleteSkillOutput,
  useSaveSkillOutput,
} from "@/hooks/useSkillOutputs";
import { useProject } from "@/hooks/useProjects";
import { useSkillRunner } from "@/hooks/useSkillRunner";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/hooks/useAuth";
import { getSkill, SKILL_CATEGORIES } from "@/data/skills";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import SaveOutputDialog from "@/components/skills/SaveOutputDialog";

export default function OutputDetail() {
  const { outputId } = useParams<{ outputId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const { org } = useOrg();
  const { user } = useAuth();

  const { data: output, isLoading } = useSkillOutput(outputId);
  const { data: project } = useProject(output?.project_id ?? undefined);
  const updateOutput = useUpdateSkillOutput();
  const deleteOutput = useDeleteSkillOutput();
  const saveOutputMutation = useSaveSkillOutput();

  const skill = output ? getSkill(output.skill_id) : null;
  const categoryMeta = skill ? SKILL_CATEGORIES[skill.category] : null;

  const { streaming, streamedText, conversationHistory, error, run, init } =
    useSkillRunner();

  const [followUp, setFollowUp] = useState("");
  const [initialized, setInitialized] = useState(false);
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [outputToSave, setOutputToSave] = useState("");
  const bottomRef = useRef<HTMLDivElement>(null);

  // Seed the conversation history with the saved output on first load
  useEffect(() => {
    if (!output || initialized) return;

    // Reconstruct the original user message from input_data + skill context fields
    let userMessage = "Continue from previous context.";
    if (output.input_data && skill) {
      const lines: string[] = [];
      for (const field of skill.contextFields) {
        const val = (output.input_data as Record<string, string>)[field.key];
        if (val) lines.push(`**${field.label}:** ${val}`);
      }
      if (lines.length > 0) userMessage = lines.join("\n");
    }

    init([
      { role: "user", content: userMessage },
      { role: "assistant", content: output.output_text },
    ]);
    setInitialized(true);
  }, [output, skill, initialized, init]);

  // Auto-scroll to bottom when new content arrives
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [conversationHistory, streamedText]);

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
          navigate(output.project_id ? `/projects/${output.project_id}` : "/history");
        },
      });
    }
  };

  const handleFollowUp = async () => {
    if (!followUp.trim() || streaming || !skill) return;
    const message = followUp.trim();
    setFollowUp("");
    const marketingContext =
      project?.context_complete
        ? (project.marketing_context as Record<string, unknown>)
        : undefined;
    await run(message, skill, marketingContext, output?.branch_id ?? project?.branch_id ?? null);
  };

  const handleSaveContinuation = () => {
    const lastAssistant = [...conversationHistory]
      .reverse()
      .find((m) => m.role === "assistant");
    if (!lastAssistant) return;
    setOutputToSave(lastAssistant.content);
    setShowSaveDialog(true);
  };

  const handleSave = async (title: string) => {
    if (!org || !user || !skill) return;
    await saveOutputMutation.mutateAsync({
      org_id: org.id,
      branch_id: output?.branch_id ?? project?.branch_id ?? null,
      project_id: output?.project_id ?? null,
      user_id: user.id,
      skill_id: skill.id,
      skill_name: skill.name,
      input_data: {},
      output_text: outputToSave,
      title: title || null,
      is_starred: false,
    });
    setShowSaveDialog(false);
    toast({ description: "Continuation saved!" });
  };

  const handleBack = () => {
    if (output?.project_id) navigate(`/projects/${output.project_id}`);
    else navigate("/history");
  };

  // Turns after the initial saved output (index 0+1 are the seeded pair)
  const continuationTurns = conversationHistory.slice(2);

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

      <div className="flex flex-col h-[calc(100vh-6.5rem)] md:h-[calc(100vh-5.75rem)]">
        {/* Header bar */}
        <div className="px-4 sm:px-6 py-3 border-b bg-background shrink-0">
          <div className="max-w-4xl mx-auto flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-lg">{skill?.icon ?? "📄"}</span>
              {categoryMeta && (
                <Badge variant="outline" className={cn("text-[10px]", categoryMeta.color)}>
                  {skill?.name ?? output.skill_name}
                </Badge>
              )}
              {project && (
                <Badge variant="secondary" className="text-[10px]">{project.name}</Badge>
              )}
              <span className="text-xs text-muted-foreground">{timeAgo}</span>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleStar}>
                <Star size={14} className={cn(output.is_starred ? "fill-amber-400 text-amber-400" : "text-muted-foreground")} />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCopy}>
                <Copy size={14} className="text-muted-foreground" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-destructive" onClick={handleDelete}>
                <Trash2 size={14} />
              </Button>
            </div>
          </div>
          {output.title && (
            <p className="max-w-4xl mx-auto text-base font-semibold mt-1">{output.title}</p>
          )}
        </div>

        {/* Scrollable conversation */}
        <ScrollArea className="flex-1">
          <div className="px-4 sm:px-6 py-5 max-w-4xl mx-auto space-y-4">

            {/* Original saved output */}
            <div className="bg-card border border-border rounded-xl px-5 sm:px-8 py-5 shadow-sm">
              <MarkdownContent>{output.output_text}</MarkdownContent>
            </div>

            {/* Continuation turns (after the seeded pair) */}
            {continuationTurns.map((msg, i) => (
              <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                {msg.role === "user" ? (
                  <div className="bg-primary text-primary-foreground rounded-xl px-4 py-3 max-w-[88%] text-sm whitespace-pre-wrap shadow-sm">
                    {msg.content}
                  </div>
                ) : (
                  <div className="bg-card border border-border rounded-xl px-5 py-4 max-w-[92%] shadow-sm w-full">
                    <MarkdownContent>{msg.content}</MarkdownContent>
                    <div className="flex justify-end mt-3">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs text-muted-foreground gap-1"
                        onClick={() => {
                          setOutputToSave(msg.content);
                          setShowSaveDialog(true);
                        }}
                      >
                        <Save size={11} /> Save this
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* Streaming response */}
            {streaming && streamedText && (
              <div className="flex justify-start">
                <div className="bg-card border border-border rounded-xl px-5 py-4 max-w-[92%] shadow-sm w-full">
                  <MarkdownContent>{streamedText}</MarkdownContent>
                  <span className="inline-block w-1.5 h-4 bg-primary animate-pulse ml-0.5 align-middle mt-1" />
                </div>
              </div>
            )}

            {streaming && !streamedText && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-4 py-3">
                  <Loader2 size={16} className="animate-spin text-muted-foreground" />
                </div>
              </div>
            )}

            {error && (
              <div className="bg-destructive/10 text-destructive rounded-lg px-4 py-3 text-sm flex items-center gap-2">
                <AlertCircle size={14} /> {error}
              </div>
            )}

            <div ref={bottomRef} />
          </div>
        </ScrollArea>

        {/* Follow-up input */}
        <div className="border-t bg-background px-4 sm:px-6 py-3 shrink-0">
          <div className="max-w-4xl mx-auto flex flex-col sm:flex-row gap-2">
            <Textarea
              value={followUp}
              onChange={(e) => setFollowUp(e.target.value)}
              placeholder={`Continue the conversation with ${skill?.name ?? "the AI"}… (⌘↵ to send)`}
              rows={2}
              className="text-sm resize-none flex-1"
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault();
                  handleFollowUp();
                }
              }}
            />
            <div className="flex sm:flex-col gap-2 self-end">
              <Button
                onClick={handleFollowUp}
                disabled={!followUp.trim() || streaming || !initialized}
                className="flex-1 sm:flex-none sm:w-10 h-9 gap-1.5 sm:gap-0"
              >
                {streaming ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Send size={14} />
                )}
                <span className="sm:hidden">Send</span>
              </Button>
              {continuationTurns.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveContinuation}
                  className="h-9 gap-1.5 text-xs"
                >
                  <Save size={13} /> Save latest
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>

      <SaveOutputDialog
        open={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        onSave={handleSave}
        defaultTitle={`${skill?.name ?? "Output"} — continuation`}
        saving={saveOutputMutation.isPending}
      />
    </AppShell>
  );
}
