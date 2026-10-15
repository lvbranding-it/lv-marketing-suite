-- LegalSigns: NDAs and releases sent for signature, signed by the client, then
-- countersigned by LV Branding.
--
-- Every write goes through the legal-signs and legal-sign Edge Functions,
-- which check who may act and keep the audit trail; the browser can only read.
-- A document's content is stored as it was sent (content) with its SHA-256
-- (content_hash), so what was signed can be proven and never changes. The link
-- token is stored only as its hash.

create table public.legal_documents (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations(id) on delete cascade,
  created_by            uuid references auth.users(id) on delete set null,
  template_key          text not null,
  template_version      text not null,
  language              text not null check (language in ('en', 'es')),
  title                 text not null,
  contact_id            uuid references public.contacts(id) on delete set null,
  company_name          text not null default '',
  recipient_name        text not null,
  recipient_email       text not null,
  field_values          jsonb not null default '{}'::jsonb,
  content               jsonb not null,
  content_hash          text not null,
  status                text not null default 'sent'
                        check (status in ('sent', 'viewed', 'client_signed', 'completed', 'voided')),
  token_hash            text not null unique,
  expires_at            timestamptz not null,
  sent_at               timestamptz not null default now(),
  viewed_at             timestamptz,
  client_signed_at      timestamptz,
  client_signer_name    text,
  client_signer_title   text,
  client_signature      jsonb,
  client_ip             text,
  client_user_agent     text,
  lv_signed_at          timestamptz,
  lv_signer_user_id     uuid references auth.users(id) on delete set null,
  lv_signer_name        text,
  lv_signer_title       text,
  lv_signature          jsonb,
  signed_pdf_path       text,
  completed_at          timestamptz,
  voided_at             timestamptz,
  void_reason           text,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index legal_documents_org_idx on public.legal_documents(org_id, created_at desc);
create index legal_documents_contact_idx on public.legal_documents(contact_id);

create trigger legal_documents_updated_at
  before update on public.legal_documents
  for each row execute function public.update_updated_at_column();

-- The audit trail: one row per step, with where it came from.
create table public.legal_document_events (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.legal_documents(id) on delete cascade,
  org_id        uuid not null references public.organizations(id) on delete cascade,
  event         text not null,
  actor_user_id uuid references auth.users(id) on delete set null,
  actor_label   text,
  ip            text,
  user_agent    text,
  metadata      jsonb not null default '{}'::jsonb,
  created_at    timestamptz not null default now()
);

create index legal_document_events_document_idx on public.legal_document_events(document_id, created_at);

alter table public.legal_documents enable row level security;
alter table public.legal_document_events enable row level security;

create policy legal_documents_member_read on public.legal_documents
  for select to authenticated using (public.is_org_member(org_id));
create policy legal_document_events_member_read on public.legal_document_events
  for select to authenticated using (public.is_org_member(org_id));

-- The signed PDFs. Private; members of the organization can read their own.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('legal-documents', 'legal-documents', false, 20971520, array['application/pdf'])
on conflict (id) do nothing;

create policy "members read their legal documents"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'legal-documents'
    and (storage.foldername(name))[1] in (select org_id::text from public.team_members where user_id = auth.uid())
  );
