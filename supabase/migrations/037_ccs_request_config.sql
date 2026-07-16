-- CCS: per-request configuration captured by the request builder.
-- Holds collaboration-term toggles, IP-term toggles, and LV participant contacts
-- as structured JSON so the exact configuration presented to the client can be
-- frozen into the acknowledgment snapshot at signing time.
ALTER TABLE public.ccs_requests
  ADD COLUMN IF NOT EXISTS config_json jsonb NOT NULL DEFAULT '{}'::jsonb;
