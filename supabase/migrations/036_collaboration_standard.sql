-- LV Marketing Suite — Creative Collaboration Standard (CCS)
-- Migration 036: schema, RLS, indexes
--
-- A guided client onboarding + acknowledgment module. All tables are namespaced
-- with the `ccs_` prefix and scoped to an organization, following the existing
-- tenancy model (organizations / team_members / is_org_member / org_role).
--
-- Client-facing wizard I/O is mediated by the `ccs-client` edge function using the
-- service-role key. Tokens are never stored in plaintext; only a SHA-256 hash is
-- persisted (secure_token_hash). No anon policies are defined — clients never talk
-- to the database directly.

-- ── Enums ─────────────────────────────────────────────────────────────────────
CREATE TYPE public.ccs_request_status AS ENUM (
  'draft', 'ready_to_send', 'sent', 'opened', 'in_progress',
  'submitted', 'signed', 'accepted', 'expired', 'revoked', 'archived'
);
CREATE TYPE public.ccs_project_phase AS ENUM (
  'brief_approval', 'strategic_direction', 'concept_approval', 'refinement', 'final_production'
);
CREATE TYPE public.ccs_fee_type AS ENUM ('percentage', 'fixed');
CREATE TYPE public.ccs_prior_use_status AS ENUM ('no', 'yes', 'unsure', 'prefer_discuss');
CREATE TYPE public.ccs_correction_status AS ENUM ('pending', 'reviewed', 'applied', 'dismissed');
CREATE TYPE public.ccs_disclosure_type AS ENUM ('expected_future_reference', 'prior_use_reference', 'other');
CREATE TYPE public.ccs_signature_type AS ENUM ('typed', 'drawn', 'both');
CREATE TYPE public.ccs_actor_type AS ENUM ('admin', 'client', 'system');

-- ── Clients ───────────────────────────────────────────────────────────────────
CREATE TABLE public.ccs_clients (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  company_name          TEXT NOT NULL,
  primary_contact_name  TEXT,
  primary_contact_email TEXT,
  phone                 TEXT,
  billing_contact_name  TEXT,
  billing_contact_email TEXT,
  address               TEXT,
  notes                 TEXT,
  status                TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'archived')),
  created_by            UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ccs_clients ENABLE ROW LEVEL SECURITY;

