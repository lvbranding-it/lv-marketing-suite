import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useOrg } from "@/hooks/useOrg";
import { useAuth } from "@/hooks/useAuth";

// ── Types ──────────────────────────────────────────────────────────────────────
// The ccs_ tables are not in the generated Database types, so we cast the client
// to `any` for these queries and describe the shapes locally.

export type CcsRequestStatus =
  | "draft" | "ready_to_send" | "sent" | "opened" | "in_progress"
  | "submitted" | "signed" | "accepted" | "expired" | "revoked" | "archived";

export type CcsProjectPhase =
  | "brief_approval" | "strategic_direction" | "concept_approval" | "refinement" | "final_production";

export type CcsFeeType = "percentage" | "fixed";

export interface CcsRequestConfig {
  participants?: { lvProjectLead?: string; lvAdditionalContact?: string };
  collaboration?: Record<string, boolean>;
  ip?: Record<string, boolean>;
}

export const COLLABORATION_TERMS: { key: string; label: string }[] = [
  { key: "consolidatedFeedback", label: "Consolidated feedback requirement" },
  { key: "oneApprover", label: "One final approver requirement" },
  { key: "phaseGates", label: "Project phase approval gates" },
  { key: "aiDisclosure", label: "AI and external input disclosure" },
  { key: "confidentiality", label: "Confidentiality acknowledgment" },
  { key: "thirdPartyPlatform", label: "Third-party platform responsibility acknowledgment" },
  { key: "changeOfDirection", label: "Change-of-direction acknowledgment" },
  { key: "additionalDeliverable", label: "Additional deliverable acknowledgment" },
  { key: "priorUseSection", label: "Prior-use disclosure section" },
  { key: "referenceUpload", label: "Reference upload capability" },
];

export const IP_TERMS: { key: string; label: string }[] = [
  { key: "finalRightsTransfer", label: "Final deliverable rights transfer after full payment" },
  { key: "preliminaryConceptsRetained", label: "Preliminary concepts remain LV Branding property" },
  { key: "rejectedConceptsRetained", label: "Rejected concepts remain LV Branding property" },
  { key: "sourceFilesExcluded", label: "Source files excluded unless stated in writing" },
  { key: "workingFilesExcluded", label: "Working files excluded" },
  { key: "templatesRetained", label: "Templates retained" },
  { key: "systemsRetained", label: "Systems and methods retained" },
  { key: "processesRetained", label: "Internal processes retained" },
  { key: "strategyRetained", label: "Strategy frameworks retained" },
  { key: "unusedMediaExcluded", label: "Unused photography or footage excluded" },
  { key: "codeOwnership", label: "Code ownership terms enabled" },
  { key: "thirdPartyAssetsExcluded", label: "Third-party licensed assets excluded" },
  { key: "aiUploadRestrictions", label: "AI upload restrictions enabled" },
];

export function defaultCollaborationConfig(): Record<string, boolean> {
  return Object.fromEntries(COLLABORATION_TERMS.map((t) => [t.key, true]));
}
export function defaultIpConfig(): Record<string, boolean> {
  return Object.fromEntries(IP_TERMS.map((t) => [t.key, true]));
}

export interface CcsClient {
  id: string;
  org_id: string;
  company_name: string;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  phone: string | null;
  billing_contact_name: string | null;
  billing_contact_email: string | null;
  address: string | null;
  notes: string | null;
  status: "active" | "archived";
  created_at: string;
  updated_at: string;
}

export interface CcsProject {
  id: string;
  org_id: string;
  client_id: string;
  project_number: string | null;
  project_name: string;
  project_type: string | null;
  description: string | null;
  start_date: string | null;
  estimated_completion_date: string | null;
  lv_project_lead_id: string | null;
  primary_client_contact: string | null;
  final_client_approver: string | null;
  additional_reviewers: string[] | null;
  cost_authorizer: string | null;
  included_revision_rounds: number;
  revision_definition: string | null;
  additional_revision_minimum: number | null;
  hourly_production_rate: number | null;
  strategic_consultation_rate: number | null;
  reopened_phase_fee_type: CcsFeeType | null;
  reopened_phase_fee_value: number | null;
  concept_restart_fee_type: CcsFeeType | null;
  concept_restart_fee_value: number | null;
  rush_fee_percentage: number | null;
  custom_revision_notes: string | null;
  current_phase: CcsProjectPhase;
  status: "draft" | "active" | "on_hold" | "complete" | "archived";
  created_at: string;
  updated_at: string;
  client?: Pick<CcsClient, "id" | "company_name"> | null;
}

