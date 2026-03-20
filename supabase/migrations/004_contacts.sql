-- Migration 004: Imported contacts from Vibe Prospecting / Apollo

CREATE TABLE public.contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  -- Core identity
  first_name TEXT,
  last_name TEXT,
  title TEXT,
  company TEXT,
  email TEXT,
  phone TEXT,
  linkedin_url TEXT,
  website TEXT,

  -- Location
  city TEXT,
  state TEXT,
  country TEXT DEFAULT 'US',

  -- Classification
  industry TEXT,
  employees_range TEXT,
  fit_score INTEGER,
  signals JSONB NOT NULL DEFAULT '[]'::JSONB,

  -- Source tracking
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','vibe','apollo')),
  source_id TEXT,          -- external ID from Vibe/Apollo
  apollo_id TEXT,          -- Apollo contact ID (set after push to Apollo)
  raw_data JSONB NOT NULL DEFAULT '{}'::JSONB,

  -- Meta
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;

-- RLS: org members can read; owner/admin can insert/update/delete
CREATE POLICY "contacts_select" ON public.contacts
  FOR SELECT USING (is_org_member(org_id));

CREATE POLICY "contacts_insert" ON public.contacts
  FOR INSERT WITH CHECK (is_org_member(org_id));

CREATE POLICY "contacts_update" ON public.contacts
  FOR UPDATE USING (is_org_member(org_id));

CREATE POLICY "contacts_delete" ON public.contacts
  FOR DELETE USING (org_role(org_id) IN ('owner','admin'));

-- Indexes
CREATE INDEX idx_contacts_org_id ON public.contacts(org_id);
CREATE INDEX idx_contacts_source ON public.contacts(source);
CREATE INDEX idx_contacts_email ON public.contacts(email);
CREATE INDEX idx_contacts_created_at ON public.contacts(created_at DESC);

-- updated_at trigger
CREATE TRIGGER contacts_updated_at
  BEFORE UPDATE ON public.contacts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
