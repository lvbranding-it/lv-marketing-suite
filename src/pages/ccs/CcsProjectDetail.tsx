import { useParams, Link } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, FileText, Users, Coins, Sparkles, ExternalLink } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import CcsStatusBadge from "@/components/ccs/CcsStatusBadge";
import { PROJECT_PHASE_LABEL, feeLabel, money } from "@/components/ccs/ccsMeta";
import { useCcsProject, useCcsRequests } from "@/hooks/useCcs";
import { useProject } from "@/hooks/useProjects";

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border/60 py-2 last:border-0">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="text-right text-sm font-medium text-foreground">{value}</span>
    </div>
  );
}

export default function CcsProjectDetail() {
  const { projectId } = useParams<{ projectId: string }>();
  const { data: project, isLoading } = useCcsProject(projectId);
  const { data: requests = [] } = useCcsRequests({ projectId });
  const { data: linkedProject } = useProject(project?.linked_project_id ?? undefined);

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
        <Link to="/ccs/projects" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Projects
        </Link>

        {isLoading || !project ? (
          <Skeleton className="h-40 rounded-xl" />
        ) : (
          <>
            <header className="mb-6">
              <p className="text-xs font-semibold uppercase tracking-wide text-primary">{project.client?.company_name ?? "—"}</p>
              <h1 className="mt-1 text-2xl font-semibold text-foreground">{project.project_name}</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                {project.project_number || "No number"} · {project.project_type || "—"} · Phase: {PROJECT_PHASE_LABEL[project.current_phase]}
              </p>
              {project.description && <p className="mt-3 max-w-2xl text-sm text-muted-foreground">{project.description}</p>}
            </header>

            <div className="grid gap-4 md:grid-cols-2">
              <section className="rounded-xl border border-border bg-card p-4">
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><Users size={16} /> Participants & timeline</h2>
                <Row label="Primary contact" value={project.primary_client_contact || "—"} />
                <Row label="Final approver" value={project.final_client_approver || "—"} />
                <Row label="Cost authorizer" value={project.cost_authorizer || "—"} />
                <Row label="Additional reviewers" value={(project.additional_reviewers ?? []).join(", ") || "—"} />
                <Row label="Start date" value={project.start_date ? format(new Date(project.start_date), "MMM d, yyyy") : "—"} />
                <Row label="Est. completion" value={project.estimated_completion_date ? format(new Date(project.estimated_completion_date), "MMM d, yyyy") : "—"} />
                <Row label="Status" value={project.status} />
              </section>

              <section className="rounded-xl border border-border bg-card p-4">
                <h2 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground"><Coins size={16} /> Revision & fee terms</h2>
                <Row label="Included revision rounds" value={project.included_revision_rounds} />
                <Row label="Additional revision minimum" value={money(project.additional_revision_minimum)} />
                <Row label="Hourly production rate" value={money(project.hourly_production_rate)} />
                <Row label="Strategic consultation rate" value={money(project.strategic_consultation_rate)} />
                <Row label="Reopened phase fee" value={feeLabel(project.reopened_phase_fee_type, project.reopened_phase_fee_value)} />
                <Row label="Concept restart fee" value={feeLabel(project.concept_restart_fee_type, project.concept_restart_fee_value)} />
                <Row label="Rush fee" value={project.rush_fee_percentage != null ? `${project.rush_fee_percentage}%` : "—"} />
              </section>
            </div>

            {project.revision_definition && (
              <p className="mt-4 rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">
                <span className="font-medium text-foreground">Revision round: </span>{project.revision_definition}
              </p>
            )}

            {linkedProject && (
              <section className="mt-6 rounded-xl border border-primary/20 bg-primary/[0.03] p-4">
                <div className="flex items-center justify-between gap-3">
                  <h2 className="flex items-center gap-2 text-sm font-semibold text-foreground"><Sparkles size={16} className="text-primary" /> Marketing project context</h2>
                  <a href={`/projects/${linkedProject.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs text-primary hover:underline">
                    Open project <ExternalLink size={12} />
                  </a>
                </div>
                <p className="mt-2 text-sm font-medium text-foreground">{linkedProject.name}</p>
                {linkedProject.client_name && <p className="text-xs text-muted-foreground">Client: {linkedProject.client_name}</p>}
                {linkedProject.description && <p className="mt-1.5 text-sm text-muted-foreground">{linkedProject.description}</p>}
                <p className="mt-2 text-xs text-muted-foreground">
                  {linkedProject.context_complete
                    ? "AI marketing context is set — the project's strategy and nature are on file."
                    : "This project has no completed marketing context yet."}
                </p>
              </section>
            )}

            <section className="mt-8">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground"><FileText size={16} /> Acknowledgment requests ({requests.length})</h2>
              {requests.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No requests for this project yet.</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                  <table className="w-full text-sm">
                    <tbody>
                      {requests.map((r) => (
                        <tr key={r.id} className="border-b border-border/60 last:border-0">
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">{r.recipient_name ?? r.recipient_email ?? "No recipient"}</p>
                            <p className="text-xs text-muted-foreground">Created {format(new Date(r.created_at), "MMM d, yyyy")}</p>
                          </td>
                          <td className="px-4 py-3"><CcsStatusBadge status={r.status} /></td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{r.completion_percentage}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    </AppShell>
  );
}
