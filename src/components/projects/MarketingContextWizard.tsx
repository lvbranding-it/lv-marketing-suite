import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { ChevronRight, ChevronLeft, Loader2, CheckCircle2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Progress } from "@/components/ui/progress";
import { ScrollArea } from "@/components/ui/scroll-area";
import { runSkillStream } from "@/lib/claude";
import { useUpdateProject } from "@/hooks/useProjects";
import { getSkill } from "@/data/skills";
import { useToast } from "@/hooks/use-toast";

interface MarketingContextWizardProps {
  projectId: string;
  onComplete: () => void;
  onSkip: () => void;
}

// ── Step schemas ──────────────────────────────────────────────────────────────

const step1Schema = z.object({
  product_name: z.string().min(1, "Required"),
  website: z.string().optional(),
  one_liner: z.string().min(1, "Required"),
  category: z.string().min(1, "Required"),
  business_model: z.string().min(1, "Required"),
});

const step2Schema = z.object({
  ideal_customer: z.string().min(1, "Required"),
  top_problem: z.string().min(1, "Required"),
  why_current_solutions_fail: z.string().optional(),
  jobs_to_be_done: z.string().optional(),
});

const step3Schema = z.object({
  top_competitors: z.string().optional(),
  differentiators: z.string().min(1, "Required"),
  why_customers_choose_you: z.string().optional(),
});

const step4Schema = z.object({
  tone: z.string().min(1, "Required"),
  personality_adjectives: z.string().optional(),
  words_to_use: z.string().optional(),
  words_to_avoid: z.string().optional(),
});

type Step1 = z.infer<typeof step1Schema>;
type Step2 = z.infer<typeof step2Schema>;
type Step3 = z.infer<typeof step3Schema>;
type Step4 = z.infer<typeof step4Schema>;

type AllSteps = Step1 & Step2 & Step3 & Step4;

const STEPS = [
  { label: "Product Basics", icon: "📦" },
  { label: "Target Audience", icon: "🎯" },
  { label: "Competition", icon: "⚔️" },
  { label: "Brand Voice", icon: "🗣️" },
];