-- ── Projects ──────────────────────────────────────────────────────────────────
CREATE TABLE public.ccs_projects (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                      UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id                   UUID NOT NULL REFERENCES public.ccs_clients(id) ON DELETE CASCADE,
  -- Optional link to the existing marketing `projects` table (kept independent for MVP).
  linked_project_id           UUID REFERENCES public.projects(id) ON DELETE SET NULL,
  project_number              TEXT,
  project_name                TEXT NOT NULL,
  project_type                TEXT,
  description                 TEXT,
  start_date                  DATE,
  estimated_completion_date   DATE,
  lv_project_lead_id          UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Participants (step 2). Core roles as text; extra reviewers as a JSON array.
  primary_client_contact      TEXT,
  final_client_approver       TEXT,
  additional_reviewers        JSONB NOT NULL DEFAULT '[]'::JSONB,
  cost_authorizer             TEXT,
  -- Revision + fee terms (step 3). No amounts hard-coded anywhere in code.
  included_revision_rounds    INTEGER NOT NULL DEFAULT 0,
  revision_definition         TEXT,
  additional_revision_minimum NUMERIC,
  hourly_production_rate      NUMERIC,
  strategic_consultation_rate NUMERIC,
  reopened_phase_fee_type     public.ccs_fee_type,
  reopened_phase_fee_value    NUMERIC,
  concept_restart_fee_type    public.ccs_fee_type,
  concept_restart_fee_value   NUMERIC,
  rush_fee_percentage         NUMERIC,
  custom_revision_notes       TEXT,
  current_phase               public.ccs_project_phase NOT NULL DEFAULT 'brief_approval',
  status                      TEXT NOT NULL DEFAULT 'active'
                               CHECK (status IN ('draft', 'active', 'on_hold', 'complete', 'archived')),
  created_by                  UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ccs_projects ENABLE ROW LEVEL SECURITY;

-- ── Acknowledgment Templates ──────────────────────────────────────────────────
-- All educational + legal wording lives here as structured, editable JSON.
-- Never hard-coded in components. Frozen into a snapshot at signing time.
CREATE TABLE public.ccs_templates (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id           UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,
  version          TEXT NOT NULL DEFAULT '1.0',
  active           BOOLEAN NOT NULL DEFAULT TRUE,
  content_json     JSONB NOT NULL DEFAULT '{}'::JSONB,
  legal_disclaimer TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ccs_templates ENABLE ROW LEVEL SECURITY;

-- ── Acknowledgment Requests ───────────────────────────────────────────────────
CREATE TABLE public.ccs_requests (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  client_id                 UUID NOT NULL REFERENCES public.ccs_clients(id) ON DELETE CASCADE,
  project_id                UUID NOT NULL REFERENCES public.ccs_projects(id) ON DELETE CASCADE,
  template_id               UUID REFERENCES public.ccs_templates(id) ON DELETE SET NULL,
  template_version          TEXT,
  project_terms_version     TEXT,
  recipient_name            TEXT,
  recipient_email           TEXT,
  -- SHA-256 hash of the secure token. Plaintext token is emailed, never stored.
  secure_token_hash         TEXT UNIQUE,
  status                    public.ccs_request_status NOT NULL DEFAULT 'draft',
  completion_percentage     INTEGER NOT NULL DEFAULT 0 CHECK (completion_percentage BETWEEN 0 AND 100),
  intro_message             TEXT,
  -- Configurable policy toggles
  require_email_verification BOOLEAN NOT NULL DEFAULT FALSE,
  require_all_acknowledgments BOOLEAN NOT NULL DEFAULT TRUE,
  capture_ip                BOOLEAN NOT NULL DEFAULT FALSE,
  -- One-time email verification (hashed)
  otp_code_hash             TEXT,
  otp_verified_at           TIMESTAMPTZ,
  -- Admin workflow flags
  admin_review_required     BOOLEAN NOT NULL DEFAULT FALSE,
  follow_up_flag            BOOLEAN NOT NULL DEFAULT FALSE,
  -- Lifecycle timestamps
  expires_at                TIMESTAMPTZ,
  sent_at                   TIMESTAMPTZ,
  opened_at                 TIMESTAMPTZ,
  last_activity_at          TIMESTAMPTZ,
  submitted_at              TIMESTAMPTZ,
  signed_at                 TIMESTAMPTZ,
  accepted_at               TIMESTAMPTZ,
  revoked_at                TIMESTAMPTZ,
  archived_at               TIMESTAMPTZ,
  created_by                UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ccs_requests ENABLE ROW LEVEL SECURITY;

-- ── Autosaved Wizard Responses ────────────────────────────────────────────────
CREATE TABLE public.ccs_responses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    UUID NOT NULL REFERENCES public.ccs_requests(id) ON DELETE CASCADE,
  step_key      TEXT NOT NULL,
  question_key  TEXT NOT NULL,
  response_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (request_id, step_key, question_key)
);
ALTER TABLE public.ccs_responses ENABLE ROW LEVEL SECURITY;

-- ── Intended External / AI Input (future use — step 4) ────────────────────────
CREATE TABLE public.ccs_intended_external_input (
  id                           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id                   UUID NOT NULL UNIQUE REFERENCES public.ccs_requests(id) ON DELETE CASCADE,
  ai_or_external_use_expected  JSONB NOT NULL DEFAULT '[]'::JSONB,
  expected_usage_types         JSONB NOT NULL DEFAULT '[]'::JSONB,
  expected_platforms           TEXT,
  expected_purpose             JSONB NOT NULL DEFAULT '[]'::JSONB,
  expected_lv_response         JSONB NOT NULL DEFAULT '[]'::JSONB,
  implementation_may_be_requested BOOLEAN NOT NULL DEFAULT FALSE,
  client_notes                 TEXT,
  created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ccs_intended_external_input ENABLE ROW LEVEL SECURITY;

-- ── Optional Prior-Use Disclosure (past use — labeled separately) ─────────────
CREATE TABLE public.ccs_prior_use_disclosures (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id             UUID NOT NULL UNIQUE REFERENCES public.ccs_requests(id) ON DELETE CASCADE,
  prior_use_status       public.ccs_prior_use_status NOT NULL DEFAULT 'no',
  platforms_or_advisors  TEXT,
  materials_shared       JSONB NOT NULL DEFAULT '[]'::JSONB,
  output_generated       TEXT,
  lv_review_requested    BOOLEAN NOT NULL DEFAULT FALSE,
  implementation_requested BOOLEAN NOT NULL DEFAULT FALSE,
  client_notes           TEXT,
  admin_review_required  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ccs_prior_use_disclosures ENABLE ROW LEVEL SECURITY;

-- ── Electronic Signature ──────────────────────────────────────────────────────
CREATE TABLE public.ccs_signatures (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id     UUID NOT NULL REFERENCES public.ccs_requests(id) ON DELETE CASCADE,
  signer_name    TEXT NOT NULL,
  signer_company TEXT,
  signer_title   TEXT,
  signer_email   TEXT,
  signature_type public.ccs_signature_type NOT NULL DEFAULT 'typed',
  signature_data TEXT,          -- typed legal name and/or base64 PNG of drawn signature
  consent_text   TEXT NOT NULL, -- exact consent wording accepted, frozen at signing
  ip_address     INET,          -- populated only when request.capture_ip = true
  user_agent     TEXT,
  signed_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ccs_signatures ENABLE ROW LEVEL SECURITY;

-- ── Immutable Acknowledgment Snapshot ─────────────────────────────────────────
-- A frozen record of exact wording + responses at acceptance. Never changes when
-- templates, fees, or project settings are later edited.
CREATE TABLE public.ccs_snapshots (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id            UUID NOT NULL UNIQUE REFERENCES public.ccs_requests(id) ON DELETE CASCADE,
  full_snapshot_json    JSONB NOT NULL DEFAULT '{}'::JSONB,
  rendered_html         TEXT,
  confirmation_number   TEXT NOT NULL UNIQUE,
  template_version      TEXT,
  project_terms_version TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ccs_snapshots ENABLE ROW LEVEL SECURITY;

-- ── Uploaded References ───────────────────────────────────────────────────────
CREATE TABLE public.ccs_uploaded_references (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id        UUID NOT NULL REFERENCES public.ccs_requests(id) ON DELETE CASCADE,
  disclosure_type   public.ccs_disclosure_type NOT NULL DEFAULT 'other',
  file_path         TEXT NOT NULL,
  original_filename TEXT,
  mime_type         TEXT,
  file_size         BIGINT NOT NULL DEFAULT 0,
  uploaded_by       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ccs_uploaded_references ENABLE ROW LEVEL SECURITY;

-- ── Participant Correction Requests (proposed, not auto-applied) ──────────────
CREATE TABLE public.ccs_participant_correction_requests (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    UUID NOT NULL REFERENCES public.ccs_requests(id) ON DELETE CASCADE,
  field_name    TEXT NOT NULL,
  current_value TEXT,
  proposed_value TEXT,
  client_note   TEXT,
  review_status public.ccs_correction_status NOT NULL DEFAULT 'pending',
  reviewed_by   UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ccs_participant_correction_requests ENABLE ROW LEVEL SECURITY;

-- ── Private Admin Notes (never client-visible) ────────────────────────────────
CREATE TABLE public.ccs_admin_notes (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id       UUID NOT NULL REFERENCES public.ccs_requests(id) ON DELETE CASCADE,
  administrator_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  note             TEXT NOT NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ccs_admin_notes ENABLE ROW LEVEL SECURITY;

-- ── Audit Log (append-only) ───────────────────────────────────────────────────
CREATE TABLE public.ccs_audit_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id    UUID NOT NULL REFERENCES public.ccs_requests(id) ON DELETE CASCADE,
  actor_type    public.ccs_actor_type NOT NULL,
  actor_id      TEXT,
  action        TEXT NOT NULL,
  metadata_json JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.ccs_audit_logs ENABLE ROW LEVEL SECURITY;

-- ── updated_at triggers ───────────────────────────────────────────────────────
CREATE TRIGGER ccs_clients_updated_at BEFORE UPDATE ON public.ccs_clients
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER ccs_projects_updated_at BEFORE UPDATE ON public.ccs_projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER ccs_templates_updated_at BEFORE UPDATE ON public.ccs_templates
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER ccs_requests_updated_at BEFORE UPDATE ON public.ccs_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER ccs_responses_updated_at BEFORE UPDATE ON public.ccs_responses
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER ccs_intended_external_input_updated_at BEFORE UPDATE ON public.ccs_intended_external_input
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER ccs_prior_use_disclosures_updated_at BEFORE UPDATE ON public.ccs_prior_use_disclosures
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER ccs_admin_notes_updated_at BEFORE UPDATE ON public.ccs_admin_notes
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX ccs_clients_org_idx        ON public.ccs_clients(org_id, created_at DESC);
CREATE INDEX ccs_projects_org_idx       ON public.ccs_projects(org_id, created_at DESC);
CREATE INDEX ccs_projects_client_idx    ON public.ccs_projects(client_id);
CREATE INDEX ccs_templates_org_idx      ON public.ccs_templates(org_id);
CREATE INDEX ccs_requests_org_idx       ON public.ccs_requests(org_id, created_at DESC);
CREATE INDEX ccs_requests_project_idx   ON public.ccs_requests(project_id);
CREATE INDEX ccs_requests_client_idx    ON public.ccs_requests(client_id);
CREATE INDEX ccs_requests_token_idx     ON public.ccs_requests(secure_token_hash);
CREATE INDEX ccs_requests_status_idx    ON public.ccs_requests(org_id, status);
CREATE INDEX ccs_responses_request_idx  ON public.ccs_responses(request_id);
CREATE INDEX ccs_signatures_request_idx ON public.ccs_signatures(request_id);
CREATE INDEX ccs_uploaded_refs_request_idx ON public.ccs_uploaded_references(request_id);
CREATE INDEX ccs_corrections_request_idx ON public.ccs_participant_correction_requests(request_id);
CREATE INDEX ccs_admin_notes_request_idx ON public.ccs_admin_notes(request_id);
CREATE INDEX ccs_audit_logs_request_idx ON public.ccs_audit_logs(request_id, created_at DESC);

-- ── RLS Policies ──────────────────────────────────────────────────────────────
-- Model: LV staff (org members) manage everything for their org. Clients never
-- access the DB directly — the `ccs-client` edge function uses the service role,
-- which is granted a blanket bypass on every ccs_ table. Admin notes are the one
-- table with NO client path at all.

-- Org-scoped top-level tables: members manage; owner/admin delete.
CREATE POLICY "ccs_clients_member_all" ON public.ccs_clients
  USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "ccs_clients_service" ON public.ccs_clients
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "ccs_projects_member_all" ON public.ccs_projects
  USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "ccs_projects_service" ON public.ccs_projects
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "ccs_templates_member_all" ON public.ccs_templates
  USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "ccs_templates_service" ON public.ccs_templates
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "ccs_requests_member_all" ON public.ccs_requests
  USING (public.is_org_member(org_id)) WITH CHECK (public.is_org_member(org_id));
CREATE POLICY "ccs_requests_service" ON public.ccs_requests
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Child tables: org members read/manage via the parent request's org; service
-- role handles all client writes.
CREATE POLICY "ccs_responses_member" ON public.ccs_responses
  USING (EXISTS (SELECT 1 FROM public.ccs_requests r WHERE r.id = request_id AND public.is_org_member(r.org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ccs_requests r WHERE r.id = request_id AND public.is_org_member(r.org_id)));
CREATE POLICY "ccs_responses_service" ON public.ccs_responses
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "ccs_intended_member" ON public.ccs_intended_external_input
  USING (EXISTS (SELECT 1 FROM public.ccs_requests r WHERE r.id = request_id AND public.is_org_member(r.org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ccs_requests r WHERE r.id = request_id AND public.is_org_member(r.org_id)));
CREATE POLICY "ccs_intended_service" ON public.ccs_intended_external_input
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "ccs_prior_use_member" ON public.ccs_prior_use_disclosures
  USING (EXISTS (SELECT 1 FROM public.ccs_requests r WHERE r.id = request_id AND public.is_org_member(r.org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ccs_requests r WHERE r.id = request_id AND public.is_org_member(r.org_id)));
CREATE POLICY "ccs_prior_use_service" ON public.ccs_prior_use_disclosures
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "ccs_signatures_member" ON public.ccs_signatures
  USING (EXISTS (SELECT 1 FROM public.ccs_requests r WHERE r.id = request_id AND public.is_org_member(r.org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ccs_requests r WHERE r.id = request_id AND public.is_org_member(r.org_id)));
CREATE POLICY "ccs_signatures_service" ON public.ccs_signatures
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "ccs_snapshots_member" ON public.ccs_snapshots
  USING (EXISTS (SELECT 1 FROM public.ccs_requests r WHERE r.id = request_id AND public.is_org_member(r.org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ccs_requests r WHERE r.id = request_id AND public.is_org_member(r.org_id)));
CREATE POLICY "ccs_snapshots_service" ON public.ccs_snapshots
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "ccs_uploaded_refs_member" ON public.ccs_uploaded_references
  USING (EXISTS (SELECT 1 FROM public.ccs_requests r WHERE r.id = request_id AND public.is_org_member(r.org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ccs_requests r WHERE r.id = request_id AND public.is_org_member(r.org_id)));
CREATE POLICY "ccs_uploaded_refs_service" ON public.ccs_uploaded_references
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "ccs_corrections_member" ON public.ccs_participant_correction_requests
  USING (EXISTS (SELECT 1 FROM public.ccs_requests r WHERE r.id = request_id AND public.is_org_member(r.org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ccs_requests r WHERE r.id = request_id AND public.is_org_member(r.org_id)));
CREATE POLICY "ccs_corrections_service" ON public.ccs_participant_correction_requests
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "ccs_audit_member_read" ON public.ccs_audit_logs
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.ccs_requests r WHERE r.id = request_id AND public.is_org_member(r.org_id)));
CREATE POLICY "ccs_audit_service" ON public.ccs_audit_logs
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Admin notes: org members only, both directions. No service-role/client path.
CREATE POLICY "ccs_admin_notes_member" ON public.ccs_admin_notes
  USING (EXISTS (SELECT 1 FROM public.ccs_requests r WHERE r.id = request_id AND public.is_org_member(r.org_id)))
  WITH CHECK (EXISTS (SELECT 1 FROM public.ccs_requests r WHERE r.id = request_id AND public.is_org_member(r.org_id)));

-- ── Storage bucket for reference uploads (private) ────────────────────────────
INSERT INTO storage.buckets (id, name, public)
  VALUES ('ccs-references', 'ccs-references', false)
  ON CONFLICT DO NOTHING;
