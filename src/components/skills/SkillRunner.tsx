import { useState, useRef, useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { Send, Copy, Save, RotateCcw, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSkillRunner } from "@/hooks/useSkillRunner";
import { useProjects } from "@/hooks/useProjects";
import { useSaveSkillOutput } from "@/hooks/useSkillOutputs";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/hooks/useAuth";
import { type Skill, SKILL_CATEGORIES } from "@/data/skills";
import type { Project } from "@/integrations/supabase/types";
import { cn } from "@/lib/utils";
import SaveOutputDialog from "./SaveOutputDialog";
import { useToast } from "@/hooks/use-toast";

interface SkillRunnerProps {
  skill: Skill;
}

export default function SkillRunner({ skill }: SkillRunnerProps) {
  const { toast } = useToast();
  const { data: projects = [] } = useProjects();
  const { org } = useOrg();
  const { user } = useAuth();
  const saveOutput = useSaveSkillOutput();

  const [selectedProjectId, setSelectedProjectId] = useState<string>("none");
  const [followUp, setFollowUp] = useState("");
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [outputToSave, setOutputToSave] = useState("");
  const [inputDataToSave, setInputDataToSave] = useState<Record<string, string>>({});

  const outputRef = useRef<HTMLDivElement>(null);
  const { streaming, streamedText, conversationHistory, error, run, reset } = useSkillRunner();

  // Build dynamic Zod schema from contextFields
  const schemaShape: Record<string, z.ZodTypeAny> = {};
  for (const field of skill.contextFields) {
    let schema: z.ZodTypeAny = z.string();
    if (field.required) {
      schema = z.string().min(1, `${field.label} is required`);
    } else {
      schema = z.string().optional();
    }
    schemaShape[field.key] = schema;
  }
  const formSchema = z.object(schemaShape);

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: Object.fromEntries(skill.contextFields.map((f) => [f.key, ""])),
  });

  const selectedProject: Project | undefined = projects.find(
    (p) => p.id === selectedProjectId
  );
  const selectedBranchId = selectedProject?.branch_id ?? null;

  // Auto-scroll output
  useEffect(() => {
    if (outputRef.current) {
      outputRef.current.scrollTop = outputRef.current.scrollHeight;
    }
  }, [streamedText, conversationHistory]);

  const getMarketingContext = (): Record<string, unknown> | undefined => {
    if (!selectedProject || !selectedProject.context_complete) return undefined;
    return selectedProject.marketing_context as Record<string, unknown>;
  };

  const buildUserMessage = (formValues: Record<string, unknown>): string => {
    const lines: string[] = [];
    for (const field of skill.contextFields) {
      const value = formValues[field.key];
      if (value) {
        lines.push(`**${field.label}:** ${String(value)}`);
      }
    }
    return lines.join("\n");
  };

  const onSubmit = async (values: Record<string, unknown>) => {
    const stringValues: Record<string, string> = Object.fromEntries(
      Object.entries(values).map(([k, v]) => [k, String(v ?? "")])
    );
    const message = buildUserMessage(values);
    setInputDataToSave(stringValues);
    await run(message, skill, getMarketingContext(), selectedBranchId);
  };

  const handleFollowUp = async () => {
    if (!followUp.trim() || streaming) return;
    const message = followUp.trim();
    setFollowUp("");
    await run(message, skill, getMarketingContext(), selectedBranchId);
  };

  const handleCopy = () => {
    const lastAssistantMsg = [...conversationHistory]
      .reverse()
      .find((m) => m.role === "assistant");
    const text = lastAssistantMsg?.content ?? streamedText;
    if (!text) return;
    navigator.clipboard.writeText(text);
    toast({ description: "Copied to clipboard!" });
  };

  const handleSaveClick = () => {
    const lastAssistantMsg = [...conversationHistory]
      .reverse()
      .find((m) => m.role === "assistant");
    const text = lastAssistantMsg?.content ?? streamedText;
    if (!text) return;
    setOutputToSave(text);
    setShowSaveDialog(true);
  };

  const handleSave = async (title: string) => {
    if (!org || !user) return;
    await saveOutput.mutateAsync({
      org_id: org.id,
      branch_id: selectedBranchId,
      project_id: selectedProjectId !== "none" ? selectedProjectId : null,
      user_id: user.id,
      skill_id: skill.id,
      skill_name: skill.name,
      input_data: inputDataToSave,
      output_text: outputToSave,
      title: title || null,
      is_starred: false,
    });
    setShowSaveDialog(false);
    toast({ description: "Output saved!" });
  };

  const hasOutput = conversationHistory.length > 0 || streaming;

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-0 gap-0">
      {/* ── Left Panel: Context Form ─────────────────────────────────────── */}
      <div className="w-full lg:w-80 xl:w-96 shrink-0 border-b lg:border-b-0 lg:border-r border-border overflow-y-auto max-h-[45vh] lg:max-h-none bg-muted/30">
        <div className="px-3 sm:px-4 py-3 sm:py-4 space-y-4">
          {/* Skill header */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">{skill.icon}</span>
              <h2 className="text-base font-semibold">{skill.name}</h2>
            </div>
            <Badge
              variant="outline"
              className={cn("text-[10px]", SKILL_CATEGORIES[skill.category].color)}
            >
              {SKILL_CATEGORIES[skill.category].label}
            </Badge>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              {skill.description}
            </p>
          </div>

          {/* Project selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-medium">Project (optional)</Label>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger className="h-9 text-sm">
                <SelectValue placeholder="Select a project..." />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No project</SelectItem>
                {projects.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    <span className="flex items-center gap-1.5">
                      {p.context_complete ? "✅" : "⚠️"} {p.name}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedProject && !selectedProject.context_complete && (
              <p className="text-[11px] text-amber-600 flex items-center gap-1">
                <AlertCircle size={11} />
                No marketing context set up for this project.
              </p>
            )}
            {selectedProject?.context_complete && (
              <p className="text-[11px] text-green-600">
                ✓ Marketing context will be used automatically.
              </p>
            )}
          </div>

          {/* Context form fields */}
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            {skill.contextFields.map((field) => (
              <div key={field.key} className="space-y-1.5">
                <Label htmlFor={field.key} className="text-xs font-medium">
                  {field.label}
                  {field.required && <span className="text-destructive ml-0.5">*</span>}
                </Label>

                {field.type === "textarea" ? (
                  <Textarea
                    id={field.key}
                    placeholder={field.placeholder}
                    rows={3}
                    className="text-sm resize-none"
                    {...form.register(field.key)}
                  />
                ) : field.type === "select" ? (
                  <Select
                    onValueChange={(v) => form.setValue(field.key, v)}
                    defaultValue=""
                  >
                    <SelectTrigger className="h-9 text-sm">
                      <SelectValue placeholder="Select..." />
                    </SelectTrigger>
                    <SelectContent>
                      {field.options?.map((opt) => (
                        <SelectItem key={opt} value={opt}>
                          {opt}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={field.key}
                    type={field.type}
                    placeholder={field.placeholder}
                    className="h-9 text-sm"
                    {...form.register(field.key)}
                  />
                )}

                {form.formState.errors[field.key] && (
                  <p className="text-[11px] text-destructive">
                    {String(form.formState.errors[field.key]?.message)}
                  </p>
                )}
              </div>
            ))}

            <Button
              type="submit"
              className="w-full"
              disabled={streaming}
            >
              {streaming ? (
                <>
                  <Loader2 size={14} className="mr-2 animate-spin" />
                  Running...
                </>
              ) : (
                <>
                  <Send size={14} className="mr-2" />
                  Run Skill
                </>
              )}
            </Button>
          </form>
        </div>
      </div>

      {/* ── Right Panel: Output ──────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0">
        {!hasOutput ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
            <span className="text-5xl mb-4">{skill.icon}</span>
            <p className="text-muted-foreground text-sm max-w-sm">
              Fill in the context form and click{" "}
              <strong>Run Skill</strong> to get AI-generated{" "}
              {skill.name.toLowerCase()} output.
            </p>
          </div>
        ) : (
          <>
            {/* Conversation history */}
            <ScrollArea className="flex-1">
              <div ref={outputRef} className="px-2 sm:px-4 py-3 sm:py-4 space-y-4">
                {conversationHistory.map((msg, i) => (
                  <div key={i} className={cn("flex", msg.role === "user" ? "justify-end" : "justify-start")}>
                    {msg.role === "user" ? (
                      <div className="bg-primary text-primary-foreground rounded-xl px-4 py-2.5 max-w-[90%] sm:max-w-[80%] text-sm whitespace-pre-wrap shadow-sm">
                        {msg.content}
                      </div>
                    ) : (
                      <div className="bg-card border border-border rounded-xl px-5 py-4 max-w-[92%] shadow-sm w-full">
                        <MarkdownContent>{msg.content}</MarkdownContent>
                      </div>
                    )}
                  </div>
                ))}

                {/* Streaming */}
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
                    <AlertCircle size={14} />
                    {error}
                  </div>
                )}
              </div>
            </ScrollArea>

            {/* Toolbar */}
            <div className="border-t bg-background p-3 space-y-2">
              <div className="flex flex-wrap items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  disabled={conversationHistory.length === 0}
                  className="h-8 text-xs"
                >
                  <Copy size={12} className="mr-1.5" />
                  Copy
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleSaveClick}
                  disabled={conversationHistory.length === 0}
                  className="h-8 text-xs"
                >
                  <Save size={12} className="mr-1.5" />
                  Save
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={reset}
                  className="h-8 text-xs ml-auto text-muted-foreground"
                >
                  <RotateCcw size={12} className="mr-1.5" />
                  New Run
                </Button>
              </div>

              {/* Follow-up input */}
              {conversationHistory.length > 0 && (
                <div className="flex flex-col sm:flex-row gap-2">
                  <Textarea
                    value={followUp}
                    onChange={(e) => setFollowUp(e.target.value)}
                    placeholder="Ask a follow-up question..."
                    rows={2}
                    className="text-sm resize-none flex-1"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                        e.preventDefault();
                        handleFollowUp();
                      }
                    }}
                  />
                  <Button
                    size="icon"
                    onClick={handleFollowUp}
                    disabled={!followUp.trim() || streaming}
                    className="shrink-0 self-end h-9 w-full sm:w-9"
                  >
                    <Send size={14} />
                  </Button>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      <SaveOutputDialog
        open={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        onSave={handleSave}
        defaultTitle={`${skill.name} — ${new Date().toLocaleDateString()}`}
        saving={saveOutput.isPending}
      />
    </div>
  );
}
