-- design_outputs table for the standalone Design Suite section
CREATE TABLE IF NOT EXISTS public.design_outputs (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id     uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  design_type_id   text  NOT NULL,
  design_type_name text  NOT NULL,
  title       text,
  prompt      text        NOT NULL,
  html_output text        NOT NULL,
  is_starred  boolean     NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.design_outputs ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS design_outputs_org_id_idx
  ON public.design_outputs(org_id, created_at DESC);

CREATE TRIGGER design_outputs_updated_at
  BEFORE UPDATE ON public.design_outputs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- All org members can manage their org's designs
CREATE POLICY "org_members_manage_design_outputs" ON public.design_outputs
  USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));

CREATE POLICY "service_role_design_outputs" ON public.design_outputs
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');
