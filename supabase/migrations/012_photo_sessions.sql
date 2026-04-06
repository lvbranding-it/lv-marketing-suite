-- ─────────────────────────────────────────────────────────────────────────────
-- 012_photo_sessions.sql
-- PhotoSelector Pro module: sessions, photos, comments, storage bucket, RLS
-- ─────────────────────────────────────────────────────────────────────────────

-- ── 1. ENUMS ──────────────────────────────────────────────────────────────────

CREATE TYPE public.photo_status AS ENUM (
  'not_selected',
  'selected',
  'editing',
  'ready',
  'ready_for_download'
);

CREATE TYPE public.session_status AS ENUM (
  'active',
  'archived'
);

-- ── 2. TABLES ─────────────────────────────────────────────────────────────────

-- photo_sessions
CREATE TABLE public.photo_sessions (
  id                  UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              UUID          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by          UUID          REFERENCES auth.users(id) ON DELETE SET NULL,
  name                TEXT          NOT NULL,
  client_name         TEXT          NOT NULL,
  client_email        TEXT,
  photo_limit         INT           NOT NULL DEFAULT 0 CHECK (photo_limit >= 0),
  extra_photo_price   NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (extra_photo_price >= 0),
  allow_zip_download  BOOLEAN       NOT NULL DEFAULT FALSE,
  status              session_status NOT NULL DEFAULT 'active',
  -- Publicly-shareable token — clients never need to log in
  share_token         UUID          NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  created_at          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ   NOT NULL DEFAULT now()
);
ALTER TABLE public.photo_sessions ENABLE ROW LEVEL SECURITY;

-- session_photos
CREATE TABLE public.session_photos (
  id             UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id     UUID          NOT NULL REFERENCES public.photo_sessions(id) ON DELETE CASCADE,
  org_id         UUID          NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- Storage path: session-photos/{org_id}/{session_id}/{uuid}-{filename}
  storage_path   TEXT          NOT NULL,
  file_name      TEXT          NOT NULL,
  file_size      INT           NOT NULL CHECK (file_size > 0),
  mime_type      TEXT          NOT NULL DEFAULT 'image/jpeg',
  status         photo_status  NOT NULL DEFAULT 'not_selected',
  display_order  INT           NOT NULL DEFAULT 0,
  created_at     TIMESTAMPTZ   NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);
ALTER TABLE public.session_photos ENABLE ROW LEVEL SECURITY;

-- photo_comments
CREATE TABLE public.photo_comments (
  id             UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  photo_id       UUID        NOT NULL REFERENCES public.session_photos(id) ON DELETE CASCADE,
  session_id     UUID        NOT NULL REFERENCES public.photo_sessions(id) ON DELETE CASCADE,
  org_id         UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  -- NULL = comment came from the client (anon, no auth)
  author_user_id UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  -- Label shown in UI: "Photographer" or client's name stored on the session
  author_label   TEXT        NOT NULL DEFAULT 'Client',
  body           TEXT        NOT NULL CHECK (char_length(body) > 0),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.photo_comments ENABLE ROW LEVEL SECURITY;

-- ── 3. INDEXES ────────────────────────────────────────────────────────────────

CREATE INDEX idx_photo_sessions_org_id      ON public.photo_sessions(org_id);
CREATE INDEX idx_photo_sessions_share_token ON public.photo_sessions(share_token);
CREATE INDEX idx_photo_sessions_status      ON public.photo_sessions(status);
CREATE INDEX idx_session_photos_session_id  ON public.session_photos(session_id);
CREATE INDEX idx_session_photos_org_id      ON public.session_photos(org_id);
CREATE INDEX idx_session_photos_status      ON public.session_photos(status);
CREATE INDEX idx_photo_comments_photo_id    ON public.photo_comments(photo_id);
CREATE INDEX idx_photo_comments_session_id  ON public.photo_comments(session_id);

-- ── 4. UPDATED_AT TRIGGERS ────────────────────────────────────────────────────
-- Reuses update_updated_at_column() defined in migration 003

CREATE TRIGGER update_photo_sessions_updated_at
  BEFORE UPDATE ON public.photo_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_session_photos_updated_at
  BEFORE UPDATE ON public.session_photos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ── 5. RLS POLICIES ───────────────────────────────────────────────────────────

-- ─── photo_sessions ──────────────────────────────────────────────────────────

CREATE POLICY "org members can view sessions"
  ON public.photo_sessions FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY "org members can create sessions"
  ON public.photo_sessions FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY "org members can update sessions"
  ON public.photo_sessions FOR UPDATE
  TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY "owner admin can delete sessions"
  ON public.photo_sessions FOR DELETE
  TO authenticated
  USING (public.org_role(org_id) IN ('owner', 'admin'));

-- Public (anon) read via share_token — app always filters by share_token in the query
CREATE POLICY "public can read session by share token"
  ON public.photo_sessions FOR SELECT
  TO anon
  USING (true);

-- ─── session_photos ───────────────────────────────────────────────────────────

CREATE POLICY "org members can view photos"
  ON public.session_photos FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY "org members can insert photos"
  ON public.session_photos FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY "org members can update photos"
  ON public.session_photos FOR UPDATE
  TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY "owner admin can delete photos"
  ON public.session_photos FOR DELETE
  TO authenticated
  USING (public.org_role(org_id) IN ('owner', 'admin'));

-- Anon clients read photos that belong to an existing session
CREATE POLICY "public can read photos for shared session"
  ON public.session_photos FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.photo_sessions ps
      WHERE ps.id = session_id
    )
  );

-- Anon clients can toggle status between not_selected and selected only
CREATE POLICY "public can update photo status"
  ON public.session_photos FOR UPDATE
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.photo_sessions ps
      WHERE ps.id = session_id
    )
  )
  WITH CHECK (
    status IN ('not_selected', 'selected')
  );

-- ─── photo_comments ───────────────────────────────────────────────────────────

CREATE POLICY "org members can view comments"
  ON public.photo_comments FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY "org members can insert comments"
  ON public.photo_comments FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY "org members can delete comments"
  ON public.photo_comments FOR DELETE
  TO authenticated
  USING (public.org_role(org_id) IN ('owner', 'admin'));

CREATE POLICY "public can read comments for shared session"
  ON public.photo_comments FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.photo_sessions ps
      WHERE ps.id = session_id
    )
  );

-- Anon clients can post comments; author_user_id must be NULL (cannot impersonate users)
CREATE POLICY "public can insert comments"
  ON public.photo_comments FOR INSERT
  TO anon
  WITH CHECK (author_user_id IS NULL);

-- ── 6. STORAGE BUCKET ─────────────────────────────────────────────────────────

-- Private bucket: photos accessed via time-limited signed URLs
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'session-photos',
  'session-photos',
  false,
  15728640, -- 15 MB per file
  ARRAY[
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp',
    'image/heic',
    'image/heif'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Org members upload into their own org folder: {org_id}/{session_id}/{filename}
CREATE POLICY "org members can upload session photos"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'session-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- Org members read their own photos
CREATE POLICY "org members can read session photos"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'session-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM public.team_members WHERE user_id = auth.uid()
    )
  );

-- Org members delete their own photos
CREATE POLICY "org members can delete session photos"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'session-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT org_id::text FROM public.team_members WHERE user_id = auth.uid()
    )
  );
