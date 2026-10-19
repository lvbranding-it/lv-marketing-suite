-- LegalSigns: edit a sent document's parties and details before anyone signs.
--
-- Each signer keeps their party's lines from the form (legal name, entity,
-- address, notice email) so the document can be edited and re-created later;
-- the main recipient's are in legal_documents.field_values as before.
--
-- legal_edit_document replaces the document's text, details and signers in one
-- locked step: the signers are written again, each with a new link, and it all
-- undoes itself if a signature arrived first. legal_revise_document (text
-- only, the existing signers) stays for the functions deployed before this.

alter table public.legal_document_signers
  add column if not exists party_values jsonb not null default '{}'::jsonb;

-- p_signers: [{position, name, email, company_name, contact_id, party_values, token_hash}]
create or replace function public.legal_edit_document(
  p_document_id uuid,
  p_title text,
  p_content jsonb,
  p_content_hash text,
  p_expires_at timestamptz,
  p_field_values jsonb,
  p_signers jsonb
) returns boolean
language plpgsql security definer set search_path = public
as $$
declare
  v_doc public.legal_documents;
  v_first jsonb;
begin
  if jsonb_typeof(p_signers) <> 'array' or jsonb_array_length(p_signers) not between 1 and 4 then
    raise exception 'legal_edit_signers';
  end if;

  select * into v_doc from public.legal_documents where id = p_document_id for update;
  if not found or v_doc.status not in ('sent', 'viewed') or v_doc.client_signed_at is not null or v_doc.lv_signed_at is not null then
    return false;
  end if;
  if exists (select 1 from public.legal_document_signers where document_id = p_document_id and signed_at is not null) then
    return false;
  end if;

  -- Only unsigned signers go; one who signed while this waited stays, and
  -- then the check below undoes everything.
  delete from public.legal_document_signers where document_id = p_document_id and signed_at is null;
  if exists (select 1 from public.legal_document_signers where document_id = p_document_id) then
    raise exception 'legal_revise_conflict';
  end if;

  insert into public.legal_document_signers (
    document_id, org_id, position, contact_id, name, email, company_name, party_values, token_hash
  )
  select p_document_id, v_doc.org_id, (signer ->> 'position')::smallint, nullif(signer ->> 'contact_id', '')::uuid,
         signer ->> 'name', lower(signer ->> 'email'), coalesce(signer ->> 'company_name', ''),
         coalesce(signer -> 'party_values', '{}'::jsonb), signer ->> 'token_hash'
    from jsonb_array_elements(p_signers) as signer;

  if exists (select 1 from public.legal_document_signers where document_id = p_document_id and (token_hash is null or name = '' or email = '')) then
    raise exception 'legal_edit_signers';
  end if;

  select signer into v_first from jsonb_array_elements(p_signers) as signer order by (signer ->> 'position')::int limit 1;
  update public.legal_documents
     set title = p_title, content = p_content, content_hash = p_content_hash,
         field_values = coalesce(p_field_values, field_values),
         recipient_name = v_first ->> 'name', recipient_email = lower(v_first ->> 'email'),
         company_name = coalesce(v_first ->> 'company_name', ''), contact_id = nullif(v_first ->> 'contact_id', '')::uuid,
         status = 'sent', sent_at = now(), viewed_at = null, expires_at = p_expires_at
   where id = p_document_id;
  return true;
end;
$$;

revoke all on function public.legal_edit_document(uuid, text, jsonb, text, timestamptz, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.legal_edit_document(uuid, text, jsonb, text, timestamptz, jsonb, jsonb) to service_role;
