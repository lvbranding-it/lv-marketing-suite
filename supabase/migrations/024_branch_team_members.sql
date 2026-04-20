-- 024_branch_team_members.sql
-- Branch-level team assignments under HQ visibility.

CREATE TYPE public.branch_member_role AS ENUM ('regional_ceo', 'manager', 'crew');

ALTER TABLE public.org_branches
  ADD CONSTRAINT org_branches_id_org_id_unique UNIQUE (id, org_id);

CREATE TABLE public.branch_team_members (
  branch_id UUID NOT NULL REFERENCES public.org_branches(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.branch_member_role NOT NULL DEFAULT 'crew',
  assigned_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  assigned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (branch_id, user_id),
  FOREIGN KEY (branch_id, org_id) REFERENCES public.org_branches(id, org_id) ON DELETE CASCADE
);

ALTER TABLE public.branch_team_members ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_branch_team_members_org_id ON public.branch_team_members(org_id);
CREATE INDEX idx_branch_team_members_user_id ON public.branch_team_members(user_id);

CREATE UNIQUE INDEX idx_one_regional_ceo_per_branch
  ON public.branch_team_members(branch_id)
  WHERE role = 'regional_ceo';

CREATE OR REPLACE FUNCTION public.branch_role(_branch_id UUID)
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role::TEXT FROM public.branch_team_members
  WHERE branch_id = _branch_id AND user_id = auth.uid()
  LIMIT 1
$$;

CREATE POLICY "org_members_can_view_branch_team" ON public.branch_team_members
  FOR SELECT USING (public.is_org_member(org_id));

CREATE POLICY "hq_or_regional_ceo_can_add_branch_team" ON public.branch_team_members
  FOR INSERT WITH CHECK (
    public.org_role(org_id) IN ('owner', 'admin')
    OR public.branch_role(branch_id) = 'regional_ceo'
  );

CREATE POLICY "hq_or_regional_ceo_can_update_branch_team" ON public.branch_team_members
  FOR UPDATE USING (
    public.org_role(org_id) IN ('owner', 'admin')
    OR public.branch_role(branch_id) = 'regional_ceo'
  )
  WITH CHECK (
    public.org_role(org_id) IN ('owner', 'admin')
    OR public.branch_role(branch_id) = 'regional_ceo'
  );

CREATE POLICY "hq_or_regional_ceo_can_remove_branch_team" ON public.branch_team_members
  FOR DELETE USING (
    public.org_role(org_id) IN ('owner', 'admin')
    OR public.branch_role(branch_id) = 'regional_ceo'
  );
