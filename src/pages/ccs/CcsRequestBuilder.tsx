import { useState, useMemo } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Check, Copy, Link2, Save, ShieldCheck, Loader2, Mail } from "lucide-react";
import AppShell from "@/components/layout/AppShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { PROJECT_PHASE_LABEL } from "@/components/ccs/ccsMeta";
import {
  useCcsClients, useCcsProjects, useSaveCcsClient, useSaveCcsProject, useSaveCcsRequest,
  useCcsActiveTemplate, generateSecureToken,
  COLLABORATION_TERMS, IP_TERMS, defaultCollaborationConfig, defaultIpConfig,
  type CcsProject, type CcsProjectPhase, type CcsFeeType,
} from "@/hooks/useCcs";

const STEPS = ["Client & project", "Participants", "Revision terms", "Collaboration", "Intellectual property", "Review & send"];
const PROJECT_TYPES = ["Branding", "Graphic design", "Website design", "Website development", "UX/UI", "Photography", "Video production", "Advertising campaign", "Social media content", "AV production", "Consulting", "Marketing strategy", "Content development", "Other"];
const PHASES: CcsProjectPhase[] = ["brief_approval", "strategic_direction", "concept_approval", "refinement", "final_production"];
const DEFAULT_REVISION_DEF = "One revision round consists of one complete, consolidated, and internally approved collection of feedback submitted by the client's designated representative.";

interface Form {
  clientMode: string; clientId: string; newClientName: string; newClientEmail: string;
  projectMode: string; projectId: string;
  project_name: string; project_number: string; project_type: string; description: string;
  start_date: string; estimated_completion_date: string; current_phase: string;
  primary_client_contact: string; final_client_approver: string; additional_reviewers: string; cost_authorizer: string;
  lvProjectLead: string; lvAdditionalContact: string;
  included_revision_rounds: string; revision_definition: string;
  additional_revision_minimum: string; hourly_production_rate: string; strategic_consultation_rate: string;
  reopened_phase_fee_type: string; reopened_phase_fee_value: string;
  concept_restart_fee_type: string; concept_restart_fee_value: string; rush_fee_percentage: string;
  custom_revision_notes: string;
  recipient_name: string; recipient_email: string; intro_message: string; expires_at: string;
  collaboration: Record<string, boolean>; ip: Record<string, boolean>;
  require_email_verification: boolean; require_all_acknowledgments: boolean; capture_ip: boolean;
}

const initialForm = (): Form => ({
  clientMode: "existing", clientId: "", newClientName: "", newClientEmail: "",
  projectMode: "existing", projectId: "",
  project_name: "", project_number: "", project_type: "Branding", description: "",
  start_date: "", estimated_completion_date: "", current_phase: "brief_approval",
  primary_client_contact: "", final_client_approver: "", additional_reviewers: "", cost_authorizer: "",
  lvProjectLead: "", lvAdditionalContact: "",
  included_revision_rounds: "2", revision_definition: DEFAULT_REVISION_DEF,
  additional_revision_minimum: "", hourly_production_rate: "", strategic_consultation_rate: "",
  reopened_phase_fee_type: "percentage", reopened_phase_fee_value: "",
  concept_restart_fee_type: "fixed", concept_restart_fee_value: "", rush_fee_percentage: "",
  custom_revision_notes: "",
  recipient_name: "", recipient_email: "", intro_message: "", expires_at: "",
  collaboration: defaultCollaborationConfig(), ip: defaultIpConfig(),
  require_email_verification: false, require_all_acknowledgments: true, capture_ip: false,
});

const numOrNull = (s: string) => (s.trim() === "" ? null : Number(s));