export interface CcsRequest {
  id: string;
  org_id: string;
  client_id: string;
  project_id: string;
  recipient_name: string | null;
  recipient_email: string | null;
  status: CcsRequestStatus;
  completion_percentage: number;
  admin_review_required: boolean;
  follow_up_flag: boolean;
  expires_at: string | null;
  sent_at: string | null;
  opened_at: string | null;
  submitted_at: string | null;
  signed_at: string | null;
  accepted_at: string | null;
  last_activity_at: string | null;
  created_at: string;
  intro_message?: string | null;
  require_email_verification?: boolean;
  require_all_acknowledgments?: boolean;
  capture_ip?: boolean;
  template_id?: string | null;
  template_version?: string | null;
  project_terms_version?: string | null;
  config_json?: CcsRequestConfig;
  client?: Pick<CcsClient, "id" | "company_name"> | null;
  project?: Pick<CcsProject, "id" | "project_name" | "project_number"> | null;
  intended?: { id: string; ai_or_external_use_expected: string[] } | { id: string; ai_or_external_use_expected: string[] }[] | null;
  prior?: { prior_use_status: string } | { prior_use_status: string }[] | null;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const db = supabase as any;

function firstOf<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null;
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

// ── Clients ────────────────────────────────────────────────────────────────────
export function useCcsClients() {
  const { org } = useOrg();
  return useQuery<CcsClient[]>({
    queryKey: ["ccs_clients", org?.id],
    queryFn: async () => {
      if (!org) return [];
      const { data, error } = await db.from("ccs_clients").select("*").eq("org_id", org.id).order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as CcsClient[];
    },
    enabled: !!org,
  });
}

export function useCcsClient(id: string | undefined) {
  const { org } = useOrg();
  return useQuery<CcsClient | null>({
    queryKey: ["ccs_client", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await db.from("ccs_clients").select("*").eq("id", id).single();
      if (error) throw error;
      return data as CcsClient;
    },
    enabled: !!id && !!org,
  });
}

export type CcsClientInput = Partial<Omit<CcsClient, "id" | "org_id" | "created_at" | "updated_at">> & { company_name: string };

export function useSaveCcsClient() {
  const { org } = useOrg();
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...fields }: CcsClientInput & { id?: string }) => {
      if (!org) throw new Error("No organization");
      if (id) {
        const { data, error } = await db.from("ccs_clients").update(fields).eq("id", id).select().single();
        if (error) throw error;
        return data as CcsClient;
      }
      const { data, error } = await db.from("ccs_clients").insert({ ...fields, org_id: org.id, created_by: user?.id ?? null }).select().single();
      if (error) throw error;
      return data as CcsClient;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ccs_clients"] });
      qc.invalidateQueries({ queryKey: ["ccs_client"] });
    },
  });
}

// ── Projects ───────────────────────────────────────────────────────────────────
export function useCcsProjects(clientId?: string) {
  const { org } = useOrg();
  return useQuery<CcsProject[]>({
    queryKey: ["ccs_projects", org?.id, clientId ?? "all"],
    queryFn: async () => {
      if (!org) return [];
      let q = db.from("ccs_projects").select("*, client:ccs_clients(id,company_name)").eq("org_id", org.id).order("created_at", { ascending: false });
      if (clientId) q = q.eq("client_id", clientId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CcsProject[];
    },
    enabled: !!org,
  });
}

export function useCcsProject(id: string | undefined) {
  const { org } = useOrg();
  return useQuery<CcsProject | null>({
    queryKey: ["ccs_project", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await db.from("ccs_projects").select("*, client:ccs_clients(id,company_name)").eq("id", id).single();
      if (error) throw error;
      return data as CcsProject;
    },
    enabled: !!id && !!org,
  });
}

export type CcsProjectInput = Partial<Omit<CcsProject, "id" | "org_id" | "created_at" | "updated_at" | "client">> & {
  project_name: string;
  client_id: string;
};

export function useSaveCcsProject() {
  const { org } = useOrg();
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...fields }: CcsProjectInput & { id?: string }) => {
      if (!org) throw new Error("No organization");
      if (id) {
        const { data, error } = await db.from("ccs_projects").update(fields).eq("id", id).select().single();
        if (error) throw error;
        return data as CcsProject;
      }
      const { data, error } = await db.from("ccs_projects").insert({ ...fields, org_id: org.id, created_by: user?.id ?? null }).select().single();
      if (error) throw error;
      return data as CcsProject;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ccs_projects"] });
      qc.invalidateQueries({ queryKey: ["ccs_project"] });
    },
  });
}

// ── Requests ───────────────────────────────────────────────────────────────────
const REQUEST_SELECT =
  "*, client:ccs_clients(id,company_name), project:ccs_projects(id,project_name,project_number), intended:ccs_intended_external_input(id,ai_or_external_use_expected), prior:ccs_prior_use_disclosures(prior_use_status)";

