-- ── File Shares ────────────────────────────────────────────────────────────────
-- Agency uploads a file and gets a shareable download link for clients.

create table if not exists public.file_shares (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  label          text not null,
  file_name      text not null,
  file_size      bigint not null default 0,
  mime_type      text not null default 'application/octet-stream',
  file_path      text not null,
  token          text not null unique default replace(gen_random_uuid()::text, '-', ''),
  expires_at     timestamptz,
  download_count integer not null default 0,
  created_at     timestamptz not null default now()
);

alter table public.file_shares enable row level security;

-- Agency members can see / create / delete their org's shares
create policy "file_shares_select" on public.file_shares
  for select using (
    org_id in (
      select org_id from public.team_members where user_id = auth.uid()
    )
  );

create policy "file_shares_insert" on public.file_shares
  for insert with check (
    org_id in (
      select org_id from public.team_members where user_id = auth.uid()
    )
  );

create policy "file_shares_delete" on public.file_shares
  for delete using (
    org_id in (
      select org_id from public.team_members where user_id = auth.uid()
    )
  );

-- Public read by token (used by the edge function via service role, not anon)
-- The edge function uses the service-role key, so no additional anon policy is needed.

-- Storage bucket for shared files (private — only accessible via signed URLs)
insert into storage.buckets (id, name, public)
values ('file-shares', 'file-shares', false)
on conflict (id) do nothing;

-- Agency members can upload to their own org folder
create policy "file_shares_storage_insert" on storage.objects
  for insert with check (
    bucket_id = 'file-shares'
    and (storage.foldername(name))[1] in (
      select org_id::text from public.org_members where user_id = auth.uid()
    )
  );

-- Agency members can read their own org folder
create policy "file_shares_storage_select" on storage.objects
  for select using (
    bucket_id = 'file-shares'
    and (storage.foldername(name))[1] in (
      select org_id::text from public.org_members where user_id = auth.uid()
    )
  );

-- Agency members can delete their own org folder
create policy "file_shares_storage_delete" on storage.objects
  for delete using (
    bucket_id = 'file-shares'
    and (storage.foldername(name))[1] in (
      select org_id::text from public.org_members where user_id = auth.uid()
    )
  );
