import { useState, useEffect } from "react";
import { useParams, useNavigate, useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, CheckCircle2, AlertCircle, Settings2, Zap } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import SkillOutputCard from "@/components/skills/SkillOutputCard";
import MarketingContextWizard from "@/components/projects/MarketingContextWizard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useProject } from "@/hooks/useProjects";
import { useSkillOutputs } from "@/hooks/useSkillOutputs";
import { cn } from "@/lib/utils";

const STATUS_STYLES: Record<string, string> = {
  active: "bg-green-50 text-green-700 border-green-200",
  paused: "bg-amber-50 text-amber-700 border-amber-200",
  archived: "bg-slate-50 text-slate-600 border-slate-200",
};

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
          <Link to="/projects" className="text-primary text-sm underline">
            Back to Projects
          </Link>
        </div>
      </AppShell>
    );
  }

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
              onComplete={() => {
                setShowWizard(false);
                navigate(`/projects/${project.id}`);
              }}
              onSkip={() => setShowWizard(false)}
            />
          </div>
        </div>
      </AppShell>
    );
  }

  const contextData = project.marketing_context as Record<string, unknown>;

  return (
    <AppShell>
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

      <div className="p-3 sm:p-6 max-w-5xl mx-auto space-y-4 sm:space-y-6">
        {/* Project header */}
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
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate(`/skills`)}
          >
            <Zap size={13} className="mr-1.5" />
            Run a Skill
          </Button>
        </div>

        {/* Marketing Context section */}
        <div className="bg-card border border-border rounded-lg p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              {project.context_complete ? (
                <CheckCircle2 size={16} className="text-green-500" />
              ) : (
                <AlertCircle size={16} className="text-amber-500" />
              )}
              <h2 className="text-sm font-semibold">Marketing Context</h2>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => setShowWizard(true)}
            >
              <Settings2 size={12} className="mr-1.5" />
              {project.context_complete ? "Edit" : "Set Up"}
            </Button>
          </div>

          {project.context_complete && contextData?.raw_markdown ? (
            <div className="text-xs text-muted-foreground">
              Context document ready. All skills will use this automatically.
              {contextData.generated_at ? (
                <span className="ml-2 text-muted-foreground/60">
                  Generated {new Date(String(contextData.generated_at)).toLocaleDateString()}
                </span>
              ) : null}
            </div>
          ) : (
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">
                Set up a marketing context to improve all skill outputs for this project.
              </p>
              <Button size="sm" onClick={() => setShowWizard(true)}>
                Set Up Context
              </Button>
            </div>
          )}
        </div>

        {/* Outputs */}
        <Tabs defaultValue="outputs">
          <TabsList>
            <TabsTrigger value="outputs">
              Outputs ({outputs.length})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="outputs" className="mt-4">
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
