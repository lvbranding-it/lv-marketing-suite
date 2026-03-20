-- LV Marketing Suite — RLS Helpers & Policies
-- Migration 002

-- ── Helper functions ────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION public.is_org_member(_org_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE org_id = _org_id AND user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.org_role(_org_id UUID)
RETURNS TEXT LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT role::TEXT FROM public.team_members
  WHERE org_id = _org_id AND user_id = auth.uid()
  LIMIT 1
$$;

-- ── Profiles ────────────────────────────────────────────────────────────────

CREATE POLICY "Users view own profile" ON public.profiles
  FOR SELECT USING (auth.uid() = id);

CREATE POLICY "Users update own profile" ON public.profiles
  FOR UPDATE USING (auth.uid() = id);

CREATE POLICY "Users insert own profile" ON public.profiles
  FOR INSERT WITH CHECK (auth.uid() = id);

-- ── Organizations ────────────────────────────────────────────────────────────

CREATE POLICY "Members can view org" ON public.organizations
  FOR SELECT USING (public.is_org_member(id));

CREATE POLICY "Users can create org" ON public.organizations
  FOR INSERT WITH CHECK (auth.uid() = owner_user_id);

CREATE POLICY "Owner/admin can update org" ON public.organizations
  FOR UPDATE USING (public.org_role(id) IN ('owner', 'admin'));

-- ── Team Members ─────────────────────────────────────────────────────────────

CREATE POLICY "Members can view membership" ON public.team_members
  FOR SELECT USING (public.is_org_member(org_id));

CREATE POLICY "Owner/admin can add members" ON public.team_members
  FOR INSERT WITH CHECK (public.org_role(org_id) IN ('owner', 'admin'));

CREATE POLICY "Owner/admin can update members" ON public.team_members
  FOR UPDATE USING (public.org_role(org_id) IN ('owner', 'admin'));

CREATE POLICY "Owner/admin can remove members" ON public.team_members
  FOR DELETE USING (public.org_role(org_id) IN ('owner', 'admin'));

-- ── Projects ──────────────────────────────────────────────────────────────────

CREATE POLICY "Members can view projects" ON public.projects
  FOR SELECT USING (public.is_org_member(org_id));

CREATE POLICY "Members can create projects" ON public.projects
  FOR INSERT WITH CHECK (public.is_org_member(org_id));

CREATE POLICY "Members can update projects" ON public.projects
  FOR UPDATE USING (public.is_org_member(org_id));

CREATE POLICY "Owner/admin can delete projects" ON public.projects
  FOR DELETE USING (public.org_role(org_id) IN ('owner', 'admin'));

-- ── Skill Outputs ─────────────────────────────────────────────────────────────

CREATE POLICY "Members can view outputs" ON public.skill_outputs
  FOR SELECT USING (public.is_org_member(org_id));

CREATE POLICY "Members can create outputs" ON public.skill_outputs
  FOR INSERT WITH CHECK (public.is_org_member(org_id) AND auth.uid() = user_id);

CREATE POLICY "Members can update outputs" ON public.skill_outputs
  FOR UPDATE USING (public.is_org_member(org_id));

CREATE POLICY "Users can delete own outputs or admin" ON public.skill_outputs
  FOR DELETE USING (
    auth.uid() = user_id
    OR public.org_role(org_id) IN ('owner', 'admin')
  );

-- ── Invitations ───────────────────────────────────────────────────────────────

CREATE POLICY "Members can view invitations" ON public.invitations
  FOR SELECT USING (public.is_org_member(org_id));

CREATE POLICY "Owner/admin can create invitations" ON public.invitations
  FOR INSERT WITH CHECK (public.org_role(org_id) IN ('owner', 'admin'));

CREATE POLICY "Owner/admin can delete invitations" ON public.invitations
  FOR DELETE USING (public.org_role(org_id) IN ('owner', 'admin'));
