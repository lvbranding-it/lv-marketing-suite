import { useState } from "react";
import { Link } from "react-router-dom";
import { Plus, FolderKanban, Pencil, ChevronRight, ArrowLeft } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useProjects } from "@/hooks/useProjects";
import { PROJECT_PHASE_LABEL, servicesSummary } from "@/components/ccs/ccsMeta";
import ServicePicker from "@/components/ccs/ServicePicker";
import {
  useCcsProjects, useCcsClients, useSaveCcsProject,
  type CcsProject, type CcsProjectPhase,
} from "@/hooks/useCcs";

const PHASES: CcsProjectPhase[] = ["brief_approval", "strategic_direction", "concept_approval", "refinement", "final_production"];
const DEFAULT_REVISION_DEF = "One revision round consists of one complete, consolidated, and internally approved collection of feedback submitted by the client's designated representative.";

type FormState = Record<string, string>;
const EMPTY: FormState = {
  project_name: "", client_id: "", linked_project_id: "", project_number: "", description: "",
  start_date: "", estimated_completion_date: "", included_revision_rounds: "2",
  revision_definition: DEFAULT_REVISION_DEF, additional_revision_minimum: "", hourly_production_rate: "",
  strategic_consultation_rate: "", reopened_phase_fee_type: "percentage", reopened_phase_fee_value: "",
  concept_restart_fee_type: "fixed", concept_restart_fee_value: "", rush_fee_percentage: "",
  current_phase: "brief_approval", status: "active",
};

const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