export function useCcsRequests(opts?: { clientId?: string; projectId?: string }) {
  const { org } = useOrg();
  return useQuery<CcsRequest[]>({
    queryKey: ["ccs_requests", org?.id, opts?.clientId ?? null, opts?.projectId ?? null],
    queryFn: async () => {
      if (!org) return [];
      let q = db.from("ccs_requests").select(REQUEST_SELECT).eq("org_id", org.id).order("created_at", { ascending: false });
      if (opts?.clientId) q = q.eq("client_id", opts.clientId);
      if (opts?.projectId) q = q.eq("project_id", opts.projectId);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as CcsRequest[];
    },
    enabled: !!org,
  });
}

// ── Dashboard metrics (derived) ─────────────────────────────────────────────────
export interface CcsMetrics {
  totalActive: number;
  awaitingCompletion: number;
  awaitingAcceptance: number;
  completedThisMonth: number;
  expired: number;
  withAiInput: number;
  withPriorUse: number;
  needingReview: number;
}

export function computeCcsMetrics(requests: CcsRequest[]): CcsMetrics {
  const now = new Date();
  const isThisMonth = (iso: string | null) => {
    if (!iso) return false;
    const d = new Date(iso);
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  };
  const isExpired = (r: CcsRequest) => {
    if (r.status === "expired") return true;
    if (["accepted", "archived", "revoked"].includes(r.status)) return false;
    return !!r.expires_at && new Date(r.expires_at) < now;
  };
  let totalActive = 0, awaitingCompletion = 0, awaitingAcceptance = 0, completedThisMonth = 0,
    expired = 0, withAiInput = 0, withPriorUse = 0, needingReview = 0;

  for (const r of requests) {
    if (!["archived", "revoked"].includes(r.status)) totalActive++;
    if (["sent", "opened", "in_progress"].includes(r.status)) awaitingCompletion++;
    if (["submitted", "signed"].includes(r.status)) awaitingAcceptance++;
    if (r.status === "accepted" && isThisMonth(r.accepted_at)) completedThisMonth++;
    if (isExpired(r)) expired++;
    const intended = firstOf(r.intended);
    const uses = intended?.ai_or_external_use_expected ?? [];
    if (uses.length > 0 && !(uses.length === 1 && uses[0] === "none")) withAiInput++;
    const prior = firstOf(r.prior);
    if (prior && prior.prior_use_status !== "no") withPriorUse++;
    if (r.admin_review_required) needingReview++;
  }
  return { totalActive, awaitingCompletion, awaitingAcceptance, completedThisMonth, expired, withAiInput, withPriorUse, needingReview };
}

export function requestHasAiInput(r: CcsRequest): boolean {
  const intended = firstOf(r.intended);
  const uses = intended?.ai_or_external_use_expected ?? [];
  return uses.length > 0 && !(uses.length === 1 && uses[0] === "none");
}

export function requestHasPriorUse(r: CcsRequest): boolean {
  const prior = firstOf(r.prior);
  return !!prior && prior.prior_use_status !== "no";
}

// ── Templates ────────────────────────────────────────────────────────────────────
export interface CcsTemplate {
  id: string;
  name: string;
  version: string;
  active: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  content_json: any;
  legal_disclaimer: string | null;
}

export function useCcsActiveTemplate() {
  const { org } = useOrg();
  return useQuery<CcsTemplate | null>({
    queryKey: ["ccs_active_template", org?.id],
    queryFn: async () => {
      if (!org) return null;
      const { data, error } = await db
        .from("ccs_templates")
        .select("*")
        .eq("org_id", org.id)
        .eq("active", true)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return (data ?? null) as CcsTemplate | null;
    },
    enabled: !!org,
  });
}

// ── Single request ───────────────────────────────────────────────────────────────
export function useCcsRequest(id: string | undefined) {
  const { org } = useOrg();
  return useQuery<CcsRequest | null>({
    queryKey: ["ccs_request", id],
    queryFn: async () => {
      if (!id) return null;
      const { data, error } = await db.from("ccs_requests").select(REQUEST_SELECT).eq("id", id).single();
      if (error) throw error;
      return data as CcsRequest;
    },
    enabled: !!id && !!org,
  });
}

// ── Secure token (32 random bytes; only the SHA-256 hash is stored) ──────────────
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function generateSecureToken(): Promise<{ token: string; hash: string }> {
  const raw = new Uint8Array(32);
  crypto.getRandomValues(raw);
  const token = toHex(raw);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return { token, hash: toHex(new Uint8Array(digest)) };
}

// ── Save / create request ────────────────────────────────────────────────────────
export interface CcsRequestInput {
  id?: string;
  client_id?: string;
  project_id?: string;
  template_id?: string | null;
  template_version?: string | null;
  project_terms_version?: string | null;
  recipient_name?: string | null;
  recipient_email?: string | null;
  status?: CcsRequestStatus;
  intro_message?: string | null;
  require_email_verification?: boolean;
  require_all_acknowledgments?: boolean;
  capture_ip?: boolean;
  expires_at?: string | null;
  config_json?: CcsRequestConfig;
  secure_token_hash?: string | null;
  sent_at?: string | null;
  last_activity_at?: string | null;
}

