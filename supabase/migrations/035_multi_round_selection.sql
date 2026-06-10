-- ─────────────────────────────────────────────────────────────────────────────
-- 035_multi_round_selection.sql
-- Allows a photo session to require multiple rounds of client selection
-- (e.g. retainer clients who narrow down their picks over several passes).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.photo_sessions
  ADD COLUMN multi_round_enabled BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN max_rounds INT NOT NULL DEFAULT 1 CHECK (max_rounds >= 1 AND max_rounds <= 10),
  ADD COLUMN current_round INT NOT NULL DEFAULT 1 CHECK (current_round >= 1);

ALTER TABLE public.session_photos
  ADD COLUMN selection_round INT NOT NULL DEFAULT 1 CHECK (selection_round >= 1);

CREATE INDEX idx_session_photos_round ON public.session_photos(session_id, selection_round);
