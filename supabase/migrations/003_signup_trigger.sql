-- LV Marketing Suite — Signup Trigger + Updated-At Helpers
-- Migration 003

-- Auto-create profile + org + owner membership on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE PLPGSQL SECURITY DEFINER SET search_path = public AS $$
DECLARE
  new_org_id UUID;
  user_name TEXT;
BEGIN
  user_name := COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1));

  -- Create profile
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, user_name);

  -- Create personal workspace org
  INSERT INTO public.organizations (name, owner_user_id)
  VALUES (user_name || '''s Workspace', NEW.id)
  RETURNING id INTO new_org_id;

  -- Add as owner
  INSERT INTO public.team_members (org_id, user_id, role)
  VALUES (new_org_id, NEW.id, 'owner');

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Updated-at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE PLPGSQL;

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_projects_updated_at
  BEFORE UPDATE ON public.projects
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_skill_outputs_updated_at
  BEFORE UPDATE ON public.skill_outputs
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
