-- Migration 028: Workspace page assets and private storage

CREATE TABLE IF NOT EXISTS public.workspace_assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES public.workspace_pages(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'reference'
    CHECK (category IN ('logo','photo','pdf','palette','design_system','calendar','reference')),
  file_name TEXT NOT NULL,
  file_size BIGINT NOT NULL DEFAULT 0,
  mime_type TEXT,
  storage_path TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.workspace_assets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_assets_select" ON public.workspace_assets
  FOR SELECT USING (is_org_member(org_id) OR is_branch_member(org_id));

CREATE POLICY "workspace_assets_insert" ON public.workspace_assets
  FOR INSERT WITH CHECK (is_org_member(org_id) OR is_branch_member(org_id));

CREATE POLICY "workspace_assets_update" ON public.workspace_assets
  FOR UPDATE USING (is_org_member(org_id) OR is_branch_member(org_id));

CREATE POLICY "workspace_assets_delete" ON public.workspace_assets
  FOR DELETE USING (is_org_member(org_id) OR is_branch_member(org_id));

CREATE INDEX IF NOT EXISTS idx_workspace_assets_org_id ON public.workspace_assets(org_id);
CREATE INDEX IF NOT EXISTS idx_workspace_assets_page_id ON public.workspace_assets(page_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_workspace_assets_category ON public.workspace_assets(org_id, category);

CREATE TRIGGER workspace_assets_updated_at
  BEFORE UPDATE ON public.workspace_assets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'workspace-assets',
  'workspace-assets',
  false,
  52428800,
  ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/gif',
    'image/svg+xml',
    'application/pdf',
    'application/json',
    'text/plain',
    'text/csv',
    'text/calendar',
    'text/css',
    'application/octet-stream',
    'application/zip',
    'application/x-zip-compressed',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- Workspace asset paths use {org_id}/{page_id}/{timestamp}-{filename}.
CREATE POLICY "org and branch members can upload workspace assets"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'workspace-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM public.team_members WHERE user_id = auth.uid()
      UNION
      SELECT org_id::text FROM public.branch_team_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org and branch members can read workspace assets"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'workspace-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM public.team_members WHERE user_id = auth.uid()
      UNION
      SELECT org_id::text FROM public.branch_team_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org and branch members can delete workspace assets"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'workspace-assets'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM public.team_members WHERE user_id = auth.uid()
      UNION
      SELECT org_id::text FROM public.branch_team_members WHERE user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.workspace_assets IS
  'Page-scoped workspace uploads for logos, photos, PDFs, palettes, design systems, calendars, and reference files.';
