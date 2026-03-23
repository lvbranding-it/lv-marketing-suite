-- Migration 010: Contact tag definitions for campaign organization
-- Tags are stored as TEXT[] on contacts (migration 006).
-- This table adds metadata: color and per-org uniqueness.

CREATE TABLE IF NOT EXISTS public.contact_tag_definitions (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  color      TEXT        NOT NULL DEFAULT '#6366f1',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (org_id, name)
);

ALTER TABLE public.contact_tag_definitions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tag_defs_select" ON public.contact_tag_definitions
  FOR SELECT USING (is_org_member(org_id));
CREATE POLICY "tag_defs_insert" ON public.contact_tag_definitions
  FOR INSERT WITH CHECK (is_org_member(org_id));
CREATE POLICY "tag_defs_update" ON public.contact_tag_definitions
  FOR UPDATE USING (is_org_member(org_id));
CREATE POLICY "tag_defs_delete" ON public.contact_tag_definitions
  FOR DELETE USING (is_org_member(org_id));

CREATE INDEX IF NOT EXISTS idx_contact_tag_defs_org_id ON public.contact_tag_definitions(org_id);
