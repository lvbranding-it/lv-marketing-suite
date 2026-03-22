-- CRM fields on contacts
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS pipeline_stage TEXT NOT NULL DEFAULT 'lead'
    CHECK (pipeline_stage IN ('lead','contacted','qualified','proposal','won','lost')),
  ADD COLUMN IF NOT EXISTS deal_value NUMERIC(12,2),
  ADD COLUMN IF NOT EXISTS deal_probability INTEGER
    CHECK (deal_probability BETWEEN 0 AND 100),
  ADD COLUMN IF NOT EXISTS last_contacted_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS next_followup_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS crm_notes TEXT;

-- Activities timeline
CREATE TABLE IF NOT EXISTS public.contact_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  type TEXT NOT NULL CHECK (type IN ('note','call','email','meeting')),
  body TEXT NOT NULL,
  meta JSONB NOT NULL DEFAULT '{}'
);

ALTER TABLE public.contact_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view activities"
  ON public.contact_activities FOR SELECT USING (is_org_member(org_id));

CREATE POLICY "Org members can insert activities"
  ON public.contact_activities FOR INSERT WITH CHECK (is_org_member(org_id));

CREATE POLICY "Org members can delete activities"
  ON public.contact_activities FOR DELETE USING (is_org_member(org_id));

CREATE INDEX IF NOT EXISTS contact_activities_contact_id_idx ON public.contact_activities(contact_id);
CREATE INDEX IF NOT EXISTS contact_activities_org_id_idx ON public.contact_activities(org_id);
