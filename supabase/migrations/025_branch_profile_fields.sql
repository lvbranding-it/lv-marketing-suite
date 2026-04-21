-- 025_branch_profile_fields.sql
-- Branch profile details shown to local teams.

ALTER TABLE public.org_branches
  ADD COLUMN IF NOT EXISTS country_flag TEXT,
  ADD COLUMN IF NOT EXISTS notification_banner TEXT;
