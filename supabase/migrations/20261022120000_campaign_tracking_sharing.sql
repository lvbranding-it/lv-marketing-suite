-- Sharing is opt-in; existing and future campaigns stay private until enabled.
ALTER TABLE public.email_campaigns ADD COLUMN IF NOT EXISTS share_token uuid;
CREATE UNIQUE INDEX IF NOT EXISTS email_campaigns_share_token_key ON public.email_campaigns(share_token) WHERE share_token IS NOT NULL;

ALTER TABLE public.email_campaign_recipients ADD COLUMN IF NOT EXISTS bounced_at timestamptz;
UPDATE public.email_campaign_recipients SET bounced_at=coalesce(sent_at,created_at) WHERE status='bounced' AND bounced_at IS NULL;

-- Lock the recipient and update its unique counters in the same transaction.
-- Retries and simultaneous webhook deliveries cannot double count an open/click.
CREATE OR REPLACE FUNCTION public.record_campaign_event(
  p_recipient_id uuid, p_campaign_id uuid, p_event text, p_at timestamptz,
  p_failure_status text DEFAULT NULL, p_reason text DEFAULT NULL, p_suppress text DEFAULT NULL
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r public.email_campaign_recipients%ROWTYPE;
  opens integer := 0; clicks integer := 0; bounces integer := 0; unsubs integer := 0;
  next_status text;
BEGIN
  SELECT * INTO r FROM public.email_campaign_recipients
    WHERE id=p_recipient_id AND campaign_id=p_campaign_id FOR UPDATE;
  IF NOT FOUND THEN RETURN false; END IF;
  next_status := r.status;
  IF p_event='open' THEN
    IF r.opened_at IS NOT NULL THEN RETURN false; END IF;
    opens := 1;
    IF r.status IN ('pending','sent') THEN next_status := 'opened'; END IF;
    UPDATE public.email_campaign_recipients SET opened_at=p_at, status=next_status WHERE id=r.id;
  ELSIF p_event='click' THEN
    IF r.clicked_at IS NOT NULL THEN RETURN false; END IF;
    clicks := 1;
    IF r.status IN ('pending','sent','opened') THEN next_status := 'clicked'; END IF;
    UPDATE public.email_campaign_recipients SET clicked_at=p_at, status=next_status WHERE id=r.id;
  ELSIF p_event IN ('bounce','blocked','dropped') THEN
    IF p_failure_status NOT IN ('failed','bounced') OR p_failure_status IS NULL THEN
      RAISE EXCEPTION 'Invalid failure status';
    END IF;
    IF r.bounced_at IS NOT NULL THEN RETURN false; END IF;
    bounces := CASE WHEN p_failure_status='bounced' THEN 1 ELSE 0 END;
    UPDATE public.email_campaign_recipients SET status=CASE WHEN r.unsubscribed_at IS NOT NULL THEN 'unsubscribed' ELSE p_failure_status END,
      bounced_at=CASE WHEN p_failure_status='bounced' THEN p_at ELSE bounced_at END,
      error_message=left(p_reason,500) WHERE id=r.id;
  ELSIF p_event IN ('unsubscribe','group_unsubscribe') THEN
    unsubs := CASE WHEN r.unsubscribed_at IS NULL THEN 1 ELSE 0 END;
    UPDATE public.email_campaign_recipients SET unsubscribed_at=coalesce(unsubscribed_at,p_at), status='unsubscribed' WHERE id=r.id;
    p_suppress := 'unsubscribed';
  ELSIF p_event='spamreport' THEN
    p_suppress := 'spam';
  ELSE
    RETURN false;
  END IF;
  IF p_suppress IS NOT NULL THEN
    INSERT INTO public.email_suppressions(org_id,email,reason,campaign_id)
    VALUES(r.org_id,lower(r.email),p_suppress,r.campaign_id)
    ON CONFLICT(org_id,email) DO UPDATE SET reason=CASE
      WHEN email_suppressions.reason IN ('unsubscribed','spam') THEN email_suppressions.reason
      ELSE excluded.reason END;
  END IF;
  UPDATE public.email_campaigns SET open_count=open_count+opens, click_count=click_count+clicks,
    bounce_count=bounce_count+bounces, unsubscribe_count=unsubscribe_count+unsubs WHERE id=r.campaign_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.record_campaign_event(uuid,uuid,text,timestamptz,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_campaign_event(uuid,uuid,text,timestamptz,text,text,text) TO service_role;
