-- Migration 027: Notion-like workspace pages and blocks

CREATE TABLE IF NOT EXISTS public.workspace_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.workspace_pages(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Untitled',
  icon TEXT,
  cover_color TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  metadata JSONB NOT NULL DEFAULT '{}'::JSONB,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workspace_blocks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES public.workspace_pages(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'paragraph'
    CHECK (type IN ('paragraph','heading','subheading','bullet','todo','quote','divider')),
  content JSONB NOT NULL DEFAULT '{"text":""}'::JSONB,
  position INTEGER NOT NULL DEFAULT 0,
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.workspace_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workspace_blocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "workspace_pages_select" ON public.workspace_pages
  FOR SELECT USING (is_org_member(org_id) OR is_branch_member(org_id));

CREATE POLICY "workspace_pages_insert" ON public.workspace_pages
  FOR INSERT WITH CHECK (is_org_member(org_id) OR is_branch_member(org_id));

CREATE POLICY "workspace_pages_update" ON public.workspace_pages
  FOR UPDATE USING (is_org_member(org_id) OR is_branch_member(org_id));

CREATE POLICY "workspace_pages_delete" ON public.workspace_pages
  FOR DELETE USING (is_org_member(org_id) OR is_branch_member(org_id));

CREATE POLICY "workspace_blocks_select" ON public.workspace_blocks
  FOR SELECT USING (is_org_member(org_id) OR is_branch_member(org_id));

CREATE POLICY "workspace_blocks_insert" ON public.workspace_blocks
  FOR INSERT WITH CHECK (is_org_member(org_id) OR is_branch_member(org_id));

CREATE POLICY "workspace_blocks_update" ON public.workspace_blocks
  FOR UPDATE USING (is_org_member(org_id) OR is_branch_member(org_id));

CREATE POLICY "workspace_blocks_delete" ON public.workspace_blocks
  FOR DELETE USING (is_org_member(org_id) OR is_branch_member(org_id));

CREATE INDEX IF NOT EXISTS idx_workspace_pages_org_id ON public.workspace_pages(org_id);
CREATE INDEX IF NOT EXISTS idx_workspace_pages_parent ON public.workspace_pages(parent_id);
CREATE INDEX IF NOT EXISTS idx_workspace_pages_order ON public.workspace_pages(org_id, parent_id, position);
CREATE INDEX IF NOT EXISTS idx_workspace_pages_search ON public.workspace_pages USING gin(to_tsvector('english', title));
CREATE INDEX IF NOT EXISTS idx_workspace_blocks_page_order ON public.workspace_blocks(page_id, position);
CREATE INDEX IF NOT EXISTS idx_workspace_blocks_org_id ON public.workspace_blocks(org_id);
CREATE INDEX IF NOT EXISTS idx_workspace_blocks_search ON public.workspace_blocks USING gin(to_tsvector('english', content::text));

CREATE TRIGGER workspace_pages_updated_at
  BEFORE UPDATE ON public.workspace_pages
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER workspace_blocks_updated_at
  BEFORE UPDATE ON public.workspace_blocks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.team_members
  ALTER COLUMN feature_access SET DEFAULT '{"campaigns":true,"contacts":true,"projects":true,"skills":true,"intake":true,"workspace":true}';

UPDATE public.team_members
SET feature_access = feature_access || '{"workspace":true}'::JSONB
WHERE NOT (feature_access ? 'workspace');

COMMENT ON TABLE public.workspace_pages IS
  'Workspace page tree. Designed for future page templates, permissions, comments, and version history.';

COMMENT ON TABLE public.workspace_blocks IS
  'Ordered editable content blocks for workspace pages.';
