-- ─────────────────────────────────────────────────────────────────────────────
-- 014_deliverables_and_invoices.sql
-- Adds:
--   • Invoice columns on photo_sessions (type, fee, Wave refs, paid tracking)
--   • Deliverables tracking columns on photo_sessions
--   • session_deliverables table (HD / LR edited files)
--   • session-deliverables private storage bucket (50 MB per file)
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. Invoice columns ────────────────────────────────────────────────────────

ALTER TABLE public.photo_sessions
  ADD COLUMN invoice_type          TEXT          NOT NULL DEFAULT 'none'
    CHECK (invoice_type IN ('none', 'session', 'manual')),
  ADD COLUMN session_fee           NUMERIC(10,2) NOT NULL DEFAULT 0.00,
  ADD COLUMN session_invoice_id    TEXT,
  ADD COLUMN session_invoice_url   TEXT,
  ADD COLUMN session_invoice_sent_at  TIMESTAMPTZ,
  ADD COLUMN session_invoice_paid_at  TIMESTAMPTZ;

-- ── 2. Deliverables tracking columns ─────────────────────────────────────────

ALTER TABLE public.photo_sessions
  ADD COLUMN deliverables_ready_at    TIMESTAMPTZ,
  ADD COLUMN deliverables_notified_at TIMESTAMPTZ;

-- ── 3. session_deliverables table ────────────────────────────────────────────

CREATE TABLE public.session_deliverables (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   UUID        NOT NULL REFERENCES public.photo_sessions(id) ON DELETE CASCADE,
  org_id       UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  storage_path TEXT        NOT NULL,
  file_name    TEXT        NOT NULL,
  file_size    INT         NOT NULL CHECK (file_size > 0),
  -- 'hd' = high-resolution final edit  |  'lr' = low-res / web version
  quality      TEXT        NOT NULL DEFAULT 'hd' CHECK (quality IN ('hd', 'lr')),
  mime_type    TEXT        NOT NULL DEFAULT 'application/octet-stream',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.session_deliverables ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_session_deliverables_session_id ON public.session_deliverables(session_id);
CREATE INDEX idx_session_deliverables_org_id     ON public.session_deliverables(org_id);

-- Org members: full CRUD
CREATE POLICY "org members can manage deliverables"
  ON public.session_deliverables FOR ALL
  TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

-- Anon clients: read-only when the session has published deliverables
CREATE POLICY "public can read published deliverables"
  ON public.session_deliverables FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.photo_sessions ps
      WHERE ps.id = session_id
        AND ps.allow_zip_download = true
        AND ps.deliverables_ready_at IS NOT NULL
    )
  );

-- ── 4. Storage bucket ─────────────────────────────────────────────────────────

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'session-deliverables',
  'session-deliverables',
  false,
  52428800,   -- 50 MB
  ARRAY[
    'image/jpeg', 'image/jpg', 'image/png', 'image/webp',
    'image/tiff', 'image/heic', 'image/heif',
    'application/zip', 'application/x-zip-compressed',
    'application/octet-stream'
  ]
);

-- Storage policies: org members read/write within their org prefix
CREATE POLICY "org members can upload deliverables"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'session-deliverables'
    AND (storage.foldername(name))[1] IN (
      SELECT o.id::text
      FROM public.org_members om
      JOIN public.organizations o ON o.id = om.org_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "org members can read deliverables"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'session-deliverables'
    AND (storage.foldername(name))[1] IN (
      SELECT o.id::text
      FROM public.org_members om
      JOIN public.organizations o ON o.id = om.org_id
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "org members can delete deliverables"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'session-deliverables'
    AND (storage.foldername(name))[1] IN (
      SELECT o.id::text
      FROM public.org_members om
      JOIN public.organizations o ON o.id = om.org_id
      WHERE om.user_id = auth.uid()
    )
  );
