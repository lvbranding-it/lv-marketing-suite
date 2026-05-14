import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import {
  ArrowLeft, CheckCircle2, AlertCircle, Settings2, Zap,
  FileText, Sparkles, ClipboardList, Mail, Building2,
  Globe, Users, Target, Award, MessageSquare,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import SkillOutputCard from "@/components/skills/SkillOutputCard";
import MarketingContextWizard from "@/components/projects/MarketingContextWizard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { MarkdownContent } from "@/components/ui/markdown-content";
import { useProject } from "@/hooks/useProjects";
import { useSkillOutputs } from "@/hooks/useSkillOutputs";
import { cn } from "@/lib/utils";

// ── Status styles ─────────────────────────────────────────────────────────────
const STATUS_STYLES: Record<string, string> = {
  active:   "bg-green-50 text-green-700 border-green-200",
  paused:   "bg-amber-50 text-amber-700 border-amber-200",
  archived: "bg-slate-50 text-slate-600 border-slate-200",
};

// ── Brief field helpers ───────────────────────────────────────────────────────
function BriefSection({ icon: Icon, title, children }: {
  icon: React.ElementType; title: string; children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Icon size={14} className="text-rose-500 shrink-0" />
        <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wider">{title}</h3>
      </div>
      <div className="bg-gray-50 border border-gray-100 rounded-xl p-4 space-y-3">
        {children}
      </div>
    </div>
  );
}

function BriefRow({ label, value }: { label: string; value?: string | null }) {
  if (!value) return null;
  return (
    <div>
      <p className="text-[11px] text-gray-400 mb-0.5">{label}</p>
      <p className="text-sm text-gray-800 leading-relaxed">{value}</p>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function ProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const { data: project, isLoading: projectLoading } = useProject(projectId);
  const { data: outputs = [], isLoading: outputsLoading } = useSkillOutputs({ projectId });

  const [showWizard, setShowWizard] = useState(false);

  useEffect(() => {
    if (searchParams.get("setup") === "context" && project && !project.context_complete) {
      setShowWizard(true);
    }
  }, [searchParams, project]);

  // ── Loading ───────────────────────────────────────────────────────────────
  if (projectLoading) {
    return (
      <AppShell>
        <div className="p-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-48 w-full" />
        </div>
      </AppShell>
    );
  }

  if (!project) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center h-full p-8 text-center">
          <p className="text-4xl mb-3">❓</p>
          <p className="text-muted-foreground text-sm mb-4">Project not found.</p>
          <Link to="/projects" className="text-primary text-sm underline">Back to Projects</Link>
        </div>
      </AppShell>
    );
  }

  // ── Wizard mode ───────────────────────────────────────────────────────────
  if (showWizard) {
    return (
      <AppShell>
        <div className="flex flex-col h-full">
          <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0">
            <button
              onClick={() => setShowWizard(false)}
              className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft size={13} />
              {project.name}
            </button>
            <span className="text-muted-foreground text-xs">/</span>
            <span className="text-xs font-medium">Marketing Context Setup</span>
          </div>
          <div className="flex-1 min-h-0">
            <MarketingContextWizard
              projectId={project.id}
              onComplete={() => { setShowWizard(false); navigate(`/projects/${project.id}`); }}
              onSkip={() => setShowWizard(false)}
            />
          </div>
        </div>
      </AppShell>
    );
  }

  // ── Derived data ──────────────────────────────────────────────────────────
  const contextData = project.marketing_context as Record<string, unknown> | null;
  const intakeInputs = contextData?.intake_inputs as Record<string, string> | null;
  const rawMarkdown  = contextData?.raw_markdown as string | null;
  const generatedAt  = contextData?.generated_at as string | null;

  const hasIntakeBrief = !!(intakeInputs && Object.keys(intakeInputs).length > 0);
  const hasContextDoc  = !!rawMarkdown;

  // Decide default tab: if intake data exists, open on brief, otherwise outputs
  const defaultTab = hasIntakeBrief || hasContextDoc ? "brief" : "outputs";

  return (
    <AppShell>
      {/* Breadcrumb */}
      <div className="flex items-center gap-3 px-4 py-3 border-b bg-background">
        <button
          onClick={() => navigate("/projects")}
          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={13} />
          Projects
        </button>
        <span className="text-muted-foreground">/</span>
        <span className="text-sm font-medium">{project.name}</span>
        <Badge
          variant="outline"
          className={cn("text-[10px] ml-1", STATUS_STYLES[project.status] ?? STATUS_STYLES.active)}
        >
          {project.status}
        </Badge>
      </div>

      <div className="p-3 sm:p-6 max-w-5xl mx-auto space-y-5">

        {/* ── Project header ──────────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-xl font-bold text-foreground">{project.name}</h1>
            {project.client_name && (
              <p className="text-sm text-muted-foreground">{project.client_name}</p>
            )}
            {project.description && (
              <p className="text-sm text-muted-foreground mt-1">{project.description}</p>
            )}
          </div>
          <Button variant="outline" size="sm" onClick={() => navigate("/skills")}>
            <Zap size={13} className="mr-1.5" />
            Run a Skill
          </Button>
        </div>

        {/* ── Marketing context status pill ───────────────────────────────── */}
        <div className="flex items-center justify-between bg-card border border-border rounded-lg px-4 py-3">
          <div className="flex items-center gap-2">
            {project.context_complete ? (
              <CheckCircle2 size={15} className="text-green-500 shrink-0" />
            ) : (
              <AlertCircle size={15} className="text-amber-500 shrink-0" />
            )}
            <span className="text-sm font-medium">Marketing Context</span>
            {project.context_complete && generatedAt && (
              <span className="text-xs text-muted-foreground hidden sm:block">
                · Generated {new Date(generatedAt).toLocaleDateString("en-US", { dateStyle: "medium" })}
              </span>
            )}
            {!project.context_complete && (
              <span className="text-xs text-muted-foreground">— not set up yet</span>
            )}
          </div>
          <Button variant="ghost" size="sm" className="text-xs" onClick={() => setShowWizard(true)}>
            <Settings2 size={12} className="mr-1.5" />
            {project.context_complete ? "Edit" : "Set Up"}
          </Button>
        </div>

        {/* ── Tabs ────────────────────────────────────────────────────────── */}
        <Tabs defaultValue={defaultTab}>
          <TabsList className="w-full justify-start">
            {(hasIntakeBrief || hasContextDoc) && (
              <TabsTrigger value="brief" className="gap-1.5">
                <FileText size={13} />
                Client Brief
              </TabsTrigger>
            )}
            {hasContextDoc && (
              <TabsTrigger value="context" className="gap-1.5">
                <Sparkles size={13} />
                AI Context
              </TabsTrigger>
            )}
            <TabsTrigger value="outputs">
              <ClipboardList size={13} className="mr-1.5" />
              Outputs ({outputs.length})
            </TabsTrigger>
          </TabsList>

          {/* ── Client Brief tab ──────────────────────────────────────────── */}
          {(hasIntakeBrief || hasContextDoc) && (
            <TabsContent value="brief" className="mt-5">
              {hasIntakeBrief ? (
                <div className="space-y-5">
                  <BriefSection icon={Mail} title="Contact & Company">
                    <BriefRow label="Full Name"    value={intakeInputs!.contact_name} />
                    <BriefRow label="Email"        value={intakeInputs!.contact_email} />
                    <BriefRow label="Role / Title" value={intakeInputs!.contact_role} />
                    <BriefRow label="Company"      value={intakeInputs!.company_name} />
                    <BriefRow label="Website"      value={intakeInputs!.website} />
                  </BriefSection>

                  <Separator />

                  <BriefSection icon={Building2} title="Business">
                    <BriefRow label="Industry"       value={intakeInputs!.industry} />
                    <BriefRow label="Company Size"   value={intakeInputs!.company_size} />
                    <BriefRow label="Business Model" value={intakeInputs!.business_model} />
                    <BriefRow label="One-Liner"      value={intakeInputs!.one_liner} />
                  </BriefSection>

                  <Separator />

                  <BriefSection icon={Target} title="Goals & Audience">
                    <BriefRow label="Goals"          value={intakeInputs!.goals} />
                    <BriefRow label="Ideal Customer" value={intakeInputs!.ideal_customer} />
                    <BriefRow label="Top Pain Point" value={intakeInputs!.top_problem} />
                    <BriefRow label="Timeline"       value={intakeInputs!.timeline} />
                  </BriefSection>

                  <Separator />

                  <BriefSection icon={Award} title="Brand & Competition">
                    <BriefRow label="Competitors"     value={intakeInputs!.competitors} />
                    <BriefRow label="Differentiators" value={intakeInputs!.differentiators} />
                    <BriefRow label="Brand Tone"      value={intakeInputs!.tone} />
                    <BriefRow label="Extra Notes"     value={intakeInputs!.extra_notes} />
                  </BriefSection>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3 py-16 text-center">
                  <FileText size={36} className="text-gray-200" />
                  <p className="text-sm font-medium text-gray-500">No intake brief linked</p>
                  <p className="text-xs text-gray-400">This project wasn't converted from a client intake form.</p>
                </div>
              )}
            </TabsContent>
          )}

          {/* ── AI Context tab ────────────────────────────────────────────── */}
          {hasContextDoc && (
            <TabsContent value="context" className="mt-5">
              <div className="bg-card border border-border rounded-xl px-5 py-5">
                <MarkdownContent>{rawMarkdown!}</MarkdownContent>
              </div>
            </TabsContent>
          )}

          {/* ── Outputs tab ───────────────────────────────────────────────── */}
          <TabsContent value="outputs" className="mt-5">
            {outputsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => <Skeleton key={i} className="h-20 w-full" />)}
              </div>
            ) : outputs.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-3xl mb-3">📄</p>
                <p className="text-sm text-muted-foreground mb-4">
                  No outputs saved for this project yet.
                </p>
                <Button onClick={() => navigate("/skills")} variant="outline" size="sm">
                  <Zap size={13} className="mr-1.5" />
                  Run a Skill
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-3">
                {outputs.map((output) => (
                  <SkillOutputCard key={output.id} output={output} />
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </AppShell>
  );
}
