import { useParams, Link } from "react-router-dom";
import { format } from "date-fns";
import { ArrowLeft, Mail, Phone, MapPin, FolderKanban, FileText } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import CcsStatusBadge from "@/components/ccs/CcsStatusBadge";
import { PROJECT_PHASE_LABEL } from "@/components/ccs/ccsMeta";
import { useCcsClient, useCcsProjects, useCcsRequests } from "@/hooks/useCcs";

export default function CcsClientDetail() {
  const { clientId } = useParams<{ clientId: string }>();
  const { data: client, isLoading } = useCcsClient(clientId);
  const { data: projects = [] } = useCcsProjects(clientId);
  const { data: requests = [] } = useCcsRequests({ clientId });

  return (
    <AppShell>
      <div className="mx-auto max-w-5xl px-4 py-8 md:px-8">
        <Link to="/ccs/clients" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Clients
        </Link>

        {isLoading || !client ? (
          <Skeleton className="h-32 rounded-xl" />
        ) : (
          <>
            <header className="mb-6">
              <h1 className="text-2xl font-semibold text-foreground">{client.company_name}</h1>
              <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 text-sm text-muted-foreground">
                {client.primary_contact_name && <span>{client.primary_contact_name}</span>}
                {client.primary_contact_email && <span className="inline-flex items-center gap-1"><Mail size={13} /> {client.primary_contact_email}</span>}
                {client.phone && <span className="inline-flex items-center gap-1"><Phone size={13} /> {client.phone}</span>}
                {client.address && <span className="inline-flex items-center gap-1"><MapPin size={13} /> {client.address}</span>}
              </div>
              {client.notes && <p className="mt-3 max-w-2xl rounded-lg bg-muted/50 p-3 text-sm text-muted-foreground">{client.notes}</p>}
            </header>

            <section className="mb-8">
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground"><FolderKanban size={16} /> Projects ({projects.length})</h2>
              {projects.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No projects for this client yet.</p>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2">
                  {projects.map((p) => (
                    <Link key={p.id} to={`/ccs/projects/${p.id}`} className="rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/40">
                      <p className="font-medium text-foreground">{p.project_name}</p>
                      <p className="text-xs text-muted-foreground">{p.project_number || "No number"} · {p.project_type || "—"}</p>
                      <p className="mt-2 text-xs text-muted-foreground">Phase: {PROJECT_PHASE_LABEL[p.current_phase]} · {p.included_revision_rounds} revision rounds</p>
                    </Link>
                  ))}
                </div>
              )}
            </section>

            <section>
              <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground"><FileText size={16} /> Acknowledgment requests ({requests.length})</h2>
              {requests.length === 0 ? (
                <p className="rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">No requests yet.</p>
              ) : (
                <div className="overflow-hidden rounded-xl border border-border bg-card">
                  <table className="w-full text-sm">
                    <tbody>
                      {requests.map((r) => (
                        <tr key={r.id} className="border-b border-border/60 last:border-0">
                          <td className="px-4 py-3">
                            <p className="font-medium text-foreground">{r.project?.project_name ?? "—"}</p>
                            <p className="text-xs text-muted-foreground">{r.recipient_name ?? r.recipient_email ?? "No recipient"}</p>
                          </td>
                          <td className="px-4 py-3"><CcsStatusBadge status={r.status} /></td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">{r.completion_percentage}%</td>
                          <td className="hidden px-4 py-3 text-xs text-muted-foreground sm:table-cell">{format(new Date(r.created_at), "MMM d, yyyy")}</td>
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
