-- 022_org_branches.sql
-- Adds HQ-monitored branch tenants for LATAM expansion.

CREATE TYPE public.branch_status AS ENUM ('planning', 'active', 'paused', 'archived');

CREATE TABLE public.org_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT,
  country TEXT NOT NULL DEFAULT 'Mexico',
  city TEXT,
  region TEXT NOT NULL DEFAULT 'Latam',
  timezone TEXT NOT NULL DEFAULT 'America/Mexico_City',
  primary_language TEXT NOT NULL DEFAULT 'es' CHECK (primary_language IN ('en', 'es')),
  status public.branch_status NOT NULL DEFAULT 'planning',
  hq_monitored BOOLEAN NOT NULL DEFAULT true,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, code)
);

ALTER TABLE public.org_branches ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_org_branches_org_id ON public.org_branches(org_id);
CREATE INDEX idx_org_branches_status ON public.org_branches(status);
CREATE INDEX idx_org_branches_country ON public.org_branches(country);

CREATE TRIGGER update_org_branches_updated_at
  BEFORE UPDATE ON public.org_branches
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "org_members_can_view_branches" ON public.org_branches
  FOR SELECT USING (public.is_org_member(org_id));

CREATE POLICY "hq_can_create_branches" ON public.org_branches
  FOR INSERT WITH CHECK (
    public.org_role(org_id) IN ('owner', 'admin')
    AND hq_monitored = true
  );

CREATE POLICY "hq_can_update_branches" ON public.org_branches
  FOR UPDATE USING (public.org_role(org_id) IN ('owner', 'admin'))
  WITH CHECK (
    public.org_role(org_id) IN ('owner', 'admin')
    AND hq_monitored = true
  );

CREATE POLICY "hq_can_delete_branches" ON public.org_branches
  FOR DELETE USING (public.org_role(org_id) IN ('owner', 'admin'));