export default function MarketingContextWizard({
  projectId,
  onComplete,
  onSkip,
}: MarketingContextWizardProps) {
  const { toast } = useToast();
  const updateProject = useUpdateProject();

  const [step, setStep] = useState(0); // 0=welcome, 1-4=form steps, 5=generating, 6=done
  const [formData, setFormData] = useState<Partial<AllSteps>>({});
  const [generating, setGenerating] = useState(false);
  const [generatedText, setGeneratedText] = useState("");
  const [streamedText, setStreamedText] = useState("");

  const form1 = useForm<Step1>({ resolver: zodResolver(step1Schema) });
  const form2 = useForm<Step2>({ resolver: zodResolver(step2Schema) });
  const form3 = useForm<Step3>({ resolver: zodResolver(step3Schema) });
  const form4 = useForm<Step4>({ resolver: zodResolver(step4Schema) });

  const forms = [null, form1, form2, form3, form4];
  const schemas = [null, step1Schema, step2Schema, step3Schema, step4Schema];

  const progressPct = step === 0 ? 0 : step >= 5 ? 100 : (step / 4) * 100;

  const handleNext = async () => {
    if (step === 0) { setStep(1); return; }

    const currentForm = forms[step];
    const currentSchema = schemas[step];
    if (!currentForm || !currentSchema) return;

    const valid = await currentForm.trigger();
    if (!valid) return;

    const values = currentForm.getValues();
    const merged = { ...formData, ...values };
    setFormData(merged);

    if (step < 4) {
      setStep(step + 1);
    } else {
      // Final step — generate
      await generateContext(merged as AllSteps);
    }
  };

  const buildPrompt = (data: AllSteps): string => {
    return `Please create a comprehensive product marketing context document based on the following information:

## Product Details
- **Product/Company Name:** ${data.product_name}
${data.website ? `- **Website:** ${data.website}` : ""}
- **One-liner:** ${data.one_liner}
- **Category:** ${data.category}
- **Business Model:** ${data.business_model}

## Target Audience
- **Ideal Customer:** ${data.ideal_customer}
- **Top Problem Solved:** ${data.top_problem}
${data.why_current_solutions_fail ? `- **Why Current Solutions Fall Short:** ${data.why_current_solutions_fail}` : ""}
${data.jobs_to_be_done ? `- **Jobs to Be Done:** ${data.jobs_to_be_done}` : ""}

## Competition & Differentiation
${data.top_competitors ? `- **Top Competitors:** ${data.top_competitors}` : ""}
- **Key Differentiators:** ${data.differentiators}
${data.why_customers_choose_you ? `- **Why Customers Choose Us:** ${data.why_customers_choose_you}` : ""}

## Brand Voice
- **Tone:** ${data.tone}
${data.personality_adjectives ? `- **Personality Adjectives:** ${data.personality_adjectives}` : ""}
${data.words_to_use ? `- **Words to Always Use:** ${data.words_to_use}` : ""}
${data.words_to_avoid ? `- **Words to Avoid:** ${data.words_to_avoid}` : ""}

Please produce a comprehensive, well-structured marketing context document that all marketing skills can reference.`;
  };

  const generateContext = async (data: AllSteps) => {
    setStep(5);
    setGenerating(true);
    setStreamedText("");

    const pmcSkill = getSkill("product-marketing-context");
    if (!pmcSkill) {
      toast({ variant: "destructive", description: "Skill not found" });
      return;
    }

    let fullText = "";

    await runSkillStream(
      {
        skillSystemPrompt: pmcSkill.systemPrompt,
        userMessage: buildPrompt(data),
        conversationHistory: [],
        marketingContext: {},
      },
      {
        onToken: (token) => {
          fullText += token;
          setStreamedText((prev) => prev + token);
        },
        onComplete: async (text) => {
          setGeneratedText(text);
          setGenerating(false);

          // Parse sections
          const sections: Record<string, string> = {};
          const sectionRegex = /^#{1,3}\s+(.+)\n([\s\S]*?)(?=^#{1,3}\s+|\s*$)/gm;
          let match;
          while ((match = sectionRegex.exec(text)) !== null) {
            sections[match[1].trim()] = match[2].trim();
          }

          try {
            await updateProject.mutateAsync({
              id: projectId,
              marketing_context: {
                raw_markdown: text,
                sections,
                generated_at: new Date().toISOString(),
                wizard_inputs: data,
              },
              context_complete: true,
            });
            setStep(6);
          } catch (err) {
            toast({
              variant: "destructive",
              description: "Failed to save context: " + (err instanceof Error ? err.message : "Unknown error"),
            });
            setGenerating(false);
          }
        },
        onError: (error) => {
          setGenerating(false);
          toast({ variant: "destructive", description: error.message });
          setStep(4);
        },
      }
    );
  };

  // ── Render ───────────────────────────────────────────────────────────────────

  if (step === 0) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center max-w-lg mx-auto">
        <span className="text-5xl mb-4">🏗️</span>
        <h2 className="text-xl font-semibold mb-2">Set Up Product Marketing Context</h2>
        <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
          Before running any skills, let's capture key information about your product.
          This takes about 5 minutes and makes every AI output dramatically more accurate and relevant.
        </p>
        <div className="flex gap-3">
          <Button variant="outline" onClick={onSkip}>Skip for now</Button>
          <Button onClick={() => setStep(1)}>
            <Sparkles size={14} className="mr-2" />
            Start Setup
          </Button>
        </div>
      </div>
    );
  }

  if (step === 5) {
    return (
      <div className="flex flex-col h-full">
        <div className="p-4 border-b">
          <div className="flex items-center gap-2 mb-1">
            <Loader2 size={16} className="animate-spin text-primary" />
            <h2 className="text-sm font-semibold">Generating context document...</h2>
          </div>
          <Progress value={streamedText.length > 0 ? Math.min(95, (streamedText.length / 2000) * 100) : 10} className="h-1.5" />
        </div>
        <ScrollArea className="flex-1 p-4">
          <div className="bg-card border border-border rounded-xl px-6 py-5 shadow-sm">
            <MarkdownContent>{streamedText || "Generating..."}</MarkdownContent>
            {generating && (
              <span className="inline-block w-1.5 h-4 bg-primary animate-pulse ml-0.5 align-middle mt-1" />
            )}
          </div>
        </ScrollArea>
      </div>
    );
  }

  if (step === 6) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center max-w-lg mx-auto">
        <CheckCircle2 size={48} className="text-green-500 mb-4" />
        <h2 className="text-xl font-semibold mb-2">Context Document Created!</h2>
        <p className="text-muted-foreground text-sm mb-6 leading-relaxed">
          All marketing skills will now automatically use this context, saving time and improving output quality.
        </p>
        <Button onClick={onComplete}>
          Start Using Skills
          <ChevronRight size={14} className="ml-2" />
        </Button>
      </div>
    );
  }

  // Steps 1–4
  const stepIndex = step - 1;
  const stepMeta = STEPS[stepIndex];

  return (
    <div className="flex flex-col h-full">
      {/* Step progress header */}
      <div className="p-4 border-b bg-muted/30">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-xl">{stepMeta.icon}</span>
            <div>
              <p className="text-xs text-muted-foreground">
                Step {step} of 4
              </p>
              <h2 className="text-sm font-semibold">{stepMeta.label}</h2>
            </div>
          </div>
          <Button variant="ghost" size="sm" className="text-xs" onClick={onSkip}>
            Skip all
          </Button>
        </div>
        <Progress value={progressPct} className="h-1.5" />
        <div className="flex gap-1 mt-2">
          {STEPS.map((s, i) => (
            <div
              key={i}
              className={`flex-1 h-1 rounded-full transition-colors ${
                i < stepIndex ? "bg-primary" : i === stepIndex ? "bg-primary/50" : "bg-border"
              }`}
            />
          ))}
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-4">
          {/* Step 1: Product Basics */}
          {step === 1 && (
            <>
              <FormField label="Product / Company Name *" error={form1.formState.errors.product_name?.message}>
                <Input placeholder="e.g. Acme SaaS" {...form1.register("product_name")} />
              </FormField>
              <FormField label="Website URL">
                <Input type="url" placeholder="https://..." {...form1.register("website")} />
              </FormField>
              <FormField label="One-liner description *" error={form1.formState.errors.one_liner?.message}>
                <Textarea
                  placeholder="e.g. We help marketing teams ship campaigns 10x faster."
                  rows={2}
                  className="resize-none"
                  {...form1.register("one_liner")}
                />
              </FormField>
              <FormField label="Product category *" error={form1.formState.errors.category?.message}>
                <Input placeholder="e.g. Marketing automation SaaS" {...form1.register("category")} />
              </FormField>
              <FormField label="Business model *" error={form1.formState.errors.business_model?.message}>
                <Select onValueChange={(v) => form1.setValue("business_model", v)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select..." />
                  </SelectTrigger>
                  <SelectContent>
                    {["SaaS", "Freemium SaaS", "Usage-based", "E-commerce", "Marketplace", "Service", "Other"].map((o) => (
                      <SelectItem key={o} value={o}>{o}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
            </>
          )}

          {/* Step 2: Target Audience */}
          {step === 2 && (
            <>
              <FormField label="Who is your ideal customer? *" error={form2.formState.errors.ideal_customer?.message}>
                <Textarea
                  placeholder="e.g. B2B SaaS marketing managers at 50–500 person companies..."
                  rows={3}
                  className="resize-none"
                  {...form2.register("ideal_customer")}
                />
              </FormField>
              <FormField label="Their #1 problem you solve *" error={form2.formState.errors.top_problem?.message}>
                <Textarea
                  placeholder="e.g. They spend too much time manually building campaigns..."
                  rows={3}
                  className="resize-none"
                  {...form2.register("top_problem")}
                />
              </FormField>
              <FormField label="Why do current solutions fall short?">
                <Textarea
                  placeholder="e.g. Existing tools are too complex or require engineering..."
                  rows={2}
                  className="resize-none"
                  {...form2.register("why_current_solutions_fail")}
                />
              </FormField>
              <FormField label="Key jobs to be done">
                <Textarea
                  placeholder="e.g. Launch campaigns faster, collaborate with design team..."
                  rows={2}
                  className="resize-none"
                  {...form2.register("jobs_to_be_done")}
                />
              </FormField>
            </>
          )}

          {/* Step 3: Competition */}
          {step === 3 && (
            <>
              <FormField label="Top 2–3 competitors">
                <Textarea
                  placeholder="e.g. HubSpot, Mailchimp, ActiveCampaign"
                  rows={2}
                  className="resize-none"
                  {...form3.register("top_competitors")}
                />
              </FormField>
              <FormField label="Your key differentiators *" error={form3.formState.errors.differentiators?.message}>
                <Textarea
                  placeholder="e.g. 10x faster setup, no-code, built for SMBs..."
                  rows={3}
                  className="resize-none"
                  {...form3.register("differentiators")}
                />
              </FormField>
              <FormField label="Why do customers choose you over alternatives?">
                <Textarea
                  placeholder="e.g. Speed, simplicity, and great support..."
                  rows={2}
                  className="resize-none"
                  {...form3.register("why_customers_choose_you")}
                />
              </FormField>
            </>
          )}

          {/* Step 4: Brand Voice */}
          {step === 4 && (
            <>
              <FormField label="Brand tone *" error={form4.formState.errors.tone?.message}>
                <Select onValueChange={(v) => form4.setValue("tone", v)}>
                  <SelectTrigger className="h-9 text-sm">
                    <SelectValue placeholder="Select tone..." />
                  </SelectTrigger>
                  <SelectContent>
                    {["Professional", "Conversational", "Casual", "Playful", "Bold", "Technical", "Empathetic"].map((t) => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FormField>
              <FormField label="3 personality adjectives">
                <Input
                  placeholder="e.g. Clear, Direct, Ambitious"
                  {...form4.register("personality_adjectives")}
                />
              </FormField>
              <FormField label="Words / phrases to always use">
                <Input
                  placeholder="e.g. streamline, launch, campaign"
                  {...form4.register("words_to_use")}
                />
              </FormField>
              <FormField label="Words / phrases to avoid">
                <Input
                  placeholder="e.g. synergy, leverage, paradigm shift"
                  {...form4.register("words_to_avoid")}
                />
              </FormField>
            </>
          )}
        </div>
      </ScrollArea>

      {/* Navigation */}
      <div className="p-4 border-t flex items-center justify-between bg-background">
        <Button
          variant="outline"
          onClick={() => setStep(Math.max(1, step - 1))}
          disabled={step === 1}
        >
          <ChevronLeft size={14} className="mr-1" />
          Back
        </Button>
        <Button onClick={handleNext}>
          {step === 4 ? (
            <>
              <Sparkles size={14} className="mr-2" />
              Generate Context
            </>
          ) : (
            <>
              Next
              <ChevronRight size={14} className="ml-1" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

function FormField({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-medium">{label}</Label>
      {children}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
    </div>
  );
}