// ── Admin: full request detail (review view) ─────────────────────────────────────
export interface CcsRequestDetail {
  request: CcsRequest;
  client: CcsClient | null;
  project: CcsProject | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  template: any;
  responses: Record<string, Record<string, unknown>>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  intended: any; priorUse: any; signature: any; snapshot: any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  corrections: any[]; notes: any[]; audit: any[];
}

export function useCcsRequestDetail(id: string | undefined) {
  const { org } = useOrg();
  return useQuery<CcsRequestDetail | null>({
    queryKey: ["ccs_request_detail", id],
    queryFn: async () => {
      if (!id) return null;
      const { data: request, error } = await db.from("ccs_requests")
        .select("*, client:ccs_clients(*), project:ccs_projects(*)").eq("id", id).single();
      if (error) throw error;
      const [template, responses, intended, prior, signature, snapshot, corrections, notes, audit] = await Promise.all([
        request.template_id ? db.from("ccs_templates").select("content_json, legal_disclaimer, version, name").eq("id", request.template_id).maybeSingle() : Promise.resolve({ data: null }),
        db.from("ccs_responses").select("step_key, question_key, response_json").eq("request_id", id),
        db.from("ccs_intended_external_input").select("*").eq("request_id", id).maybeSingle(),
        db.from("ccs_prior_use_disclosures").select("*").eq("request_id", id).maybeSingle(),
        db.from("ccs_signatures").select("*").eq("request_id", id).maybeSingle(),
        db.from("ccs_snapshots").select("*").eq("request_id", id).maybeSingle(),
        db.from("ccs_participant_correction_requests").select("*").eq("request_id", id).order("created_at", { ascending: false }),
        db.from("ccs_admin_notes").select("*").eq("request_id", id).order("created_at", { ascending: false }),
        db.from("ccs_audit_logs").select("*").eq("request_id", id).order("created_at", { ascending: true }),
      ]);
      const respMap: Record<string, Record<string, unknown>> = {};
      for (const r of responses.data ?? []) (respMap[r.step_key] ??= {})[r.question_key] = r.response_json;
      return {
        request, client: request.client, project: request.project, template: template.data,
        responses: respMap, intended: intended.data, priorUse: prior.data, signature: signature.data, snapshot: snapshot.data,
        corrections: corrections.data ?? [], notes: notes.data ?? [], audit: audit.data ?? [],
      } as CcsRequestDetail;
    },
    enabled: !!id && !!org,
  });
}

export function useCcsRequestActions() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const invalidate = () => { qc.invalidateQueries({ queryKey: ["ccs_request_detail"] }); qc.invalidateQueries({ queryKey: ["ccs_requests"] }); };
  return {
    accept: useMutation({
      mutationFn: async (id: string) => { const { error } = await db.from("ccs_requests").update({ status: "accepted", accepted_at: new Date().toISOString() }).eq("id", id); if (error) throw error; },
      onSuccess: invalidate,
    }),
    setFlags: useMutation({
      mutationFn: async ({ id, fields }: { id: string; fields: Record<string, unknown> }) => { const { error } = await db.from("ccs_requests").update(fields).eq("id", id); if (error) throw error; },
      onSuccess: invalidate,
    }),
    addNote: useMutation({
      mutationFn: async ({ id, note }: { id: string; note: string }) => { const { error } = await db.from("ccs_admin_notes").insert({ request_id: id, administrator_id: user?.id ?? null, note }); if (error) throw error; },
      onSuccess: invalidate,
    }),
    reviewCorrection: useMutation({
      mutationFn: async ({ correctionId, status }: { correctionId: string; status: string }) => { const { error } = await db.from("ccs_participant_correction_requests").update({ review_status: status, reviewed_by: user?.id ?? null, reviewed_at: new Date().toISOString() }).eq("id", correctionId); if (error) throw error; },
      onSuccess: invalidate,
    }),
  };
}

export function useSaveCcsRequest() {
  const { org } = useOrg();
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...fields }: CcsRequestInput) => {
      if (!org) throw new Error("No organization");
      if (id) {
        const { data, error } = await db.from("ccs_requests").update(fields).eq("id", id).select().single();
        if (error) throw error;
        return data as CcsRequest;
      }
      const { data, error } = await db.from("ccs_requests").insert({ ...fields, org_id: org.id, created_by: user?.id ?? null }).select().single();
      if (error) throw error;
      return data as CcsRequest;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ccs_requests"] });
      qc.invalidateQueries({ queryKey: ["ccs_request"] });
    },
  });
}
