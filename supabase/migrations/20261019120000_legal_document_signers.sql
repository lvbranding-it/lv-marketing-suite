-- LegalSigns: more than one party signs a document (an NDA can have up to four
-- besides LV Branding). Each is a signer with their own link, email and
-- signature; they sign at the same time, and LV Branding countersigns once
-- every signer has signed.
--
-- Documents sent before this kept their one recipient on legal_documents.
-- They are copied here as signer 1, link included, so a link already in
-- someone's inbox keeps working. legal_documents.token_hash is no longer
-- written; the links live with the signers.

create table public.legal_document_signers (
  id            uuid primary key default gen_random_uuid(),
  document_id   uuid not null references public.legal_documents(id) on delete cascade,
  org_id        uuid not null references public.organizations(id) on delete cascade,
  position      smallint not null check (position between 1 and 4),
  contact_id    uuid references public.contacts(id) on delete set null,
  name          text not null,
  email         text not null,
  company_name  text not null default '',
  token_hash    text unique,
  sent_at       timestamptz not null default now(),
  viewed_at     timestamptz,
  signed_at     timestamptz,
  signer_name   text,
  signer_title  text,
  signature     jsonb,
  ip            text,
  user_agent    text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (document_id, position)
);

create index legal_document_signers_document_idx on public.legal_document_signers(document_id, position);

create trigger legal_document_signers_updated_at
  before update on public.legal_document_signers
  for each row execute function public.update_updated_at_column();

alter table public.legal_document_signers enable row level security;

create policy legal_document_signers_member_read on public.legal_document_signers
  for select to authenticated using (public.is_org_member(org_id));

alter table public.legal_documents alter column token_hash drop not null;

insert into public.legal_document_signers (
  document_id, org_id, position, contact_id, name, email, company_name, token_hash, sent_at,
  viewed_at, signed_at, signer_name, signer_title, signature, ip, user_agent, created_at
)
select
  d.id, d.org_id, 1, d.contact_id, d.recipient_name, d.recipient_email, d.company_name, d.token_hash, d.sent_at,
  d.viewed_at, d.client_signed_at, d.client_signer_name, d.client_signer_title, d.client_signature,
  d.client_ip, d.client_user_agent, d.created_at
from public.legal_documents d
where not exists (select 1 from public.legal_document_signers s where s.document_id = d.id);

-- Revising a document changes what everyone signs, so it must never land after
-- someone has signed. This locks the document, changes its text and every
-- signer's link together, and undoes all of it if a signature arrived first.
-- The links' hashes come from the legal-signs function: {signer_id: hash}.
create or replace function public.legal_revise_document(
  p_document_id uuid,
  p_title text,
  p_content jsonb,
  p_content_hash text,
  p_expires_at timestamptz,
  p_token_hashes jsonb
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_doc public.legal_documents;
begin
  select * into v_doc from public.legal_documents where id = p_document_id for update;
  if not found or v_doc.status not in ('sent', 'viewed') or v_doc.client_signed_at is not null or v_doc.lv_signed_at is not null then
    return false;
  end if;
  if exists (select 1 from public.legal_document_signers where document_id = p_document_id and signed_at is not null) then
    return false;
  end if;

  update public.legal_documents
     set title = p_title, content = p_content, content_hash = p_content_hash, status = 'sent',
         sent_at = now(), viewed_at = null, expires_at = p_expires_at
   where id = p_document_id;

  update public.legal_document_signers s
     set token_hash = p_token_hashes ->> s.id::text, sent_at = now(), viewed_at = null
   where s.document_id = p_document_id and s.signed_at is null;

  -- A signature that committed while this ran: keep it, drop the revision.
  if exists (select 1 from public.legal_document_signers where document_id = p_document_id and signed_at is not null)
     or exists (select 1 from public.legal_document_signers where document_id = p_document_id and token_hash is null) then
    raise exception 'legal_revise_conflict';
  end if;
  return true;
end;
$$;

revoke all on function public.legal_revise_document(uuid, text, jsonb, text, timestamptz, jsonb) from public, anon, authenticated;
grant execute on function public.legal_revise_document(uuid, text, jsonb, text, timestamptz, jsonb) to service_role;
