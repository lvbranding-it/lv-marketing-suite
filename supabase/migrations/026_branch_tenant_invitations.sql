-- 026_branch_tenant_invitations.sql
-- Separates branch-local tenant members from HQ team members.

ALTER TABLE public.branch_team_members
  ADD COLUMN IF NOT EXISTS invited_email TEXT,
  ADD COLUMN IF NOT EXISTS display_name TEXT;

CREATE TABLE IF NOT EXISTS public.branch_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  branch_id UUID NOT NULL REFERENCES public.org_branches(id) ON DELETE CASCADE,
  invited_email TEXT NOT NULL,
  invitee_name TEXT,
  role public.branch_member_role NOT NULL DEFAULT 'crew',
  token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  accepted_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (branch_id, org_id) REFERENCES public.org_branches(id, org_id) ON DELETE CASCADE
);

ALTER TABLE public.branch_invitations ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS idx_branch_invitations_org_branch
  ON public.branch_invitations(org_id, branch_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_branch_invitations_email
  ON public.branch_invitations(invited_email);

CREATE OR REPLACE FUNCTION public.is_branch_member(_org_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.branch_team_members
    WHERE org_id = _org_id AND user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.is_branch_member(_branch_id UUID, _org_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.branch_team_members
    WHERE branch_id = _branch_id AND org_id = _org_id AND user_id = auth.uid()
  )
$$;

CREATE OR REPLACE FUNCTION public.can_access_branch_record(_org_id UUID, _branch_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.is_org_member(_org_id)
    OR (
      _branch_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM public.branch_team_members
        WHERE org_id = _org_id AND branch_id = _branch_id AND user_id = auth.uid()
      )
    )
$$;

CREATE OR REPLACE FUNCTION public.can_manage_branch_team(_branch_id UUID, _org_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.org_role(_org_id) IN ('owner', 'admin')
    OR EXISTS (
      SELECT 1 FROM public.branch_team_members
      WHERE branch_id = _branch_id
        AND org_id = _org_id
        AND user_id = auth.uid()
        AND role IN ('regional_ceo', 'manager')
    )
$$;

CREATE OR REPLACE FUNCTION public.can_write_branch_team_role(
  _branch_id UUID,
  _org_id UUID,
  _target_role public.branch_member_role
)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.org_role(_org_id) IN ('owner', 'admin')
    OR EXISTS (
      SELECT 1 FROM public.branch_team_members
      WHERE branch_id = _branch_id
        AND org_id = _org_id
        AND user_id = auth.uid()
        AND (
          (role = 'regional_ceo' AND _target_role IN ('manager', 'crew'))
          OR (role = 'manager' AND _target_role = 'crew')
        )
    )
$$;

DROP POLICY IF EXISTS "hq_or_regional_ceo_can_add_branch_team" ON public.branch_team_members;
DROP POLICY IF EXISTS "hq_or_regional_ceo_can_update_branch_team" ON public.branch_team_members;
DROP POLICY IF EXISTS "hq_or_regional_ceo_can_remove_branch_team" ON public.branch_team_members;

CREATE POLICY "branch_members_can_view_org" ON public.organizations
  FOR SELECT USING (public.is_branch_member(id));

CREATE POLICY "branch_members_can_view_assigned_branches" ON public.org_branches
  FOR SELECT USING (public.is_branch_member(id, org_id));

CREATE POLICY "branch_members_can_view_own_branch_team" ON public.branch_team_members
  FOR SELECT USING (public.is_branch_member(branch_id, org_id));

CREATE POLICY "branch_managers_can_add_branch_team" ON public.branch_team_members
  FOR INSERT WITH CHECK (public.can_write_branch_team_role(branch_id, org_id, role));

CREATE POLICY "branch_managers_can_update_branch_team" ON public.branch_team_members
  FOR UPDATE USING (public.can_write_branch_team_role(branch_id, org_id, role))
  WITH CHECK (public.can_write_branch_team_role(branch_id, org_id, role));

CREATE POLICY "branch_managers_can_remove_branch_team" ON public.branch_team_members
  FOR DELETE USING (public.can_write_branch_team_role(branch_id, org_id, role));

CREATE POLICY "branch_invitations_manage" ON public.branch_invitations
  FOR ALL USING (public.can_manage_branch_team(branch_id, org_id))
  WITH CHECK (public.can_write_branch_team_role(branch_id, org_id, role));

CREATE POLICY "public_can_read_branch_invitation_by_token" ON public.branch_invitations
  FOR SELECT USING (true);

CREATE POLICY "branch_members_projects_select" ON public.projects
  FOR SELECT USING (public.can_access_branch_record(org_id, branch_id));
CREATE POLICY "branch_members_projects_insert" ON public.projects
  FOR INSERT WITH CHECK (public.can_access_branch_record(org_id, branch_id));
CREATE POLICY "branch_members_projects_update" ON public.projects
  FOR UPDATE USING (public.can_access_branch_record(org_id, branch_id))
  WITH CHECK (public.can_access_branch_record(org_id, branch_id));

CREATE POLICY "branch_members_outputs_select" ON public.skill_outputs
  FOR SELECT USING (public.can_access_branch_record(org_id, branch_id));
CREATE POLICY "branch_members_outputs_insert" ON public.skill_outputs
  FOR INSERT WITH CHECK (public.can_access_branch_record(org_id, branch_id) AND auth.uid() = user_id);
CREATE POLICY "branch_members_outputs_update" ON public.skill_outputs
  FOR UPDATE USING (public.can_access_branch_record(org_id, branch_id))
  WITH CHECK (public.can_access_branch_record(org_id, branch_id));

CREATE POLICY "branch_members_contacts_select" ON public.contacts
  FOR SELECT USING (public.can_access_branch_record(org_id, branch_id));
CREATE POLICY "branch_members_contacts_insert" ON public.contacts
  FOR INSERT WITH CHECK (public.can_access_branch_record(org_id, branch_id));
CREATE POLICY "branch_members_contacts_update" ON public.contacts
  FOR UPDATE USING (public.can_access_branch_record(org_id, branch_id))
  WITH CHECK (public.can_access_branch_record(org_id, branch_id));

CREATE POLICY "branch_members_campaigns" ON public.email_campaigns
  FOR ALL USING (public.can_access_branch_record(org_id, branch_id))
  WITH CHECK (public.can_access_branch_record(org_id, branch_id));

CREATE POLICY "branch_members_campaign_recipients" ON public.email_campaign_recipients
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.email_campaigns campaign
      WHERE campaign.id = campaign_id
        AND public.can_access_branch_record(campaign.org_id, campaign.branch_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.email_campaigns campaign
      WHERE campaign.id = campaign_id
        AND public.can_access_branch_record(campaign.org_id, campaign.branch_id)
    )
  );

CREATE POLICY "branch_members_campaign_suppressions" ON public.email_suppressions
  FOR ALL USING (
    campaign_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.email_campaigns campaign
      WHERE campaign.id = campaign_id
        AND public.can_access_branch_record(campaign.org_id, campaign.branch_id)
    )
  )
  WITH CHECK (
    campaign_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM public.email_campaigns campaign
      WHERE campaign.id = campaign_id
        AND public.can_access_branch_record(campaign.org_id, campaign.branch_id)
    )
  );

