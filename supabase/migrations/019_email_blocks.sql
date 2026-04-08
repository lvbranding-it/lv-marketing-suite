CREATE TABLE IF NOT EXISTS public.email_blocks (
  id         UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id     UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name       TEXT        NOT NULL,
  html       TEXT        NOT NULL,
  category   TEXT        NOT NULL DEFAULT 'custom',
  created_by UUID        REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.email_blocks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "email_blocks_org" ON public.email_blocks
  FOR ALL USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));
CREATE INDEX idx_email_blocks_org ON public.email_blocks(org_id);
