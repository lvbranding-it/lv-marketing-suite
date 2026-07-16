-- CCS: link a collaboration client back to its CRM contact (first point of contact).
-- Nullable so manually-created CCS clients remain valid; SET NULL if the contact is removed.
ALTER TABLE public.ccs_clients
  ADD COLUMN IF NOT EXISTS contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS ccs_clients_contact_idx ON public.ccs_clients(contact_id);
