import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Wand2, RotateCcw, Save, Copy, Download, AlertCircle, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDesignRunner } from "@/hooks/useDesignRunner";
import { type DesignType, DESIGN_CATEGORIES, extractHtml } from "@/data/designTypes";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import DesignPreview from "./DesignPreview";
import SaveDesignDialog from "./SaveDesignDialog";

interface DesignRunnerProps {
  designType: DesignType;
}

export default function DesignRunner({ designType }: DesignRunnerProps) {
  const { toast } = useToast();
  const { streaming, streamedText, generatedHtml, currentHtml, error, generate, saveOutput, reset } =
    useDesignRunner();

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [promptSnapshot, setPromptSnapshot] = useState("");

  const category = DESIGN_CATEGORIES[designType.category];

  // Build Zod schema from contextFields
  const schemaShape: Record<string, z.ZodTypeAny> = {};
  for (const field of designType.contextFields) {
    schemaShape[field.key] = field.required
      ? z.string().min(1, `${field.label} is required`)
      : z.string().optional();
  }
  const formSchema = z.object(schemaShape);

  const form = useForm({
    resolver: zodResolver(formSchema),
    defaultValues: Object.fromEntries(designType.contextFields.map((f) => [f.key, ""])),
  });

  const buildPrompt = (values: Record<string, unknown>): string => {
    const lines: string[] = [];
    for (const field of designType.contextFields) {
      const value = values[field.key];
      if (value) lines.push(`**${field.label}:** ${String(value)}`);
    }
    return lines.join("\n");
  };

  const onSubmit = async (values: Record<string, unknown>) => {
    const prompt = buildPrompt(values);
    setPromptSnapshot(prompt);
    await generate(prompt, designType);
  };

  const handleCopy = () => {
    const html = extractHtml(currentHtml);
    if (!html) return;
    navigator.clipboard.writeText(html);
    toast({ description: "HTML copied to clipboard!" });
  };

  const handleDownload = () => {
    const html = extractHtml(currentHtml);
    if (!html) return;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${designType.id}-${Date.now()}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleOpenNew = () => {
    const html = extractHtml(currentHtml);
    if (!html) return;
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    window.open(url, "_blank");
  };

  const handleSave = async (title: string) => {
    setSaving(true);
    try {
      await saveOutput(designType, promptSnapshot, extractHtml(generatedHtml), title);
      setShowSaveDialog(false);
      toast({ description: "Design saved to your library!" });
    } catch {
      toast({ description: "Failed to save design.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const hasOutput = !!currentHtml || streaming;

  return (
    <div className="flex flex-col lg:flex-row h-full min-h-0 gap-0">
      {/* ── Left Panel: Form ──────────────────────────────────────────────── */}
      <div className="w-full lg:w-80 xl:w-96 shrink-0 border-b lg:border-b-0 lg:border-r border-border overflow-y-auto max-h-[45vh] lg:max-h-none bg-muted/30">
        <div className="px-3 sm:px-4 py-3 sm:py-4 space-y-4">
          {/* Header */}
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">{designType.icon}</span>
              <h2 className="text-base font-semibold">{designType.name}</h2>
            </div>
            <Badge variant="outline" className={cn("text-[10px]", category.color)}>
              {category.label}
            </Badge>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              {designType.description}
            </p>
          </div>

          {/* Form */}
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-3">
            {designType.contextFields.map((field) => (
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
                        <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    id={field.key}
                    type={field.type === "color" ? "text" : field.type}
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

            <Button type="submit" className="w-full" disabled={streaming}>
              {streaming ? (
                <>
                  <Loader2 size={14} className="mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Wand2 size={14} className="mr-2" />
                  Generate Design
                </>
              )}
            </Button>
          </form>
        </div>
      </div>

      {/* ── Right Panel: Preview ─────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 relative">
        <DesignPreview
          html={generatedHtml}
          streaming={streaming}
          streamedText={streamedText}
        />

        {/* Error */}
        {error && (
          <div className="mx-4 mb-2 bg-destructive/10 text-destructive rounded-lg px-4 py-2 text-sm flex items-center gap-2">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        {/* Toolbar */}
        {hasOutput && !streaming && (
          <div className="border-t bg-background px-3 py-2 flex flex-wrap items-center gap-1.5 shrink-0">
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleCopy} disabled={!generatedHtml}>
              <Copy size={12} className="mr-1.5" />
              Copy HTML
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleDownload} disabled={!generatedHtml}>
              <Download size={12} className="mr-1.5" />
              Download
            </Button>
            <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleOpenNew} disabled={!generatedHtml}>
              Open in tab
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 text-xs"
              onClick={() => setShowSaveDialog(true)}
              disabled={!generatedHtml}
            >
              <Save size={12} className="mr-1.5" />
              Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs ml-auto text-muted-foreground"
              onClick={reset}
            >
              <RotateCcw size={12} className="mr-1.5" />
              New Design
            </Button>
          </div>
        )}
      </div>

      <SaveDesignDialog
        open={showSaveDialog}
        onClose={() => setShowSaveDialog(false)}
        onSave={handleSave}
        defaultTitle={`${designType.name} — ${new Date().toLocaleDateString()}`}
        saving={saving}
      />
    </div>
  );
}
