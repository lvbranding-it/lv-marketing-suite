-- ── Email Campaigns ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_campaigns (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id              uuid        NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  created_by          uuid        REFERENCES auth.users(id),
  name                text        NOT NULL,
  subject             text        NOT NULL DEFAULT '',
  preview_text        text        DEFAULT '',
  body_html           text        NOT NULL DEFAULT '',
  from_name           text        NOT NULL DEFAULT 'LV Branding',
  from_email          text        NOT NULL DEFAULT 'admin@lvbranding.com',
  status              text        NOT NULL DEFAULT 'draft'
                                  CHECK (status IN ('draft','sending','sent','failed')),
  recipient_count     integer     NOT NULL DEFAULT 0,
  sent_count          integer     NOT NULL DEFAULT 0,
  open_count          integer     NOT NULL DEFAULT 0,
  click_count         integer     NOT NULL DEFAULT 0,
  bounce_count        integer     NOT NULL DEFAULT 0,
  unsubscribe_count   integer     NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now(),
  sent_at             timestamptz
);

-- ── Campaign Recipients ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_campaign_recipients (
  id                  uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id         uuid        NOT NULL REFERENCES public.email_campaigns(id) ON DELETE CASCADE,
  org_id              uuid        NOT NULL,
  contact_id          uuid        REFERENCES public.contacts(id) ON DELETE SET NULL,
  email               text        NOT NULL,
  first_name          text,
  last_name           text,
  company             text,
  title               text,
  status              text        NOT NULL DEFAULT 'pending'
                                  CHECK (status IN ('pending','sent','failed','bounced','unsubscribed','opened','clicked')),
  sendgrid_message_id text,
  sent_at             timestamptz,
  opened_at           timestamptz,
  clicked_at          timestamptz,
  unsubscribed_at     timestamptz,
  error_message       text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

-- ── Suppression List ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.email_suppressions (
  id          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id      uuid        NOT NULL,
  email       text        NOT NULL,
  reason      text        NOT NULL DEFAULT 'unsubscribed'
                          CHECK (reason IN ('unsubscribed','bounced','spam','invalid')),
  campaign_id uuid        REFERENCES public.email_campaigns(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(org_id, email)
);

-- ── RLS ───────────────────────────────────────────────────────────────────────
ALTER TABLE public.email_campaigns           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_suppressions        ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_members_campaigns"
  ON public.email_campaigns FOR ALL
  USING (is_org_member(org_id));

CREATE POLICY "org_members_recipients"
  ON public.email_campaign_recipients FOR ALL
  USING (is_org_member(org_id));

CREATE POLICY "org_members_suppressions"
  ON public.email_suppressions FOR ALL
  USING (is_org_member(org_id));

-- Service role bypass (edge functions use service role key)
CREATE POLICY "service_role_campaigns"
  ON public.email_campaigns FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "service_role_recipients"
  ON public.email_campaign_recipients FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "service_role_suppressions"
  ON public.email_suppressions FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── Indexes ───────────────────────────────────────────────────────────────────
CREATE INDEX ON public.email_campaigns(org_id, created_at DESC);
CREATE INDEX ON public.email_campaign_recipients(campaign_id, status);
CREATE INDEX ON public.email_campaign_recipients(org_id);
CREATE INDEX ON public.email_suppressions(org_id, email);

-- ── Helper: atomic stat increment (used by edge functions) ───────────────────
CREATE OR REPLACE FUNCTION public.increment_campaign_stat(p_campaign_id uuid, p_field text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  EXECUTE format(
    'UPDATE public.email_campaigns SET %I = %I + 1 WHERE id = $1',
    p_field, p_field
  ) USING p_campaign_id;
END;
$$;

-- ── updated_at trigger ────────────────────────────────────────────────────────
CREATE TRIGGER set_email_campaigns_updated_at
  BEFORE UPDATE ON public.email_campaigns
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
