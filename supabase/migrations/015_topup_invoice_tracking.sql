-- ─────────────────────────────────────────────────────────────────────────────
-- 015_topup_invoice_tracking.sql
-- Adds sent / paid timestamps for the extras (top-up) Wave invoice
-- so the admin panel can track whether the top-up invoice was emailed
-- and whether payment was received.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.photo_sessions
  ADD COLUMN topup_invoice_sent_at TIMESTAMPTZ,
  ADD COLUMN topup_invoice_paid_at TIMESTAMPTZ;
