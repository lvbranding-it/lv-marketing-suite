-- 011_team_roles.sql

-- 1. Add 'manager' to member_role enum
ALTER TYPE public.member_role ADD VALUE IF NOT EXISTS 'manager' AFTER 'admin';

-- 2. Add activity_log table
CREATE TABLE public.activity_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  user_email TEXT,
  action TEXT NOT NULL,           -- e.g. 'edited_contact', 'deleted_contact', 'drafted_campaign'
  entity_type TEXT,               -- 'contact' | 'campaign' | 'project' | 'member'
  entity_id TEXT,
  entity_label TEXT,              -- human-readable name of the entity
  metadata JSONB DEFAULT '{}'::JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_activity_log_org_id ON public.activity_log(org_id);
CREATE INDEX idx_activity_log_created_at ON public.activity_log(created_at DESC);

-- RLS: only owner/admin can read activity logs
CREATE POLICY "admin_can_view_activity" ON public.activity_log
  FOR SELECT USING (public.org_role(org_id) IN ('owner', 'admin'));

-- Service role can insert (used by edge functions and client mutations)
CREATE POLICY "service_can_insert_activity" ON public.activity_log
  FOR INSERT WITH CHECK (true);

-- 3. Add invited_by_role to invitations (track who invited whom for manager removal logic)
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS invited_by_role TEXT;

-- 4. Add cancelled_at to invitations
ALTER TABLE public.invitations ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ;

-- 5. Update team_members RLS: managers can add/update/delete members they invited
-- First, add invited_by to team_members
ALTER TABLE public.team_members ADD COLUMN IF NOT EXISTS invited_by UUID REFERENCES auth.users(id) ON DELETE SET NULL;

-- Drop the old insert/update/delete policies and recreate with manager support
DROP POLICY IF EXISTS "Owner/admin can add members" ON public.team_members;
DROP POLICY IF EXISTS "Owner/admin can update members" ON public.team_members;
DROP POLICY IF EXISTS "Owner/admin can remove members" ON public.team_members;

CREATE POLICY "owner_admin_manager_can_add_members" ON public.team_members
  FOR INSERT WITH CHECK (public.org_role(org_id) IN ('owner', 'admin', 'manager'));

CREATE POLICY "owner_admin_can_update_members" ON public.team_members
  FOR UPDATE USING (public.org_role(org_id) IN ('owner', 'admin'));

CREATE POLICY "owner_admin_can_remove_members" ON public.team_members
  FOR DELETE USING (
    public.org_role(org_id) IN ('owner', 'admin')
    OR (
      public.org_role(org_id) = 'manager'
      AND invited_by = auth.uid()
      AND role = 'member'
    )
  );

-- 6. Invitations RLS: managers can create invitations for members
DROP POLICY IF EXISTS "Owner/admin can manage invitations" ON public.invitations;
DROP POLICY IF EXISTS "Members can view invitations" ON public.invitations;
DROP POLICY IF EXISTS "Owner/admin can create invitations" ON public.invitations;
DROP POLICY IF EXISTS "Owner/admin can delete invitations" ON public.invitations;

CREATE POLICY "admin_can_manage_invitations" ON public.invitations
  FOR ALL USING (public.org_role(org_id) IN ('owner', 'admin'));

CREATE POLICY "manager_can_invite_members" ON public.invitations
  FOR INSERT WITH CHECK (
    public.org_role(org_id) = 'manager'
    AND role = 'member'
  );

CREATE POLICY "manager_can_view_own_invitations" ON public.invitations
  FOR SELECT USING (
    public.org_role(org_id) IN ('owner', 'admin', 'manager')
  );

-- 7. Public read for accept-invitation edge function (by token)
CREATE POLICY "public_can_read_invitation_by_token" ON public.invitations
  FOR SELECT USING (true);
