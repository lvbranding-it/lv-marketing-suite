-- Contest & Voting Platform

CREATE TABLE IF NOT EXISTS public.contests (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id               UUID        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  slug                 TEXT        NOT NULL UNIQUE,
  title                TEXT        NOT NULL,
  description          TEXT,
  voting_instructions  TEXT,
  client_name          TEXT,
  client_logo_url      TEXT,
  brand_color          TEXT        NOT NULL DEFAULT '#CB2039',
  brand_accent         TEXT        NOT NULL DEFAULT '#1A1A2E',
  voting_opens_at      TIMESTAMPTZ,
  voting_closes_at     TIMESTAMPTZ,
  status               TEXT        NOT NULL DEFAULT 'draft'
                                      CHECK (status IN ('draft', 'active', 'closed', 'winner_announced')),
  results_public       BOOLEAN     NOT NULL DEFAULT false,
  winner_contestant_id UUID,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contestants (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id    UUID        NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  name          TEXT        NOT NULL,
  description   TEXT,
  photo_url     TEXT,
  display_order INT         NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.votes (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id    UUID        NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  contestant_id UUID        NOT NULL REFERENCES public.contestants(id) ON DELETE CASCADE,
  voter_email   TEXT        NOT NULL,
  verified_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contest_id, voter_email)
);

CREATE TABLE IF NOT EXISTS public.vote_verifications (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id    UUID        NOT NULL REFERENCES public.contests(id) ON DELETE CASCADE,
  contestant_id UUID        NOT NULL REFERENCES public.contestants(id) ON DELETE CASCADE,
  voter_email   TEXT        NOT NULL,
  token         TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  expires_at    TIMESTAMPTZ NOT NULL DEFAULT now() + interval '24 hours',
  used_at       TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'contests_winner_contestant_id_fkey'
  ) THEN
    ALTER TABLE public.contests
      ADD CONSTRAINT contests_winner_contestant_id_fkey
      FOREIGN KEY (winner_contestant_id) REFERENCES public.contestants(id) ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS contests_org_created_idx ON public.contests(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS contests_slug_idx ON public.contests(slug);
CREATE INDEX IF NOT EXISTS contestants_contest_order_idx ON public.contestants(contest_id, display_order, created_at);
CREATE INDEX IF NOT EXISTS votes_contest_verified_idx ON public.votes(contest_id, verified_at);
CREATE INDEX IF NOT EXISTS vote_verifications_token_idx ON public.vote_verifications(token);
CREATE INDEX IF NOT EXISTS vote_verifications_email_idx ON public.vote_verifications(contest_id, voter_email, used_at);

ALTER TABLE public.contests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contestants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.votes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vote_verifications ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS contests_updated_at ON public.contests;
CREATE TRIGGER contests_updated_at
  BEFORE UPDATE ON public.contests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.is_public_contest(_contest_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contests c
    WHERE c.id = _contest_id
      AND c.status IN ('active', 'closed', 'winner_announced')
  )
$$;

CREATE OR REPLACE FUNCTION public.can_read_contest_results(_contest_id UUID)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.contests c
    WHERE c.id = _contest_id
      AND (
        c.results_public
        OR c.status IN ('closed', 'winner_announced')
        OR public.is_org_member(c.org_id)
      )
  )
$$;

CREATE OR REPLACE FUNCTION public.get_contest_vote_counts(_contest_id UUID)
RETURNS TABLE(contestant_id UUID, vote_count BIGINT)
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT v.contestant_id, count(*)::BIGINT AS vote_count
  FROM public.votes v
  WHERE v.contest_id = _contest_id
    AND v.verified_at IS NOT NULL
    AND public.can_read_contest_results(_contest_id)
  GROUP BY v.contestant_id
$$;

GRANT EXECUTE ON FUNCTION public.get_contest_vote_counts(UUID) TO anon, authenticated;

CREATE POLICY "contest_org_members_select"
  ON public.contests FOR SELECT
  TO authenticated
  USING (public.is_org_member(org_id));

CREATE POLICY "contest_org_members_insert"
  ON public.contests FOR INSERT
  TO authenticated
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY "contest_org_members_update"
  ON public.contests FOR UPDATE
  TO authenticated
  USING (public.is_org_member(org_id))
  WITH CHECK (public.is_org_member(org_id));

CREATE POLICY "contest_owner_admin_delete"
  ON public.contests FOR DELETE
  TO authenticated
  USING (public.org_role(org_id) IN ('owner', 'admin'));

CREATE POLICY "contest_public_select"
  ON public.contests FOR SELECT
  TO anon, authenticated
  USING (status IN ('active', 'closed', 'winner_announced'));

CREATE POLICY "contestants_org_members_manage"
  ON public.contestants FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contests c
      WHERE c.id = contest_id AND public.is_org_member(c.org_id)
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.contests c
      WHERE c.id = contest_id AND public.is_org_member(c.org_id)
    )
  );

CREATE POLICY "contestants_public_select"
  ON public.contestants FOR SELECT
  TO anon, authenticated
  USING (public.is_public_contest(contest_id));

CREATE POLICY "votes_org_members_select"
  ON public.votes FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.contests c
      WHERE c.id = contest_id AND public.is_org_member(c.org_id)
    )
  );

CREATE POLICY "votes_service_role_all"
  ON public.votes FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

CREATE POLICY "vote_verifications_service_role_all"
  ON public.vote_verifications FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

INSERT INTO storage.buckets (id, name, public)
VALUES ('contest-photos', 'contest-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

CREATE POLICY "contest_photos_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'contest-photos');

CREATE POLICY "contest_photos_authenticated_upload"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'contest-photos');

CREATE POLICY "contest_photos_authenticated_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'contest-photos');
