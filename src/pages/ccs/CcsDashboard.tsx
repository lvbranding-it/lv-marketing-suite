import { useMemo } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import {
  ShieldCheck, Clock, CheckCircle2, CalendarX, Sparkles, History as HistoryIcon,
  AlertTriangle, PenLine, Users, FolderKanban, ChevronRight, Flag, Plus,
} from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { Skeleton } from "@/components/ui/skeleton";
import CcsStatusBadge from "@/components/ccs/CcsStatusBadge";
import { useCcsRequests, computeCcsMetrics, requestHasAiInput, requestHasPriorUse, type CcsRequest } from "@/hooks/useCcs";
import { cn } from "@/lib/utils";

function MetricCard({ icon: Icon, label, value, accent }: { icon: React.ElementType; label: string; value: number; accent?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon size={16} className={cn(accent && "text-primary")} />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className={cn("mt-2 text-2xl font-semibold", accent ? "text-primary" : "text-foreground")}>{value}</p>
    </div>
  );
}

export default function CcsDashboard() {
  const { data: requests = [], isLoading } = useCcsRequests();
  const metrics = useMemo(() => computeCcsMetrics(requests), [requests]);

  const recent = useMemo(
    () =>
      [...requests]
        .sort((a, b) => new Date(b.last_activity_at ?? b.created_at).getTime() - new Date(a.last_activity_at ?? a.created_at).getTime())
        .slice(0, 12),
    [requests]
  );

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
        <header className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-primary">Creative Collaboration Standard</p>
            <h1 className="mt-1 text-2xl font-semibold text-foreground">Collaboration Dashboard</h1>
            <p className="mt-1 text-sm text-muted-foreground">Acknowledgment requests, disclosures, and follow-ups across your projects.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link to="/ccs/clients" className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
              <Users size={16} /> Clients
            </Link>
            <Link to="/ccs/projects" className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm font-medium hover:bg-muted">
              <FolderKanban size={16} /> Projects
            </Link>
            <Link to="/ccs/requests/new" className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90">
              <Plus size={16} /> New request
            </Link>
          </div>
        </header>

        {isLoading ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <MetricCard icon={ShieldCheck} label="Active requests" value={metrics.totalActive} accent />
            <MetricCard icon={Clock} label="Awaiting completion" value={metrics.awaitingCompletion} />
            <MetricCard icon={PenLine} label="Awaiting acceptance" value={metrics.awaitingAcceptance} />
            <MetricCard icon={CheckCircle2} label="Completed this month" value={metrics.completedThisMonth} />
            <MetricCard icon={CalendarX} label="Expired" value={metrics.expired} />
            <MetricCard icon={Sparkles} label="AI-assisted input" value={metrics.withAiInput} />
            <MetricCard icon={HistoryIcon} label="Prior-use disclosures" value={metrics.withPriorUse} />
            <MetricCard icon={AlertTriangle} label="Needs admin review" value={metrics.needingReview} accent />
          </div>
        )}

        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold text-foreground">Recent activity</h2>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {isLoading ? (
              <div className="space-y-2 p-4">{Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}</div>
            ) : recent.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">
                No acknowledgment requests yet.
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Client / Project</th>
                    <th className="px-4 py-2.5 font-medium">Status</th>
                    <th className="px-4 py-2.5 font-medium">Progress</th>
                    <th className="px-4 py-2.5 font-medium">Flags</th>
                    <th className="hidden px-4 py-2.5 font-medium md:table-cell">Last activity</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((r) => <ActivityRow key={r.id} r={r} />)}
                </tbody>
              </table>
            )}
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function ActivityRow({ r }: { r: CcsRequest }) {
  const last = r.last_activity_at ?? r.created_at;
  return (
    <tr className="border-b border-border/60 last:border-0 hover:bg-muted/30">
      <td className="px-4 py-3">
        <Link to={`/ccs/requests/${r.id}`} className="group flex items-center gap-1">
          <div>
            <p className="font-medium text-foreground">{r.client?.company_name ?? "—"}</p>
            <p className="text-xs text-muted-foreground">
              {r.project?.project_name ?? "—"}{r.project?.project_number ? ` · ${r.project.project_number}` : ""}
            </p>
          </div>
          <ChevronRight size={14} className="text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
        </Link>
      </td>
      <td className="px-4 py-3"><CcsStatusBadge status={r.status} /></td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
            <div className="h-full rounded-full bg-primary" style={{ width: `${r.completion_percentage}%` }} />
          </div>
          <span className="text-xs text-muted-foreground">{r.completion_percentage}%</span>
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {requestHasAiInput(r) && <span className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground"><Sparkles size={11} /> AI</span>}
          {requestHasPriorUse(r) && <span className="inline-flex items-center gap-1 rounded bg-secondary px-1.5 py-0.5 text-[11px] text-secondary-foreground"><HistoryIcon size={11} /> Prior use</span>}
          {r.admin_review_required && <span className="inline-flex items-center gap-1 rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary"><AlertTriangle size={11} /> Review</span>}
          {r.follow_up_flag && <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-1.5 py-0.5 text-[11px] text-amber-700"><Flag size={11} /> Follow-up</span>}
        </div>
      </td>
      <td className="hidden px-4 py-3 text-xs text-muted-foreground md:table-cell">{format(new Date(last), "MMM d, yyyy")}</td>
    </tr>
  );
}