export default function CcsRequestBuilder() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { toast } = useToast();
  const { data: clients = [] } = useCcsClients();
  const { data: projects = [] } = useCcsProjects();
  const { data: template } = useCcsActiveTemplate();
  const saveClient = useSaveCcsClient();
  const saveProject = useSaveCcsProject();
  const saveRequest = useSaveCcsRequest();

  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(() => {
    const f = initialForm();
    const preClient = params.get("clientId");
    if (preClient) f.clientId = preClient;
    return f;
  });

  const set = (k: string, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }) as Form);
  const setToggle = (group: "collaboration" | "ip", key: string, v: boolean) =>
    setForm((f) => ({ ...f, [group]: { ...f[group], [key]: v } }) as Form);

  const clientProjects = useMemo(
    () => projects.filter((p) => p.client_id === form.clientId),
    [projects, form.clientId]
  );

  // Preload an existing project's fields into editable state
  const loadProject = (p: CcsProject) => {
    setForm((f) => ({
      ...f, projectId: p.id, project_name: p.project_name, project_number: p.project_number ?? "",
      project_type: p.project_type ?? "Branding", description: p.description ?? "",
      start_date: p.start_date ?? "", estimated_completion_date: p.estimated_completion_date ?? "",
      current_phase: p.current_phase, primary_client_contact: p.primary_client_contact ?? "",
      final_client_approver: p.final_client_approver ?? "", additional_reviewers: (p.additional_reviewers ?? []).join(", "),
      cost_authorizer: p.cost_authorizer ?? "", included_revision_rounds: String(p.included_revision_rounds ?? 0),
      revision_definition: p.revision_definition ?? DEFAULT_REVISION_DEF,
      additional_revision_minimum: p.additional_revision_minimum?.toString() ?? "",
      hourly_production_rate: p.hourly_production_rate?.toString() ?? "",
      strategic_consultation_rate: p.strategic_consultation_rate?.toString() ?? "",
      reopened_phase_fee_type: p.reopened_phase_fee_type ?? "percentage", reopened_phase_fee_value: p.reopened_phase_fee_value?.toString() ?? "",
      concept_restart_fee_type: p.concept_restart_fee_type ?? "fixed", concept_restart_fee_value: p.concept_restart_fee_value?.toString() ?? "",
      rush_fee_percentage: p.rush_fee_percentage?.toString() ?? "", custom_revision_notes: p.custom_revision_notes ?? "",
    }));
  };

  const selectClient = (id: string) => {
    const c = clients.find((x) => x.id === id);
    setForm((f) => ({
      ...f, clientId: id, projectId: "",
      recipient_name: f.recipient_name || c?.primary_contact_name || "",
      recipient_email: f.recipient_email || c?.primary_contact_email || "",
    }));
  };

  const canContinue = (): boolean => {
    if (step === 0) {
      const clientOk = form.clientMode === "existing" ? !!form.clientId : !!form.newClientName.trim();
      const projectOk = form.projectMode === "existing" ? !!form.projectId : !!form.project_name.trim();
      return clientOk && projectOk;
    }
    return true;
  };

  // Persist client + project, then create the request. Returns request id + token if generated.
  async function persist(action: "draft" | "link" | "send"): Promise<void> {
    setBusy(true);
    try {
      // 1. Client
      let clientId = form.clientId;
      if (form.clientMode === "new") {
        const c = await saveClient.mutateAsync({ company_name: form.newClientName, primary_contact_email: form.newClientEmail || null });
        clientId = c.id;
      }
      // 2. Project (create or update with participants + terms)
      const projectFields = {
        client_id: clientId, project_name: form.project_name || "Untitled project", project_number: form.project_number || null,
        project_type: form.project_type || null, description: form.description || null,
        start_date: form.start_date || null, estimated_completion_date: form.estimated_completion_date || null,
        current_phase: form.current_phase as CcsProjectPhase,
        primary_client_contact: form.primary_client_contact || null, final_client_approver: form.final_client_approver || null,
        additional_reviewers: form.additional_reviewers.split(",").map((s) => s.trim()).filter(Boolean),
        cost_authorizer: form.cost_authorizer || null,
        included_revision_rounds: Number(form.included_revision_rounds || 0), revision_definition: form.revision_definition || null,
        additional_revision_minimum: numOrNull(form.additional_revision_minimum), hourly_production_rate: numOrNull(form.hourly_production_rate),
        strategic_consultation_rate: numOrNull(form.strategic_consultation_rate),
        reopened_phase_fee_type: form.reopened_phase_fee_type as CcsFeeType, reopened_phase_fee_value: numOrNull(form.reopened_phase_fee_value),
        concept_restart_fee_type: form.concept_restart_fee_type as CcsFeeType, concept_restart_fee_value: numOrNull(form.concept_restart_fee_value),
        rush_fee_percentage: numOrNull(form.rush_fee_percentage), custom_revision_notes: form.custom_revision_notes || null,
      };
      const project = await saveProject.mutateAsync(form.projectMode === "existing" && form.projectId ? { id: form.projectId, ...projectFields } : projectFields);

      // 3. Request
      let secure_token_hash: string | null = null;
      let token: string | null = null;
      if (action !== "draft") {
        const gen = await generateSecureToken();
        token = gen.token;
        secure_token_hash = gen.hash;
      }
      const req = await saveRequest.mutateAsync({
        client_id: clientId, project_id: project.id,
        template_id: template?.id ?? null, template_version: template?.version ?? null, project_terms_version: "1.0",
        recipient_name: form.recipient_name || null, recipient_email: form.recipient_email || null,
        intro_message: form.intro_message || null,
        require_email_verification: form.require_email_verification,
        require_all_acknowledgments: form.require_all_acknowledgments,
        capture_ip: form.capture_ip,
        expires_at: form.expires_at ? `${form.expires_at}T23:59:59` : null,
        status: action === "send" ? "sent" : action === "link" ? "ready_to_send" : "draft",
        sent_at: action === "send" ? new Date().toISOString() : null,
        config_json: {
          participants: { lvProjectLead: form.lvProjectLead, lvAdditionalContact: form.lvAdditionalContact },
          collaboration: form.collaboration, ip: form.ip,
        },
        secure_token_hash,
      });

      if (token) {
        const reviewLink = `${window.location.origin}/review/${token}`;
        setLink(reviewLink);
        if (action === "send" && form.recipient_email) {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const { error: mailErr } = await (supabase.functions as any).invoke("ccs-send-invite", {
            body: { request_id: req.id, review_link: reviewLink, message: form.intro_message || undefined },
          });
          if (mailErr) toast({ title: "Request created, but the email could not be sent", description: "Share the secure link manually.", variant: "destructive" });
          else toast({ title: `Invitation emailed to ${form.recipient_email}` });
        } else {
          toast({ title: "Secure link generated" });
        }
      } else {
        toast({ title: "Saved as draft" });
        navigate(`/ccs/projects/${project.id}`);
      }
      void req;
    } catch (e) {
      toast({ title: "Could not save request", description: String((e as Error).message), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }

  // Success screen after link generation
  if (link) {
    return (
      <AppShell>
        <div className="mx-auto max-w-xl px-4 py-16 md:px-8">
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary"><Check size={24} /></div>
            <h1 className="text-xl font-semibold text-foreground">Secure link ready</h1>
            <p className="mt-2 text-sm text-muted-foreground">Share this private link with the client representative. Email delivery via SendGrid arrives in a later phase.</p>
            <div className="mt-5 flex items-center gap-2 rounded-lg border border-border bg-muted/40 p-2">
              <Link2 size={16} className="shrink-0 text-muted-foreground" />
              <span className="flex-1 truncate text-left text-sm">{link}</span>
              <Button size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(link); toast({ title: "Link copied" }); }}>
                <Copy size={14} className="mr-1" /> Copy
              </Button>
            </div>
            <div className="mt-6 flex justify-center gap-2">
              <Button variant="outline" onClick={() => navigate("/ccs")}>Back to dashboard</Button>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="mx-auto max-w-3xl px-4 py-8 md:px-8">
        <Link to="/ccs" className="mb-4 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft size={14} /> Dashboard</Link>
        <header className="mb-6">
          <p className="text-xs font-semibold uppercase tracking-wide text-primary">New request</p>
          <h1 className="mt-1 flex items-center gap-2 text-2xl font-semibold text-foreground"><ShieldCheck size={22} /> Creative Collaboration Standard</h1>
        </header>

        {/* Stepper */}
        <ol className="mb-6 flex flex-wrap gap-2 text-xs">
          {STEPS.map((label, i) => (
            <li key={label} className={cn("flex items-center gap-1.5 rounded-full border px-3 py-1", i === step ? "border-primary bg-primary/5 text-primary" : i < step ? "border-border text-foreground" : "border-border text-muted-foreground")}>
              <span className={cn("flex h-4 w-4 items-center justify-center rounded-full text-[10px]", i < step ? "bg-primary text-primary-foreground" : i === step ? "bg-primary text-primary-foreground" : "bg-muted")}>{i < step ? <Check size={10} /> : i + 1}</span>
              <span className="hidden sm:inline">{label}</span>
            </li>
          ))}
        </ol>

        <div className="rounded-xl border border-border bg-card p-6">
          {step === 0 && <StepClientProject form={form} set={set} clients={clients} clientProjects={clientProjects} selectClient={selectClient} loadProject={loadProject} />}
          {step === 1 && <StepParticipants form={form} set={set} />}
          {step === 2 && <StepRevision form={form} set={set} />}
          {step === 3 && <StepToggles title="Collaboration terms" description="Enable the acknowledgments this project requires." terms={COLLABORATION_TERMS} values={form.collaboration} onToggle={(k, v) => setToggle("collaboration", k, v)} />}
          {step === 4 && <StepToggles title="Intellectual property terms" description="Configure what transfers to the client and what LV Branding retains." terms={IP_TERMS} values={form.ip} onToggle={(k, v) => setToggle("ip", k, v)} />}
          {step === 5 && <StepReview form={form} set={set} templateVersion={template?.version} />}
        </div>

        {step === 4 && (
          <p className="mt-3 rounded-lg border border-border bg-muted/40 p-3 text-xs text-muted-foreground">
            This application supports project acknowledgment and workflow documentation. Final contractual language should be reviewed by qualified legal counsel.
          </p>
        )}

        {/* Nav */}
        <div className="mt-6 flex items-center justify-between">
          <Button variant="ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0 || busy}><ArrowLeft size={16} className="mr-1" /> Back</Button>
          {step < STEPS.length - 1 ? (
            <Button onClick={() => canContinue() ? setStep((s) => s + 1) : toast({ title: "Complete the required fields", variant: "destructive" })} disabled={!canContinue()}>
              Continue <ArrowRight size={16} className="ml-1" />
            </Button>
          ) : (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => persist("draft")} disabled={busy}>
                {busy ? <Loader2 size={16} className="mr-1 animate-spin" /> : <Save size={16} className="mr-1" />} Save draft
              </Button>
              <Button variant="outline" onClick={() => persist("link")} disabled={busy}>
                {busy ? <Loader2 size={16} className="mr-1 animate-spin" /> : <Link2 size={16} className="mr-1" />} Secure link
              </Button>
              <Button onClick={() => persist("send")} disabled={busy || !form.recipient_email}>
                {busy ? <Loader2 size={16} className="mr-1 animate-spin" /> : <Mail size={16} className="mr-1" />} Send invitation
              </Button>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

// ── Step field helpers ─────────────────────────────────────────────────────────
function F({ label, required, hint, children }: { label: string; required?: boolean; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">{label}{required && <span className="text-primary"> *</span>}</Label>
      {children}
      {hint && <p className="text-[11px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

type StepProps = { form: Form; set: (k: string, v: string | boolean) => void };

function StepClientProject({ form, set, clients, clientProjects, selectClient, loadProject }: StepProps & {
  clients: { id: string; company_name: string }[];
  clientProjects: CcsProject[];
  selectClient: (id: string) => void;
  loadProject: (p: CcsProject) => void;
}) {
  return (
    <div className="grid gap-5">
      <div>
        <h2 className="mb-1 text-base font-semibold text-foreground">Client</h2>
        <p className="mb-3 text-sm text-muted-foreground">Choose an existing client or add a new one.</p>
        <div className="mb-3 flex gap-2">
          <ModeToggle active={form.clientMode === "existing"} onClick={() => set("clientMode", "existing")} label="Existing" />
          <ModeToggle active={form.clientMode === "new"} onClick={() => set("clientMode", "new")} label="New client" />
        </div>
        {form.clientMode === "existing" ? (
          <Select value={form.clientId} onValueChange={selectClient}>
            <SelectTrigger><SelectValue placeholder="Select client…" /></SelectTrigger>
            <SelectContent>{clients.map((c) => <SelectItem key={c.id} value={c.id}>{c.company_name}</SelectItem>)}</SelectContent>
          </Select>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Company name" required><Input value={form.newClientName} onChange={(e) => set("newClientName", e.target.value)} /></F>
            <F label="Primary contact email"><Input type="email" value={form.newClientEmail} onChange={(e) => set("newClientEmail", e.target.value)} /></F>
          </div>
        )}
      </div>

      <div className="border-t border-border pt-5">
        <h2 className="mb-1 text-base font-semibold text-foreground">Project</h2>
        <div className="mb-3 flex gap-2">
          <ModeToggle active={form.projectMode === "existing"} onClick={() => set("projectMode", "existing")} label="Existing" />
          <ModeToggle active={form.projectMode === "new"} onClick={() => set("projectMode", "new")} label="New project" />
        </div>
        {form.projectMode === "existing" ? (
          form.clientMode === "new" ? (
            <p className="text-sm text-muted-foreground">Switch to “New project” when creating a new client.</p>
          ) : (
            <Select value={form.projectId} onValueChange={(id) => { const p = clientProjects.find((x) => x.id === id); if (p) loadProject(p); }}>
              <SelectTrigger><SelectValue placeholder={clientProjects.length ? "Select project…" : "No projects for this client yet"} /></SelectTrigger>
              <SelectContent>{clientProjects.map((p) => <SelectItem key={p.id} value={p.id}>{p.project_name}{p.project_number ? ` · ${p.project_number}` : ""}</SelectItem>)}</SelectContent>
            </Select>
          )
        ) : (
          <div className="grid gap-3 sm:grid-cols-2">
            <F label="Project name" required><Input value={form.project_name} onChange={(e) => set("project_name", e.target.value)} /></F>
            <F label="Project number"><Input value={form.project_number} onChange={(e) => set("project_number", e.target.value)} /></F>
            <F label="Project type">
              <Select value={form.project_type} onValueChange={(v) => set("project_type", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PROJECT_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
              </Select>
            </F>
            <F label="Current phase">
              <Select value={form.current_phase} onValueChange={(v) => set("current_phase", v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{PHASES.map((p) => <SelectItem key={p} value={p}>{PROJECT_PHASE_LABEL[p]}</SelectItem>)}</SelectContent>
              </Select>
            </F>
          </div>
        )}
      </div>
    </div>
  );
}

function ModeToggle({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button type="button" onClick={onClick} className={cn("rounded-md border px-3 py-1.5 text-sm transition-colors", active ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground hover:bg-muted")}>{label}</button>
  );
}

function StepParticipants({ form, set }: StepProps) {
  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Participants</h2>
        <p className="text-sm text-muted-foreground">One person may hold more than one role.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <F label="Client representative (primary contact)"><Input value={form.primary_client_contact} onChange={(e) => set("primary_client_contact", e.target.value)} /></F>
        <F label="Final client approver"><Input value={form.final_client_approver} onChange={(e) => set("final_client_approver", e.target.value)} /></F>
        <F label="Additional reviewers" hint="Comma-separated"><Input value={form.additional_reviewers} onChange={(e) => set("additional_reviewers", e.target.value)} /></F>
        <F label="Authorized to approve additional costs"><Input value={form.cost_authorizer} onChange={(e) => set("cost_authorizer", e.target.value)} /></F>
        <F label="LV Branding project lead"><Input value={form.lvProjectLead} onChange={(e) => set("lvProjectLead", e.target.value)} /></F>
        <F label="Additional LV Branding contact"><Input value={form.lvAdditionalContact} onChange={(e) => set("lvAdditionalContact", e.target.value)} /></F>
      </div>
    </div>
  );
}

function StepRevision({ form, set }: StepProps) {
  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">Revision terms</h2>
        <p className="text-sm text-muted-foreground">Project-specific allowances and fees. No amounts are hard-coded.</p>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <F label="Included rounds"><Input type="number" min="0" value={form.included_revision_rounds} onChange={(e) => set("included_revision_rounds", e.target.value)} /></F>
        <F label="Add'l revision min ($)"><Input type="number" value={form.additional_revision_minimum} onChange={(e) => set("additional_revision_minimum", e.target.value)} /></F>
        <F label="Rush fee (%)"><Input type="number" value={form.rush_fee_percentage} onChange={(e) => set("rush_fee_percentage", e.target.value)} /></F>
        <F label="Hourly production rate ($)"><Input type="number" value={form.hourly_production_rate} onChange={(e) => set("hourly_production_rate", e.target.value)} /></F>
        <F label="Strategic consultation rate ($)"><Input type="number" value={form.strategic_consultation_rate} onChange={(e) => set("strategic_consultation_rate", e.target.value)} /></F>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <FeeField label="Reopened phase fee" type={form.reopened_phase_fee_type} value={form.reopened_phase_fee_value} onType={(v) => set("reopened_phase_fee_type", v)} onValue={(v) => set("reopened_phase_fee_value", v)} />
        <FeeField label="Concept restart fee" type={form.concept_restart_fee_type} value={form.concept_restart_fee_value} onType={(v) => set("concept_restart_fee_type", v)} onValue={(v) => set("concept_restart_fee_value", v)} />
      </div>
      <F label="Definition of one revision round"><Textarea rows={2} value={form.revision_definition} onChange={(e) => set("revision_definition", e.target.value)} /></F>
      <F label="Custom revision notes"><Textarea rows={2} value={form.custom_revision_notes} onChange={(e) => set("custom_revision_notes", e.target.value)} /></F>
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
        <Input type="number" value={value} onChange={(e) => onValue(e.target.value)} />
      </div>
    </div>
  );
}

function StepToggles({ title, description, terms, values, onToggle }: { title: string; description: string; terms: { key: string; label: string }[]; values: Record<string, boolean>; onToggle: (k: string, v: boolean) => void }) {
  return (
    <div className="grid gap-4">
      <div>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <div className="divide-y divide-border rounded-lg border border-border">
        {terms.map((t) => (
          <label key={t.key} className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3">
            <span className="text-sm text-foreground">{t.label}</span>
            <Switch checked={values[t.key] ?? false} onCheckedChange={(v) => onToggle(t.key, v)} />
          </label>
        ))}
      </div>
    </div>
  );
}

function StepReview({ form, set, templateVersion }: StepProps & { templateVersion?: string }) {
  const enabledCount = (o: Record<string, boolean>) => Object.values(o).filter(Boolean).length;
  return (
    <div className="grid gap-5">
      <div>
        <h2 className="text-base font-semibold text-foreground">Review & send</h2>
        <p className="text-sm text-muted-foreground">Confirm the recipient and delivery options, then generate the secure link.</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <F label="Recipient name"><Input value={form.recipient_name} onChange={(e) => set("recipient_name", e.target.value)} /></F>
        <F label="Recipient email"><Input type="email" value={form.recipient_email} onChange={(e) => set("recipient_email", e.target.value)} /></F>
      </div>
      <F label="Personalized introduction (optional)"><Textarea rows={2} value={form.intro_message} onChange={(e) => set("intro_message", e.target.value)} /></F>
      <F label="Expiration date (optional)"><Input type="date" value={form.expires_at} onChange={(e) => set("expires_at", e.target.value)} /></F>

      <div className="divide-y divide-border rounded-lg border border-border">
        <ToggleRow label="Require email verification before opening" checked={form.require_email_verification} onChange={(v) => set("require_email_verification", v)} />
        <ToggleRow label="Require all acknowledgments before submission" checked={form.require_all_acknowledgments} onChange={(v) => set("require_all_acknowledgments", v)} />
        <ToggleRow label="Capture IP address at signing" checked={form.capture_ip} onChange={(v) => set("capture_ip", v)} />
      </div>

      <div className="rounded-lg bg-muted/40 p-4 text-sm">
        <p className="mb-2 font-medium text-foreground">Summary</p>
        <dl className="grid grid-cols-2 gap-y-1 text-muted-foreground">
          <dt>Project</dt><dd className="text-right text-foreground">{form.project_name || "—"}</dd>
          <dt>Included revision rounds</dt><dd className="text-right text-foreground">{form.included_revision_rounds}</dd>
          <dt>Collaboration terms enabled</dt><dd className="text-right text-foreground">{enabledCount(form.collaboration)} / {COLLABORATION_TERMS.length}</dd>
          <dt>IP terms enabled</dt><dd className="text-right text-foreground">{enabledCount(form.ip)} / {IP_TERMS.length}</dd>
          <dt>Template version</dt><dd className="text-right text-foreground">{templateVersion ?? "—"}</dd>
        </dl>
      </div>
    </div>
  );
}

function ToggleRow({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center justify-between gap-4 px-4 py-3">
      <span className="text-sm text-foreground">{label}</span>
      <Switch checked={checked} onCheckedChange={onChange} />
    </label>
  );
}
