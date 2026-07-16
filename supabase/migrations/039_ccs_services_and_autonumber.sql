-- CCS: multi-service bundles + automatic project numbers.

-- Ordered list of services for a phased engagement (e.g. Consulting -> Creativity -> Photography).
ALTER TABLE public.ccs_projects
  ADD COLUMN IF NOT EXISTS service_types jsonb NOT NULL DEFAULT '[]'::jsonb;

-- Auto-assign a per-org, per-year project number (LV-YYYY-NNN) when none is provided.
CREATE OR REPLACE FUNCTION public.ccs_assign_project_number()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
DECLARE
  v_year TEXT := to_char(now(), 'YYYY');
  v_seq  INT;
BEGIN
  IF NEW.project_number IS NULL OR NEW.project_number = '' THEN
    SELECT COALESCE(MAX((regexp_replace(project_number, '^LV-\d{4}-', ''))::int), 0) + 1
      INTO v_seq
      FROM public.ccs_projects
     WHERE org_id = NEW.org_id
       AND project_number ~ ('^LV-' || v_year || '-\d+$');
    NEW.project_number := 'LV-' || v_year || '-' || lpad(v_seq::text, 3, '0');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS ccs_projects_assign_number ON public.ccs_projects;
CREATE TRIGGER ccs_projects_assign_number
  BEFORE INSERT ON public.ccs_projects
  FOR EACH ROW EXECUTE FUNCTION public.ccs_assign_project_number();
