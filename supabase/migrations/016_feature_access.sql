-- Migration 016: Per-member feature access control
-- Adds a feature_access JSONB column to team_members so admins can
-- toggle individual app sections (campaigns, contacts, projects, skills, intake)
-- on/off per team member. Defaults to all features enabled.

ALTER TABLE public.team_members
  ADD COLUMN IF NOT EXISTS feature_access JSONB NOT NULL DEFAULT '{"campaigns":true,"contacts":true,"projects":true,"skills":true,"intake":true}';

COMMENT ON COLUMN public.team_members.feature_access IS
  'Per-member feature toggles. Keys: campaigns, contacts, projects, skills, intake. Values: boolean.';