CREATE POLICY "branch_members_photo_sessions_select" ON public.photo_sessions
  FOR SELECT USING (public.can_access_branch_record(org_id, branch_id));
CREATE POLICY "branch_members_photo_sessions_insert" ON public.photo_sessions
  FOR INSERT WITH CHECK (public.can_access_branch_record(org_id, branch_id));
CREATE POLICY "branch_members_photo_sessions_update" ON public.photo_sessions
  FOR UPDATE USING (public.can_access_branch_record(org_id, branch_id))
  WITH CHECK (public.can_access_branch_record(org_id, branch_id));

CREATE POLICY "branch_members_session_photos" ON public.session_photos
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.photo_sessions session
      WHERE session.id = session_id
        AND public.can_access_branch_record(session.org_id, session.branch_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.photo_sessions session
      WHERE session.id = session_id
        AND public.can_access_branch_record(session.org_id, session.branch_id)
    )
  );

CREATE POLICY "branch_members_photo_comments" ON public.photo_comments
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.photo_sessions session
      WHERE session.id = session_id
        AND public.can_access_branch_record(session.org_id, session.branch_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.photo_sessions session
      WHERE session.id = session_id
        AND public.can_access_branch_record(session.org_id, session.branch_id)
    )
  );

CREATE POLICY "branch_members_session_deliverables" ON public.session_deliverables
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM public.photo_sessions session
      WHERE session.id = session_id
        AND public.can_access_branch_record(session.org_id, session.branch_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.photo_sessions session
      WHERE session.id = session_id
        AND public.can_access_branch_record(session.org_id, session.branch_id)
    )
  );

CREATE POLICY "branch_members_usage_select" ON public.branch_usage_events
  FOR SELECT USING (public.can_access_branch_record(org_id, branch_id));
CREATE POLICY "branch_members_usage_insert" ON public.branch_usage_events
  FOR INSERT WITH CHECK (public.can_access_branch_record(org_id, branch_id));
