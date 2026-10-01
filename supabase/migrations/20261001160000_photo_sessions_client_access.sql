-- Photo sessions, part 1 of 2: the client page reaches its own session through
-- functions that check the share link, and the team can upload deliverables.
--
-- Additive: apply it any time; the current site keeps working with it. Part 2
-- (20261001160100) removes the old open table rules, and goes in only once the
-- site that uses these functions is live.
--
-- The client page used to read photo_sessions, session_photos and
-- photo_comments directly, under rules that let anyone holding the public key
-- list every session (share link and client email included), every photo, and
-- every comment, change any photo's selection, and post on any session. Each
-- function below answers for one share link and nothing else.

-- ── What the client page shows ──────────────────────────────────────────────

create or replace function public.get_photo_session_by_token(p_token uuid)
returns table (
  id uuid,
  name text,
  client_name text,
  status text,
  photo_limit int,
  extra_photo_price numeric,
  allow_zip_download boolean,
  multi_round_enabled boolean,
  max_rounds int,
  current_round int,
  finalized_at timestamptz,
  wave_invoice_url text,
  deliverables_ready_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select s.id, s.name, s.client_name, s.status::text,
         s.photo_limit, s.extra_photo_price, s.allow_zip_download,
         s.multi_round_enabled, s.max_rounds, s.current_round,
         s.finalized_at, s.wave_invoice_url, s.deliverables_ready_at
  from public.photo_sessions s
  where s.share_token = p_token
$$;

-- The photos, in their running order. No storage paths: the page gets its
-- image links from get-photo-urls, which checks the share link itself.
create or replace function public.get_session_photos_by_token(p_token uuid)
returns table (
  id uuid,
  session_id uuid,
  file_name text,
  status text,
  selection_round int,
  display_order int,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.session_id, p.file_name, p.status::text,
         p.selection_round, p.display_order, p.created_at
  from public.session_photos p
  join public.photo_sessions s on s.id = p.session_id
  where s.share_token = p_token
  order by p.display_order, p.created_at, p.file_name
$$;

create or replace function public.get_session_comments_by_token(p_token uuid)
returns table (id uuid, photo_id uuid, body text, author_label text, created_at timestamptz)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.photo_id, c.body, c.author_label, c.created_at
  from public.photo_comments c
  join public.photo_sessions s on s.id = c.session_id
  where s.share_token = p_token
  order by c.created_at
$$;

-- ── What the client can change ──────────────────────────────────────────────

-- Select or unselect one photo. Only while the selection is open, only in the
-- current round, and only between selected and not selected: a photo the team
-- has moved on to editing is not the client's to change.
create or replace function public.set_client_photo_selection(p_token uuid, p_photo_id uuid, p_selected boolean)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
begin
  update public.session_photos p
     set status = (case when p_selected then 'selected' else 'not_selected' end)::public.photo_status,
         updated_at = now()
    from public.photo_sessions s
   where p.id = p_photo_id
     and s.id = p.session_id
     and s.share_token = p_token
     and s.finalized_at is null
     and p.selection_round = s.current_round
     and p.status in ('not_selected', 'selected')
  returning p.status::text into v_status;

  if v_status is null then
    raise exception 'This photo can no longer be changed.' using errcode = 'P0001';
  end if;
  return v_status;
end;
$$;

-- Post a comment as the client. The name on it is the session's client name,
-- set here rather than taken from the request, so nobody can post as someone else.
create or replace function public.add_client_photo_comment(p_token uuid, p_photo_id uuid, p_body text)
returns table (id uuid, photo_id uuid, body text, author_label text, created_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  v_session_id uuid;
  v_org_id uuid;
  v_client_name text;
  v_body text := btrim(coalesce(p_body, ''));
begin
  if v_body = '' or char_length(v_body) > 2000 then
    raise exception 'A comment needs between 1 and 2,000 characters.' using errcode = '22023';
  end if;

  select s.id, s.org_id, s.client_name
    into v_session_id, v_org_id, v_client_name
    from public.photo_sessions s
    join public.session_photos p on p.session_id = s.id
   where s.share_token = p_token
     and p.id = p_photo_id;

  if v_session_id is null then
    raise exception 'Photo not found.' using errcode = 'P0002';
  end if;

  return query
    insert into public.photo_comments (photo_id, session_id, org_id, body, author_label, author_user_id)
    values (p_photo_id, v_session_id, v_org_id, v_body, v_client_name, null)
    returning photo_comments.id, photo_comments.photo_id, photo_comments.body,
              photo_comments.author_label, photo_comments.created_at;
end;
$$;

revoke all on function public.get_photo_session_by_token(uuid) from public;
revoke all on function public.get_session_photos_by_token(uuid) from public;
revoke all on function public.get_session_comments_by_token(uuid) from public;
revoke all on function public.set_client_photo_selection(uuid, uuid, boolean) from public;
revoke all on function public.add_client_photo_comment(uuid, uuid, text) from public;
grant execute on function public.get_photo_session_by_token(uuid) to anon, authenticated;
grant execute on function public.get_session_photos_by_token(uuid) to anon, authenticated;
grant execute on function public.get_session_comments_by_token(uuid) to anon, authenticated;
grant execute on function public.set_client_photo_selection(uuid, uuid, boolean) to anon, authenticated;
grant execute on function public.add_client_photo_comment(uuid, uuid, text) to anon, authenticated;

-- ── Deliverables the team can actually upload ───────────────────────────────

-- The rules from 014 checked a public.org_members table that no migration
-- creates, so storage refused every deliverable upload and preview. These use
-- team_members, as the session-photos bucket does.
drop policy if exists "org members can upload deliverables" on storage.objects;
drop policy if exists "org members can read deliverables" on storage.objects;
drop policy if exists "org members can delete deliverables" on storage.objects;

create policy "team can upload session deliverables"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'session-deliverables'
    and (storage.foldername(name))[1] in (
      select org_id::text from public.team_members where user_id = auth.uid()
    )
  );

create policy "team can read session deliverables"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'session-deliverables'
    and (storage.foldername(name))[1] in (
      select org_id::text from public.team_members where user_id = auth.uid()
    )
  );

create policy "team can delete session deliverables"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'session-deliverables'
    and (storage.foldername(name))[1] in (
      select org_id::text from public.team_members where user_id = auth.uid()
    )
  );
