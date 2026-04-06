-- ─────────────────────────────────────────────────────────────────────────────
-- 013_photo_session_improvements.sql
-- Feature additions:
--   1. cc_emails   — up to 3 CC recipients per session (TEXT[])
--   2. finalized_at — timestamp when client submits their final selection
--   3. wave_invoice_id / wave_invoice_url — Wave invoice reference for extras
-- ─────────────────────────────────────────────────────────────────────────────

-- 1. CC email recipients (stored as an array, up to 3 CC addresses)
ALTER TABLE public.photo_sessions
  ADD COLUMN cc_emails TEXT[] NOT NULL DEFAULT '{}';

-- 2. Client finalisation tracking
ALTER TABLE public.photo_sessions
  ADD COLUMN finalized_at TIMESTAMPTZ,
  ADD COLUMN wave_invoice_id TEXT,
  ADD COLUMN wave_invoice_url TEXT;
