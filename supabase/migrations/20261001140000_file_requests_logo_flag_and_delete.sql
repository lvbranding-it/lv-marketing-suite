-- File Drop: logo requests, and deleting a link with its files.
--
-- Apply this before the site that uses it goes live. The current site keeps
-- working after it: it ignores the new column and never deletes files.

-- ── Logo requests ───────────────────────────────────────────────────────────
-- The upload page showed every client the "send your logo as .AI, .EPS, .PDF"
-- guidelines, including on links asking for videos or photos. Only requests
-- marked as logo requests show them now.
alter table public.file_requests
  add column if not exists is_logo_request boolean not null default false;

-- Existing links asking for logos say so in their title.
update public.file_requests
set is_logo_request = true
where title ilike '%logo%';

-- The public page reads the flag through its lookup. Its columns change, so the
-- function is replaced rather than altered.
drop function if exists public.get_file_request_by_token(text);

create function public.get_file_request_by_token(p_token text)
returns table (
  title text,
  description text,
  status text,
  expires_at timestamptz,
  is_logo_request boolean
)
language sql
stable
security definer
set search_path = ''
as $$
  select fr.title, fr.description, fr.status, fr.expires_at, fr.is_logo_request
  from public.file_requests fr
  where fr.token = p_token
$$;

revoke all on function public.get_file_request_by_token(text) from public;
grant execute on function public.get_file_request_by_token(text) to anon, authenticated;

-- ── Deleting a link and its files ───────────────────────────────────────────
-- Files clients send are stored under {org_id}/{request_id}/. The team could
-- read them but not delete them, so a closed link's files stayed in storage
-- for good. Team members can now delete files in their own org's folder;
-- deleting the request row removes its submission records by cascade.
drop policy if exists "org members can delete client uploads" on storage.objects;
create policy "org members can delete client uploads" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'client-uploads'
    and (storage.foldername(name))[1] in (
      select org_id::text from public.team_members where user_id = auth.uid()
    )
  );
