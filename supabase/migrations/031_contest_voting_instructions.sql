-- Custom public voting-page instructions.

ALTER TABLE public.contests
  ADD COLUMN IF NOT EXISTS voting_instructions TEXT;
