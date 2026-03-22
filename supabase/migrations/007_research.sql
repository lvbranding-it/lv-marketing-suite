-- Research / verification fields on contacts
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'unverified'
    CHECK (verification_status IN ('unverified', 'verified', 'invalid')),
  ADD COLUMN IF NOT EXISTS research_notes TEXT,
  ADD COLUMN IF NOT EXISTS research_result TEXT,
  ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ;

-- Manually-created contacts start as verified
UPDATE public.contacts
  SET verification_status = 'verified'
  WHERE source = 'manual' AND verification_status = 'unverified';