export default function CcsProjects() {
  const { data: projects = [], isLoading } = useCcsProjects();
  const { data: clients = [] } = useCcsClients();
  const { data: marketingProjects = [] } = useProjects();
  const save = useSaveCcsProject();
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(EMPTY);
  const [services, setServices] = useState<string[]>([]);

  const openNew = () => { setForm(EMPTY); setServices([]); setOpen(true); };
  const openEdit = (p: CcsProject) => {
    setServices(p.service_types ?? []);
    setForm({
      id: p.id, project_name: p.project_name, client_id: p.client_id, linked_project_id: p.linked_project_id ?? "", project_number: p.project_number ?? "",
      description: p.description ?? "",
      start_date: p.start_date ?? "", estimated_completion_date: p.estimated_completion_date ?? "",
      included_revision_rounds: String(p.included_revision_rounds ?? 0), revision_definition: p.revision_definition ?? DEFAULT_REVISION_DEF,
      additional_revision_minimum: p.additional_revision_minimum?.toString() ?? "", hourly_production_rate: p.hourly_production_rate?.toString() ?? "",
      strategic_consultation_rate: p.strategic_consultation_rate?.toString() ?? "", reopened_phase_fee_type: p.reopened_phase_fee_type ?? "percentage",
      reopened_phase_fee_value: p.reopened_phase_fee_value?.toString() ?? "", concept_restart_fee_type: p.concept_restart_fee_type ?? "fixed",
      concept_restart_fee_value: p.concept_restart_fee_value?.toString() ?? "", rush_fee_percentage: p.rush_fee_percentage?.toString() ?? "",
      current_phase: p.current_phase, status: p.status,
    });
    setOpen(true);
  };
  const set = (k: string, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const linkMarketing = (id: string) => {
    const mp = marketingProjects.find((m) => m.id === id);
    setForm((f) => ({
      ...f,
      linked_project_id: id === "none" ? "" : id,
      project_name: f.project_name || (mp?.name ?? ""),
      description: f.description || (mp?.description ?? ""),
    }));
  };

  const submit = async () => {
    if (!form.project_name.trim()) { toast({ title: "Project name is required", variant: "destructive" }); return; }
    if (!form.client_id) { toast({ title: "Select a client", variant: "destructive" }); return; }
    try {
      await save.mutateAsync({
        id: form.id || undefined,
        project_name: form.project_name, client_id: form.client_id,
        linked_project_id: form.linked_project_id || null,
        project_number: form.project_number || null,
        service_types: services, project_type: services.length ? services.join(" → ") : null,
        description: form.description || null,
        start_date: form.start_date || null, estimated_completion_date: form.estimated_completion_date || null,
        included_revision_rounds: Number(form.included_revision_rounds || 0),
        revision_definition: form.revision_definition || null,
        additional_revision_minimum: numOrNull(form.additional_revision_minimum),
        hourly_production_rate: numOrNull(form.hourly_production_rate),
        strategic_consultation_rate: numOrNull(form.strategic_consultation_rate),
        reopened_phase_fee_type: form.reopened_phase_fee_type as CcsProject["reopened_phase_fee_type"],
        reopened_phase_fee_value: numOrNull(form.reopened_phase_fee_value),
        concept_restart_fee_type: form.concept_restart_fee_type as CcsProject["concept_restart_fee_type"],
        concept_restart_fee_value: numOrNull(form.concept_restart_fee_value),
        rush_fee_percentage: numOrNull(form.rush_fee_percentage),
        current_phase: form.current_phase as CcsProjectPhase,
        status: form.status as CcsProject["status"],
      });
      toast({ title: form.id ? "Project updated" : "Project created" });
      setOpen(false);
    } catch (e) {
      toast({ title: "Could not save project", description: String((e as Error).message), variant: "destructive" });
    }
  };

  return (
    <AppShell>
      <div className="mx-auto max-w-6xl px-4 py-8 md:px-8">
        <Link to="/ccs" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft size={14} /> Dashboard
        </Link>
        <header className="mb-6 flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="flex items-center gap-2 text-2xl font-semibold text-foreground"><FolderKanban size={22} /> Projects</h1>
            <p className="mt-1 text-sm text-muted-foreground">{projects.length} project{projects.length === 1 ? "" : "s"}</p>
          </div>
          <Button onClick={openNew} disabled={clients.length === 0}><Plus size={16} className="mr-1.5" /> New project</Button>
        </header>

        {clients.length === 0 && !isLoading && (
          <p className="mb-4 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
            Create a <Link to="/ccs/clients" className="text-primary underline">client</Link> first, then add projects.
          </p>
        )}

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          {isLoading ? (
            <div className="space-y-2 p-4">{Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-12" />)}</div>
          ) : projects.length === 0 ? (
            <div className="p-10 text-center text-sm text-muted-foreground">No projects yet.</div>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-border bg-muted/40 text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Project</th>
                  <th className="hidden px-4 py-2.5 font-medium md:table-cell">Client</th>
                  <th className="hidden px-4 py-2.5 font-medium lg:table-cell">Phase</th>
                  <th className="px-4 py-2.5 font-medium">Rounds</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody>
                {projects.map((p) => (
                  <tr key={p.id} className="border-b border-border/60 last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <Link to={`/ccs/projects/${p.id}`} className="font-medium text-foreground hover:text-primary">{p.project_name}</Link>
                      <p className="text-xs text-muted-foreground">{p.project_number || "—"} · {servicesSummary(p.service_types, p.project_type)}</p>
                    </td>
                    <td className="hidden px-4 py-3 text-muted-foreground md:table-cell">{p.client?.company_name ?? "—"}</td>
                    <td className="hidden px-4 py-3 text-muted-foreground lg:table-cell">{PROJECT_PHASE_LABEL[p.current_phase]}</td>
                    <td className="px-4 py-3 text-muted-foreground">{p.included_revision_rounds}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)}><Pencil size={14} /></Button>
                        <Link to={`/ccs/projects/${p.id}`} className="inline-flex h-8 w-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"><ChevronRight size={16} /></Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader><DialogTitle>{form.id ? "Edit project" : "New project"}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="grid gap-4 sm:grid-cols-2">
              <F label="Project name" required><Input value={form.project_name} onChange={(e) => set("project_name", e.target.value)} /></F>
              <F label="Client" required>
                <Select value={form.client_id} onValueChange={(v) => set("client_id", v)}>
                  <SelectTrigger><SelectValue placeholder="Select client…" /></SelectTrigger>
                  <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}</SelectContent>
                </Select>
              </F>
            </div>
            <F label="Project number">
              <Input value={form.project_number} disabled placeholder="Assigned automatically (LV-YYYY-NNN)" />
            </F>
            <F label="Services (add in project order for a phased bundle)">
              <ServicePicker value={services} onChange={setServices} />
            </F>
            <F label="Description"><Textarea rows={2} value={form.description} onChange={(e) => set("description", e.target.value)} /></F>
            {marketingProjects.length > 0 && (
              <F label="Link to marketing project (optional)">
                <Select value={form.linked_project_id || "none"} onValueChange={linkMarketing}>
                  <SelectTrigger><SelectValue placeholder="Not linked" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Not linked</SelectItem>
                    {marketingProjects.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}{m.context_complete ? " · context ✓" : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </F>
            )}
            <div className="grid gap-4 sm:grid-cols-2">
              <F label="Start date"><Input type="date" value={form.start_date} onChange={(e) => set("start_date", e.target.value)} /></F>
              <F label="Estimated completion"><Input type="date" value={form.estimated_completion_date} onChange={(e) => set("estimated_completion_date", e.target.value)} /></F>
            </div>

            <div className="rounded-lg border border-border p-3">
              <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Revision & fee terms</p>
              <div className="grid gap-4 sm:grid-cols-3">
                <F label="Included rounds"><Input type="number" min="0" value={form.included_revision_rounds} onChange={(e) => set("included_revision_rounds", e.target.value)} /></F>
                <F label="Add'l revision min ($)"><Input type="number" value={form.additional_revision_minimum} onChange={(e) => set("additional_revision_minimum", e.target.value)} /></F>
                <F label="Rush fee (%)"><Input type="number" value={form.rush_fee_percentage} onChange={(e) => set("rush_fee_percentage", e.target.value)} /></F>
              </div>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <F label="Hourly production rate ($)"><Input type="number" value={form.hourly_production_rate} onChange={(e) => set("hourly_production_rate", e.target.value)} /></F>
                <F label="Strategic consultation rate ($)"><Input type="number" value={form.strategic_consultation_rate} onChange={(e) => set("strategic_consultation_rate", e.target.value)} /></F>
              </div>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <FeeField label="Reopened phase fee" type={form.reopened_phase_fee_type} value={form.reopened_phase_fee_value}
                  onType={(v) => set("reopened_phase_fee_type", v)} onValue={(v) => set("reopened_phase_fee_value", v)} />
                <FeeField label="Concept restart fee" type={form.concept_restart_fee_type} value={form.concept_restart_fee_value}
                  onType={(v) => set("concept_restart_fee_type", v)} onValue={(v) => set("concept_restart_fee_value", v)} />
              </div>
              <F label="Revision definition" className="mt-3"><Textarea rows={2} value={form.revision_definition} onChange={(e) => set("revision_definition", e.target.value)} /></F>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <F label="Current phase">
                <Select value={form.current_phase} onValueChange={(v) => set("current_phase", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{PHASES.map((p) => <SelectItem key={p} value={p}>{PROJECT_PHASE_LABEL[p]}</SelectItem>)}</SelectContent>
                </Select>
              </F>
              <F label="Status">
                <Select value={form.status} onValueChange={(v) => set("status", v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{["draft", "active", "on_hold", "complete", "archived"].map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                </Select>
              </F>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button onClick={submit} disabled={save.isPending}>{save.isPending ? "Saving…" : "Save project"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppShell>
  );
}

function F({ label, required, className, children }: { label: string; required?: boolean; className?: string; children: React.ReactNode }) {
  return (
    <div className={`grid gap-1.5 ${className ?? ""}`}>
      <Label className="text-xs">{label}{required && <span className="text-primary"> *</span>}</Label>
      {children}
    </div>
  );
}

function FeeField({ label, type, value, onType, onValue }: { label: string; type: string; value: string; onType: (v: string) => void; onValue: (v: string) => void }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2">
        <Select value={type} onValueChange={onType}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent><SelectItem value="percentage">%</SelectItem><SelectItem value="fixed">$ fixed</SelectItem></SelectContent>
        </Select>
        <Input type="number" value={value} onChange={(e) => onValue(e.target.value)} placeholder={type === "percentage" ? "25" : "2500"} />
      </div>
    </div>
  );
}
