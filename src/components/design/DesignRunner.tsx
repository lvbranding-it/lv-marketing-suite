import { useState, useCallback } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  Wand2, RotateCcw, Save, Copy, Download, AlertCircle, Loader2, Sliders,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useDesignRunner } from "@/hooks/useDesignRunner";
import { useBrandKit } from "@/hooks/useBrandKit";
import { type DesignType, DESIGN_CATEGORIES, STYLE_ICONS, SOCIAL_POST_FORMATS, extractHtml } from "@/data/designTypes";
import { downloadAsPng, downloadAsHtml } from "@/lib/exportDesign";
import { cn } from "@/lib/utils";
import { useToast } from "@/hooks/use-toast";
import DesignPreview from "./DesignPreview";
import DesignColorPicker from "./DesignColorPicker";
import DesignProperties from "./DesignProperties";
import DesignLogoUploader from "./DesignLogoUploader";
import AspectRatioPicker from "./AspectRatioPicker";
import SaveDesignDialog from "./SaveDesignDialog";

interface DesignRunnerProps {
  designType: DesignType;
}

export default function DesignRunner({ designType }: DesignRunnerProps) {
  const { toast } = useToast();
  const { logoDataUrl, logoFileName, setLogo, clearLogo } = useBrandKit();
  const { streaming, streamedText, generatedHtml, currentHtml, error, generate, saveOutput, reset } =
    useDesignRunner();

  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [saving, setSaving] = useState(false);
  const [promptSnapshot, setPromptSnapshot] = useState("");
  const [cssOverrides, setCssOverrides] = useState<Record<string, string>>({});
  const [showProperties, setShowProperties] = useState(false);
  // Canvas dimensions — may be overridden by aspect-ratio picker
  const [canvasWidth, setCanvasWidth] = useState(designType.canvasWidth);
  const [canvasHeight, setCanvasHeight] = useState(designType.canvasWidth); // square default

  const category = DESIGN_CATEGORIES[designType.category];

  // Build Zod schema
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

  // Inject the brand logo data URL into generated HTML (replaces {{BRAND_LOGO}} placeholder)
  const injectLogo = (html: string) =>
    logoDataUrl ? html.replaceAll("{{BRAND_LOGO}}", logoDataUrl) : html;

  const buildPrompt = (values: Record<string, unknown>): string => {
    const lines: string[] = [];
    if (logoDataUrl) {
      lines.push(`**Brand Logo:** Include an <img src="{{BRAND_LOGO}}" alt="Brand Logo"> in the design — use that placeholder exactly as written. It will be replaced with the real logo image.`);
    }
    for (const field of designType.contextFields) {
      const value = values[field.key];
      if (value) lines.push(`**${field.label}:** ${String(value)}`);
    }
    return lines.join("\n");
  };

  const onSubmit = async (values: Record<string, unknown>) => {
    const prompt = buildPrompt(values);
    setPromptSnapshot(prompt);
    setCssOverrides({});
    await generate(prompt, designType);
    setShowProperties(true);
  };

  const handleRefine = useCallback(
    async (refinement: string) => {
      const fullPrompt = `${promptSnapshot}\n\n**Refinement request:** ${refinement}\n\nPlease regenerate the complete design incorporating this change.`;
      setCssOverrides({});
      await generate(fullPrompt, designType);
    },
    [promptSnapshot, designType, generate]
  );

  // Logo-injected versions for preview and export
  const renderedHtml = injectLogo(generatedHtml);
  const renderedCurrentHtml = injectLogo(currentHtml);

  const handleCopy = () => {
    const html = extractHtml(renderedCurrentHtml);
    if (!html) return;
    navigator.clipboard.writeText(html);
    toast({ description: "HTML copied to clipboard!" });
  };

  const handleDownloadPng = () => {
    const html = extractHtml(renderedHtml);
    if (!html) return;
    const filename = `${designType.id}-${Date.now()}`;
    downloadAsPng(html, filename, canvasWidth, canvasHeight);
    toast({ description: "Opening PNG export — download will start automatically." });
  };

  const handleDownloadHtml = () => {
    const html = extractHtml(renderedHtml);
    if (!html) return;
    downloadAsHtml(html, `${designType.id}-${Date.now()}`);
  };

  const handleSave = async (title: string) => {
    setSaving(true);
    try {
      await saveOutput(designType, promptSnapshot, extractHtml(renderedHtml), title);
      setShowSaveDialog(false);
      toast({ description: "Design saved to your library!" });
    } catch {
      toast({ description: "Failed to save design.", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const hasOutput = !!renderedCurrentHtml || streaming;

  return (
    <div className="flex h-full min-h-0">
      {/* ── Left Panel: Form ──────────────────────────────────────────────────── */}
      <div className="w-72 xl:w-80 shrink-0 border-r border-border flex flex-col bg-background overflow-hidden">
        <ScrollArea className="flex-1">
          <div className="px-4 py-4 space-y-5 min-w-0">
            {/* Design type header */}
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center text-xl shrink-0">
                {designType.icon}
              </div>
              <div className="min-w-0">
                <h2 className="text-sm font-semibold leading-tight">{designType.name}</h2>
                <Badge variant="outline" className={cn("text-[10px] mt-1", category.color)}>
                  {category.label}
                </Badge>
              </div>
            </div>

            <p className="text-xs text-muted-foreground leading-relaxed -mt-1">
              {designType.description}
            </p>

            <div className="h-px bg-border" />

            {/* Brand logo */}
            <div className="space-y-1.5">
              <p className="text-xs font-medium">Brand Logo</p>
              <DesignLogoUploader
                logoDataUrl={logoDataUrl}
                logoFileName={logoFileName}
                onUpload={setLogo}
                onClear={clearLogo}
              />
            </div>

            <div className="h-px bg-border" />

            {/* Form fields */}
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {designType.contextFields.map((field) => (
                <div key={field.key} className="space-y-1.5">
                  <Label htmlFor={field.key} className="text-xs font-medium">
                    {field.label}
                    {field.required && <span className="text-destructive ml-0.5">*</span>}
                  </Label>

                  {field.type === "aspect-ratio" ? (
                    <Controller
                      name={field.key}
                      control={form.control}
                      render={({ field: f }) => (
                        <AspectRatioPicker
                          options={[...SOCIAL_POST_FORMATS]}
                          value={f.value as string ?? "square"}
                          onChange={(value, opt) => {
                            f.onChange(opt.label);
                            setCanvasWidth(opt.width);
                            setCanvasHeight(opt.height);
                          }}
                        />
                      )}
                    />
                  ) : field.type === "textarea" ? (
                    <Textarea
                      id={field.key}
                      placeholder={field.placeholder}
                      rows={3}
                      className="text-sm resize-none"
                      {...form.register(field.key)}
                    />
                  ) : field.type === "color" ? (
                    <Controller
                      name={field.key}
                      control={form.control}
                      render={({ field: f }) => (
                        <DesignColorPicker
                          value={f.value as string ?? ""}
                          onChange={f.onChange}
                        />
                      )}
                    />
                  ) : field.type === "style-select" ? (
                    <Controller
                      name={field.key}
                      control={form.control}
                      render={({ field: f }) => (
                        <div className="grid grid-cols-2 gap-1.5">
                          {field.options?.map((opt) => (
                            <button
                              key={opt}
                              type="button"
                              onClick={() => f.onChange(opt)}
                              className={cn(
                                "text-[11px] px-2 py-2 rounded-lg border text-left transition-all leading-tight",
                                f.value === opt
                                  ? "border-primary bg-primary/5 text-primary font-medium"
                                  : "border-border text-muted-foreground hover:border-foreground/30 hover:text-foreground"
                              )}
                            >
                              <span className="mr-1">{STYLE_ICONS[opt] ?? "◻"}</span>
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}
                    />
                  ) : field.type === "select" ? (
                    <Controller
                      name={field.key}
                      control={form.control}
                      render={({ field: f }) => (
                        <Select onValueChange={f.onChange} value={f.value as string ?? ""}>
                          <SelectTrigger className="h-9 text-sm">
                            <SelectValue placeholder="Select..." />
                          </SelectTrigger>
                          <SelectContent>
                            {field.options?.map((opt) => (
                              <SelectItem key={opt} value={opt}>{opt}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                  ) : (
                    <Input
                      id={field.key}
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
                className="w-full font-semibold"
                size="lg"
                disabled={streaming}
              >
                {streaming ? (
                  <>
                    <Loader2 size={15} className="mr-2 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <Wand2 size={15} className="mr-2" />
                    Generate Design
                  </>
                )}
              </Button>
            </form>
          </div>
        </ScrollArea>

        {/* Bottom toolbar (shown after generation) */}
        {hasOutput && !streaming && (
          <div className="border-t p-3 space-y-2 bg-muted/30 shrink-0">
            <div className="grid grid-cols-2 gap-1.5">
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleCopy}>
                <Copy size={11} className="mr-1.5" />Copy HTML
              </Button>
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={handleDownloadHtml}>
                <Download size={11} className="mr-1.5" />HTML
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={() => setShowSaveDialog(true)}
              >
                <Save size={11} className="mr-1.5" />Save
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground"
                onClick={() => { reset(); setCssOverrides({}); setShowProperties(false); }}
              >
                <RotateCcw size={11} className="mr-1.5" />New
              </Button>
            </div>
            {/* PNG export — primary action */}
            <Button
              size="sm"
              className="w-full h-9 text-xs font-semibold"
              onClick={handleDownloadPng}
            >
              <Download size={12} className="mr-1.5" />
              Export as PNG
            </Button>
            <Button
              variant={showProperties ? "default" : "outline"}
              size="sm"
              className="w-full h-8 text-xs"
              onClick={() => setShowProperties((v) => !v)}
            >
              <Sliders size={11} className="mr-1.5" />
              {showProperties ? "Hide Properties" : "Design Properties"}
            </Button>
          </div>
        )}
      </div>

      {/* ── Center Panel: Preview ─────────────────────────────────────────────── */}
      <div className="flex-1 flex flex-col min-h-0 min-w-0 relative">
        {error && (
          <div className="mx-4 mt-3 bg-destructive/10 text-destructive rounded-lg px-4 py-2 text-sm flex items-center gap-2 shrink-0">
            <AlertCircle size={14} />
            {error}
          </div>
        )}

        <DesignPreview
          html={renderedHtml}
          streaming={streaming}
          streamedText={streamedText}
          cssOverrides={cssOverrides}
          canvasWidth={canvasWidth}
          canvasHeight={canvasHeight}
        />

      </div>

      {/* ── Right Panel: Properties ───────────────────────────────────────────── */}
      {showProperties && hasOutput && (
        <div className="w-72 shrink-0 border-l border-border flex flex-col bg-background">
          <div className="px-4 py-3 border-b flex items-center justify-between shrink-0">
            <h3 className="text-xs font-semibold">Design Properties</h3>
            <button
              onClick={() => setShowProperties(false)}
              className="text-muted-foreground hover:text-foreground transition-colors text-xs"
            >
              ✕
            </button>
          </div>
          <DesignProperties
            html={renderedHtml}
            onCssOverrideChange={setCssOverrides}
            onRefine={handleRefine}
            streaming={streaming}
          />
        </div>
      )}

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
