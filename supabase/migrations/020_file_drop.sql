-- file_requests table
CREATE TABLE IF NOT EXISTS public.file_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  token text NOT NULL UNIQUE,
  expires_at timestamptz,
  status text NOT NULL DEFAULT 'active',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.file_requests ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS file_requests_org_id_idx ON public.file_requests(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS file_requests_token_idx ON public.file_requests(token);

-- Trigger for updated_at
CREATE TRIGGER file_requests_updated_at
  BEFORE UPDATE ON public.file_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS: org members can manage their requests
CREATE POLICY "org_members_manage_file_requests" ON public.file_requests
  USING (is_org_member(org_id)) WITH CHECK (is_org_member(org_id));
-- Public can read active, non-expired requests by token (for client upload page)
CREATE POLICY "public_read_active_file_requests" ON public.file_requests
  FOR SELECT USING (status = 'active' AND (expires_at IS NULL OR expires_at > now()));
-- Service role bypass
CREATE POLICY "service_role_file_requests" ON public.file_requests
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- file_submissions table
CREATE TABLE IF NOT EXISTS public.file_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL REFERENCES public.file_requests(id) ON DELETE CASCADE,
  file_name text NOT NULL,
  file_size bigint NOT NULL DEFAULT 0,
  mime_type text,
  file_path text NOT NULL,
  uploader_name text NOT NULL,
  uploader_email text NOT NULL,
  message text,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.file_submissions ENABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS file_submissions_request_id_idx ON public.file_submissions(request_id, created_at DESC);

-- RLS: org members can read submissions for their requests
CREATE POLICY "org_members_read_file_submissions" ON public.file_submissions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.file_requests fr
      WHERE fr.id = request_id AND is_org_member(fr.org_id)
    )
  );
-- Public insert (edge function uses service role, but allow direct too)
CREATE POLICY "public_insert_file_submissions" ON public.file_submissions
  FOR INSERT WITH CHECK (true);
-- Service role bypass
CREATE POLICY "service_role_file_submissions" ON public.file_submissions
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Storage bucket
INSERT INTO storage.buckets (id, name, public) VALUES ('client-uploads', 'client-uploads', false) ON CONFLICT DO NOTHING;
