-- Migration 018: unique constraint on contacts(org_id, email)
-- Required for upsert on conflict to work in CSV import
ALTER TABLE public.contacts ADD CONSTRAINT contacts_org_id_email_key UNIQUE (org_id, email);
