-- 023_branch_assignments_and_usage.sql
-- Adds branch assignment to operational records and a lightweight usage ledger
-- so HQ can filter activity and monitor estimated costs by branch.

ALTER TABLE public.org_branches
  ADD COLUMN IF NOT EXISTS monthly_budget_cents INTEGER NOT NULL DEFAULT 0 CHECK (monthly_budget_cents >= 0);

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.org_branches(id) ON DELETE SET NULL;

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.org_branches(id) ON DELETE SET NULL;

ALTER TABLE public.email_campaigns
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.org_branches(id) ON DELETE SET NULL;

ALTER TABLE public.photo_sessions
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.org_branches(id) ON DELETE SET NULL;

ALTER TABLE public.skill_outputs
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.org_branches(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_contacts_branch_id ON public.contacts(branch_id);
CREATE INDEX IF NOT EXISTS idx_projects_branch_id ON public.projects(branch_id);
CREATE INDEX IF NOT EXISTS idx_email_campaigns_branch_id ON public.email_campaigns(branch_id);
CREATE INDEX IF NOT EXISTS idx_photo_sessions_branch_id ON public.photo_sessions(branch_id);
CREATE INDEX IF NOT EXISTS idx_skill_outputs_branch_id ON public.skill_outputs(branch_id);

CREATE TABLE IF NOT EXISTS public.branch_usage_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.org_branches(id) ON DELETE SET NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  source_type TEXT NOT NULL,
  source_id TEXT,
  units INTEGER NOT NULL DEFAULT 1 CHECK (units >= 0),
  unit_type TEXT NOT NULL DEFAULT 'event',
  estimated_cost_cents INTEGER NOT NULL DEFAULT 0 CHECK (estimated_cost_cents >= 0),
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.branch_usage_events ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_branch_usage_events_org_created
  ON public.branch_usage_events(org_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_branch_usage_events_branch_created
  ON public.branch_usage_events(branch_id, created_at DESC);

CREATE POLICY "org_members_can_view_branch_usage" ON public.branch_usage_events
  FOR SELECT USING (public.is_org_member(org_id));

CREATE POLICY "org_members_can_create_branch_usage" ON public.branch_usage_events
  FOR INSERT WITH CHECK (public.is_org_member(org_id));

CREATE POLICY "service_role_can_manage_branch_usage" ON public.branch_usage_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);
