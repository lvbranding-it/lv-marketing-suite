-- LV Social Publisher: multi-tenant editorial workflow and durable publishing queue.
-- Provider credentials live in private tables with no browser grants. The web
-- app receives only redacted connection health through a SECURITY DEFINER RPC.

create table public.social_publisher_settings (
  org_id             uuid primary key references public.organizations(id) on delete cascade,
  timezone           text not null default 'America/Chicago',
  approval_required  boolean not null default false,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

create table public.social_connections (
  id                     uuid primary key default gen_random_uuid(),
  org_id                 uuid not null references public.organizations(id) on delete cascade,
  provider               text not null default 'meta' check (provider = 'meta'),
  authorized_by_user_id  uuid references auth.users(id) on delete set null,
  encrypted_access_token text not null,
  token_expires_at       timestamptz,
  granted_scopes         text[] not null default '{}',
  status                 text not null default 'active'
                           check (status in ('active','action_required','disconnected')),
  last_verified_at       timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now(),
  unique (org_id, provider)
);

create table public.social_oauth_states (
  state_hash  text primary key,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  expires_at  timestamptz not null,
  created_at  timestamptz not null default now()
);

create table public.social_accounts (
  id                             uuid primary key default gen_random_uuid(),
  org_id                         uuid not null references public.organizations(id) on delete cascade,
  connection_id                  uuid not null references public.social_connections(id) on delete cascade,
  platform                       text not null check (platform in ('facebook','instagram')),
  provider_account_id            text not null,
  page_id                        text,
  instagram_business_account_id  text,
  display_name                   text not null,
  username                       text,
  profile_image_url              text,
  capabilities                   jsonb not null default '{}'::jsonb,
  is_selected                    boolean not null default true,
  status                         text not null default 'active'
                                   check (status in ('active','inactive','action_required')),
  last_synced_at                 timestamptz,
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now(),
  unique (org_id, platform, provider_account_id)
);

-- Page access tokens are intentionally split from social_accounts so a SELECT
-- on account metadata can never expose a publish credential.
create table public.social_account_credentials (
  social_account_id      uuid primary key references public.social_accounts(id) on delete cascade,
  encrypted_access_token text not null,
  updated_at             timestamptz not null default now()
);

create table public.social_campaigns (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  name                text not null check (char_length(btrim(name)) between 1 and 160),
  objective           text,
  internal_brief      text,
  start_at            timestamptz,
  end_at              timestamptz,
  status              text not null default 'active' check (status in ('draft','active','completed','archived')),
  created_by_user_id  uuid references auth.users(id) on delete set null default auth.uid(),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  check (end_at is null or start_at is null or end_at >= start_at)
);

create table public.social_posts (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations(id) on delete cascade,
  campaign_id           uuid references public.social_campaigns(id) on delete set null,
  title                 text not null check (char_length(btrim(title)) between 1 and 200),
  internal_notes        text,
  workflow_status       text not null default 'draft' check (workflow_status in (
                          'draft','in_review','changes_requested','approved','scheduled',
                          'publishing','published','partially_published','failed','canceled','connection_required'
                        )),
  scheduled_timezone    text not null default 'America/Chicago',
  created_by_user_id    uuid references auth.users(id) on delete set null default auth.uid(),
  assigned_to_user_id   uuid references auth.users(id) on delete set null,
  submitted_at          timestamptz,
  approved_at           timestamptz,
  approved_by_user_id   uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table public.social_post_variants (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null references public.organizations(id) on delete cascade,
  social_post_id        uuid not null references public.social_posts(id) on delete cascade,
  social_account_id     uuid not null references public.social_accounts(id) on delete restrict,
  platform              text not null check (platform in ('facebook','instagram')),
  format                text not null default 'image' check (format in ('text','link','image','video','carousel','reel')),
  caption               text not null default '',
  first_comment         text,
  link_url              text,
  call_to_action        text,
  scheduled_for_utc     timestamptz,
  publication_status    text not null default 'draft' check (publication_status in (
                          'draft','scheduled','publishing','published','failed','canceled','connection_required'
                        )),
  provider_container_id text,
  provider_post_id      text,
  provider_permalink    text,
  published_at          timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  unique (social_post_id, social_account_id)
);

create table public.social_post_assets (
  id                  uuid primary key default gen_random_uuid(),
  org_id              uuid not null references public.organizations(id) on delete cascade,
  post_variant_id     uuid not null references public.social_post_variants(id) on delete cascade,
  storage_path        text,
  public_url          text not null check (public_url ~ '^https://'),
  position            integer not null default 0 check (position >= 0),
  media_type          text not null check (media_type in ('image','video')),
  mime_type           text,
  file_size_bytes     bigint check (file_size_bytes is null or file_size_bytes > 0),
  width               integer,
  height              integer,
  duration_seconds    numeric,
  alt_text            text,
  thumbnail_url       text,
  created_at          timestamptz not null default now(),
  unique (post_variant_id, position)
);

create table public.social_approvals (
  id                uuid primary key default gen_random_uuid(),
  org_id            uuid not null references public.organizations(id) on delete cascade,
  social_post_id    uuid not null references public.social_posts(id) on delete cascade,
  reviewer_user_id  uuid references auth.users(id) on delete set null default auth.uid(),
  decision          text not null check (decision in ('submitted','approved','changes_requested')),
  comment           text,
  created_at        timestamptz not null default now()
);

create table public.social_publish_jobs (
  id                       uuid primary key default gen_random_uuid(),
  org_id                   uuid not null references public.organizations(id) on delete cascade,
  post_variant_id          uuid not null references public.social_post_variants(id) on delete cascade,
  scheduled_for_utc        timestamptz not null,
  status                   text not null default 'queued' check (status in ('queued','processing','retrying','published','failed','canceled')),
  attempt_count            integer not null default 0 check (attempt_count >= 0),
  max_attempts             integer not null default 5 check (max_attempts between 1 and 10),
  idempotency_key          text not null unique,
  locked_at                timestamptz,
  locked_by                text,
  next_attempt_at          timestamptz,
  last_error_category      text,
  last_error_message_safe  text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now()
);

create table public.social_publish_attempts (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.organizations(id) on delete cascade,
  publish_job_id          uuid not null references public.social_publish_jobs(id) on delete cascade,
  attempt_number          integer not null,
  started_at              timestamptz not null default now(),
  completed_at            timestamptz,
  result                  text check (result in ('published','temporary_failure','permanent_failure','authentication_failure','ambiguous_failure')),
  provider_request_id     text,
  provider_response_code  integer,
  safe_diagnostics        jsonb not null default '{}'::jsonb,
  unique (publish_job_id, attempt_number)
);

create table public.social_activity_log (
  id             uuid primary key default gen_random_uuid(),
  org_id         uuid not null references public.organizations(id) on delete cascade,
  actor_user_id  uuid references auth.users(id) on delete set null,
  entity_type    text not null,
  entity_id      uuid not null,
  action         text not null,
  metadata       jsonb not null default '{}'::jsonb,
  created_at     timestamptz not null default now()
);

create index social_accounts_org_idx on public.social_accounts(org_id, status, platform);
create index social_posts_org_status_idx on public.social_posts(org_id, workflow_status, updated_at desc);
create index social_variants_post_idx on public.social_post_variants(social_post_id);
create index social_variants_calendar_idx on public.social_post_variants(org_id, scheduled_for_utc) where scheduled_for_utc is not null;
create index social_assets_variant_idx on public.social_post_assets(post_variant_id, position);
create index social_jobs_due_idx on public.social_publish_jobs(coalesce(next_attempt_at, scheduled_for_utc), status)
  where status in ('queued','retrying');
create index social_attempts_job_idx on public.social_publish_attempts(publish_job_id, attempt_number desc);
create index social_activity_entity_idx on public.social_activity_log(org_id, entity_type, entity_id, created_at desc);

create trigger social_settings_updated_at before update on public.social_publisher_settings
  for each row execute function public.update_updated_at_column();
create trigger social_connections_updated_at before update on public.social_connections
  for each row execute function public.update_updated_at_column();
create trigger social_accounts_updated_at before update on public.social_accounts
  for each row execute function public.update_updated_at_column();
create trigger social_campaigns_updated_at before update on public.social_campaigns
  for each row execute function public.update_updated_at_column();
create trigger social_posts_updated_at before update on public.social_posts
  for each row execute function public.update_updated_at_column();
create trigger social_variants_updated_at before update on public.social_post_variants
  for each row execute function public.update_updated_at_column();
create trigger social_jobs_updated_at before update on public.social_publish_jobs
  for each row execute function public.update_updated_at_column();

-- RLS controls who can touch each row. These triggers additionally prevent a
-- user who belongs to two organizations from joining rows across their tenant
-- boundary through otherwise-valid UUID foreign keys.
create or replace function public.social_assert_tenant_scope()
returns trigger language plpgsql security definer set search_path = public as $$
declare v_org uuid; v_platform text;
begin
  if tg_table_name = 'social_accounts' then
    select org_id into v_org from public.social_connections where id = (to_jsonb(new)->>'connection_id')::uuid;
    if v_org is distinct from new.org_id then raise exception using errcode = '23514', message = 'SOCIAL_TENANT_MISMATCH'; end if;
  elsif tg_table_name = 'social_posts' then
    if to_jsonb(new)->>'campaign_id' is not null then
      select org_id into v_org from public.social_campaigns where id = (to_jsonb(new)->>'campaign_id')::uuid;
      if v_org is distinct from new.org_id then raise exception using errcode = '23514', message = 'SOCIAL_TENANT_MISMATCH'; end if;
    end if;
  elsif tg_table_name = 'social_post_variants' then
    select org_id into v_org from public.social_posts where id = (to_jsonb(new)->>'social_post_id')::uuid;
    if v_org is distinct from new.org_id then raise exception using errcode = '23514', message = 'SOCIAL_TENANT_MISMATCH'; end if;
    select org_id, platform into v_org, v_platform from public.social_accounts where id = (to_jsonb(new)->>'social_account_id')::uuid;
    if v_org is distinct from new.org_id or v_platform is distinct from to_jsonb(new)->>'platform' then
      raise exception using errcode = '23514', message = 'SOCIAL_ACCOUNT_SCOPE_MISMATCH';
    end if;
  elsif tg_table_name = 'social_post_assets' then
    select org_id into v_org from public.social_post_variants where id = (to_jsonb(new)->>'post_variant_id')::uuid;
    if v_org is distinct from new.org_id then raise exception using errcode = '23514', message = 'SOCIAL_TENANT_MISMATCH'; end if;
  elsif tg_table_name = 'social_approvals' then
    select org_id into v_org from public.social_posts where id = (to_jsonb(new)->>'social_post_id')::uuid;
    if v_org is distinct from new.org_id then raise exception using errcode = '23514', message = 'SOCIAL_TENANT_MISMATCH'; end if;
  elsif tg_table_name = 'social_publish_jobs' then
    select org_id into v_org from public.social_post_variants where id = (to_jsonb(new)->>'post_variant_id')::uuid;
    if v_org is distinct from new.org_id then raise exception using errcode = '23514', message = 'SOCIAL_TENANT_MISMATCH'; end if;
  elsif tg_table_name = 'social_publish_attempts' then
    select org_id into v_org from public.social_publish_jobs where id = (to_jsonb(new)->>'publish_job_id')::uuid;
    if v_org is distinct from new.org_id then raise exception using errcode = '23514', message = 'SOCIAL_TENANT_MISMATCH'; end if;
  end if;
  return new;
end
$$;
create trigger social_accounts_tenant_scope before insert or update on public.social_accounts
  for each row execute function public.social_assert_tenant_scope();
create trigger social_posts_tenant_scope before insert or update on public.social_posts
  for each row execute function public.social_assert_tenant_scope();
create trigger social_variants_tenant_scope before insert or update on public.social_post_variants
  for each row execute function public.social_assert_tenant_scope();
create trigger social_assets_tenant_scope before insert or update on public.social_post_assets
  for each row execute function public.social_assert_tenant_scope();
create trigger social_approvals_tenant_scope before insert or update on public.social_approvals
  for each row execute function public.social_assert_tenant_scope();
create trigger social_jobs_tenant_scope before insert or update on public.social_publish_jobs
  for each row execute function public.social_assert_tenant_scope();
create trigger social_attempts_tenant_scope before insert or update on public.social_publish_attempts
  for each row execute function public.social_assert_tenant_scope();

alter table public.social_publisher_settings enable row level security;
alter table public.social_connections enable row level security;
alter table public.social_oauth_states enable row level security;
alter table public.social_accounts enable row level security;
alter table public.social_account_credentials enable row level security;
alter table public.social_campaigns enable row level security;
alter table public.social_posts enable row level security;
alter table public.social_post_variants enable row level security;
alter table public.social_post_assets enable row level security;
alter table public.social_approvals enable row level security;
alter table public.social_publish_jobs enable row level security;
alter table public.social_publish_attempts enable row level security;
alter table public.social_activity_log enable row level security;

create policy social_settings_member_read on public.social_publisher_settings for select to authenticated
  using (public.is_org_member(org_id));
create policy social_settings_admin_write on public.social_publisher_settings for all to authenticated
  using (public.org_role(org_id) in ('owner','admin')) with check (public.org_role(org_id) in ('owner','admin'));
create policy social_accounts_member_read on public.social_accounts for select to authenticated
  using (public.is_org_member(org_id));
create policy social_accounts_admin_update on public.social_accounts for update to authenticated
  using (public.org_role(org_id) in ('owner','admin')) with check (public.org_role(org_id) in ('owner','admin'));
create policy social_campaigns_member_all on public.social_campaigns for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy social_posts_member_all on public.social_posts for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy social_variants_member_all on public.social_post_variants for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy social_assets_member_all on public.social_post_assets for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy social_approvals_member_read on public.social_approvals for select to authenticated
  using (public.is_org_member(org_id));
create policy social_approvals_reviewer_insert on public.social_approvals for insert to authenticated
  with check (public.org_role(org_id) in ('owner','admin','manager') and reviewer_user_id = auth.uid());
create policy social_jobs_member_read on public.social_publish_jobs for select to authenticated
  using (public.is_org_member(org_id));
create policy social_attempts_member_read on public.social_publish_attempts for select to authenticated
  using (public.is_org_member(org_id));
create policy social_activity_member_read on public.social_activity_log for select to authenticated
  using (public.is_org_member(org_id));

grant select, insert, update, delete on public.social_publisher_settings to authenticated;
grant select, update on public.social_accounts to authenticated;
grant select, insert, update, delete on public.social_campaigns, public.social_posts, public.social_post_variants, public.social_post_assets to authenticated;
grant select, insert on public.social_approvals to authenticated;
grant select on public.social_publish_jobs, public.social_publish_attempts, public.social_activity_log to authenticated;
revoke all on public.social_connections, public.social_oauth_states, public.social_account_credentials from anon, authenticated;
grant all on public.social_publisher_settings, public.social_connections, public.social_oauth_states,
  public.social_accounts, public.social_account_credentials, public.social_campaigns, public.social_posts,
  public.social_post_variants, public.social_post_assets, public.social_approvals, public.social_publish_jobs,
  public.social_publish_attempts, public.social_activity_log to service_role;

create or replace function public.social_connection_status(p_org_id uuid)
returns table (
  id uuid, provider text, status text, token_expires_at timestamptz,
  granted_scopes text[], last_verified_at timestamptz, updated_at timestamptz
)
language sql stable security definer set search_path = public
as $$
  select c.id, c.provider, c.status, c.token_expires_at, c.granted_scopes, c.last_verified_at, c.updated_at
  from public.social_connections c
  where c.org_id = p_org_id and public.is_org_member(p_org_id)
$$;
revoke all on function public.social_connection_status(uuid) from public;
grant execute on function public.social_connection_status(uuid) to authenticated;

create or replace function public.social_transition_post(
  p_post_id uuid,
  p_action text,
  p_comment text default null
)
returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_post public.social_posts;
  v_role text;
  v_next text;
begin
  select * into v_post from public.social_posts where id = p_post_id for update;
  if v_post.id is null or not public.is_org_member(v_post.org_id) then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;
  v_role := public.org_role(v_post.org_id);

  if p_action = 'submit' and v_post.workflow_status in ('draft','changes_requested') then
    v_next := 'in_review';
    update public.social_posts set workflow_status = v_next, submitted_at = now() where id = p_post_id;
    insert into public.social_approvals(org_id, social_post_id, reviewer_user_id, decision, comment)
      values (v_post.org_id, p_post_id, auth.uid(), 'submitted', p_comment);
  elsif p_action = 'approve' and v_post.workflow_status = 'in_review' and v_role in ('owner','admin','manager') then
    v_next := 'approved';
    update public.social_posts set workflow_status = v_next, approved_at = now(), approved_by_user_id = auth.uid() where id = p_post_id;
    insert into public.social_approvals(org_id, social_post_id, reviewer_user_id, decision, comment)
      values (v_post.org_id, p_post_id, auth.uid(), 'approved', p_comment);
  elsif p_action = 'request_changes' and v_post.workflow_status = 'in_review' and v_role in ('owner','admin','manager') then
    v_next := 'changes_requested';
    update public.social_posts set workflow_status = v_next where id = p_post_id;
    insert into public.social_approvals(org_id, social_post_id, reviewer_user_id, decision, comment)
      values (v_post.org_id, p_post_id, auth.uid(), 'changes_requested', p_comment);
  elsif p_action = 'cancel' and v_post.workflow_status not in ('published','canceled') and v_role in ('owner','admin','manager') then
    v_next := 'canceled';
    update public.social_posts set workflow_status = v_next where id = p_post_id;
    update public.social_post_variants set publication_status = 'canceled' where social_post_id = p_post_id and publication_status <> 'published';
    update public.social_publish_jobs set status = 'canceled', locked_at = null, locked_by = null
      where post_variant_id in (select id from public.social_post_variants where social_post_id = p_post_id)
        and status in ('queued','retrying');
  else
    raise exception using errcode = '22023', message = 'INVALID_WORKFLOW_TRANSITION';
  end if;

  insert into public.social_activity_log(org_id, actor_user_id, entity_type, entity_id, action, metadata)
    values (v_post.org_id, auth.uid(), 'social_post', p_post_id, p_action, jsonb_build_object('from', v_post.workflow_status, 'to', v_next));
  return v_next;
end
$$;
revoke all on function public.social_transition_post(uuid, text, text) from public;
grant execute on function public.social_transition_post(uuid, text, text) to authenticated;

create or replace function public.social_schedule_post(p_post_id uuid)
returns integer
language plpgsql security definer set search_path = public
as $$
declare
  v_post public.social_posts;
  v_settings public.social_publisher_settings;
  v_invalid integer;
  v_count integer;
begin
  select * into v_post from public.social_posts where id = p_post_id for update;
  if v_post.id is null or public.org_role(v_post.org_id) not in ('owner','admin','manager') then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;
  select * into v_settings from public.social_publisher_settings where org_id = v_post.org_id;
  if coalesce(v_settings.approval_required, false) and v_post.workflow_status <> 'approved' then
    raise exception using errcode = '22023', message = 'APPROVAL_REQUIRED';
  end if;
  if v_post.workflow_status not in ('draft','approved','changes_requested') then
    raise exception using errcode = '22023', message = 'POST_NOT_SCHEDULABLE';
  end if;

  select count(*) into v_invalid
  from public.social_post_variants v
  join public.social_accounts a on a.id = v.social_account_id and a.org_id = v.org_id
  where v.social_post_id = p_post_id and (
    v.scheduled_for_utc is null or v.scheduled_for_utc <= now() + interval '1 minute'
    or a.status <> 'active' or not a.is_selected
    or not exists (
      select 1 from public.social_connections c
      where c.id = a.connection_id and c.org_id = v.org_id and c.status = 'active'
        and (c.token_expires_at is null or c.token_expires_at > v.scheduled_for_utc)
        and case when v.platform = 'facebook'
          then 'pages_manage_posts' = any(c.granted_scopes)
          else 'instagram_content_publish' = any(c.granted_scopes)
        end
    )
    or (v.platform = 'facebook' and btrim(v.caption) = '' and v.format not in ('image','video'))
    or (v.platform = 'instagram' and v.format not in ('image','carousel','reel'))
    or (v.format in ('image','video','carousel','reel') and not exists (
      select 1 from public.social_post_assets x where x.post_variant_id = v.id
    ))
  );
  select count(*) into v_count from public.social_post_variants where social_post_id = p_post_id;
  if v_count = 0 or v_invalid > 0 then
    raise exception using errcode = '22023', message = 'POST_VALIDATION_FAILED';
  end if;

  insert into public.social_publish_jobs(org_id, post_variant_id, scheduled_for_utc, idempotency_key)
  select v.org_id, v.id, v.scheduled_for_utc,
         v.id::text || ':' || extract(epoch from v.scheduled_for_utc)::bigint::text
  from public.social_post_variants v where v.social_post_id = p_post_id
  on conflict (idempotency_key) do nothing;

  update public.social_post_variants set publication_status = 'scheduled' where social_post_id = p_post_id;
  update public.social_posts set workflow_status = 'scheduled' where id = p_post_id;
  insert into public.social_activity_log(org_id, actor_user_id, entity_type, entity_id, action, metadata)
    values (v_post.org_id, auth.uid(), 'social_post', p_post_id, 'scheduled', jsonb_build_object('jobs', v_count));
  return v_count;
end
$$;
revoke all on function public.social_schedule_post(uuid) from public;
grant execute on function public.social_schedule_post(uuid) to authenticated;

-- Atomically leases due work. Stale leases are recoverable after ten minutes.
create or replace function public.claim_social_publish_jobs(p_worker text, p_limit integer default 10, p_job_id uuid default null)
returns setof public.social_publish_jobs
language plpgsql security definer set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    raise exception using errcode = '42501', message = 'SERVICE_ROLE_REQUIRED';
  end if;
  return query
  with due as (
    select j.id from public.social_publish_jobs j
    where (p_job_id is null or j.id = p_job_id)
      and (
        (j.status in ('queued','retrying') and coalesce(j.next_attempt_at, j.scheduled_for_utc) <= now())
        or (j.status = 'processing' and j.locked_at < now() - interval '10 minutes')
      )
    order by coalesce(j.next_attempt_at, j.scheduled_for_utc)
    for update skip locked limit greatest(1, least(p_limit, 50))
  )
  update public.social_publish_jobs j
  set status = 'processing', locked_at = now(), locked_by = left(p_worker, 120), attempt_count = j.attempt_count + 1
  from due where j.id = due.id returning j.*;
end
$$;
revoke all on function public.claim_social_publish_jobs(text, integer, uuid) from public;
grant execute on function public.claim_social_publish_jobs(text, integer, uuid) to service_role;

-- Requeue is deliberately scoped to one failed channel and uses a fresh lease,
-- while a provider id already recorded is never eligible for republishing.
create or replace function public.social_retry_publish_job(p_job_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare v_job public.social_publish_jobs;
begin
  select * into v_job from public.social_publish_jobs where id = p_job_id for update;
  if v_job.id is null or public.org_role(v_job.org_id) not in ('owner','admin','manager') then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;
  if v_job.status <> 'failed' or exists (
    select 1 from public.social_post_variants v where v.id = v_job.post_variant_id and v.provider_post_id is not null
  ) then raise exception using errcode = '22023', message = 'JOB_NOT_RETRYABLE'; end if;
  update public.social_publish_jobs set status = 'retrying', next_attempt_at = now(), locked_at = null, locked_by = null,
    last_error_category = null, last_error_message_safe = null where id = p_job_id;
  update public.social_post_variants set publication_status = 'scheduled' where id = v_job.post_variant_id;
  insert into public.social_activity_log(org_id, actor_user_id, entity_type, entity_id, action)
    values (v_job.org_id, auth.uid(), 'social_publish_job', p_job_id, 'manual_retry');
end
$$;
revoke all on function public.social_retry_publish_job(uuid) from public;
grant execute on function public.social_retry_publish_job(uuid) to authenticated;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('social-media', 'social-media', true, 104857600,
  array['image/jpeg','image/png','image/webp','video/mp4','video/quicktime'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy social_media_public_read on storage.objects for select using (bucket_id = 'social-media');
create policy social_media_member_upload on storage.objects for insert to authenticated
  with check (bucket_id = 'social-media' and public.is_org_member((storage.foldername(name))[1]::uuid));
create policy social_media_member_delete on storage.objects for delete to authenticated
  using (bucket_id = 'social-media' and public.is_org_member((storage.foldername(name))[1]::uuid));

alter table public.team_members
  alter column feature_access set default '{"campaigns":true,"contacts":true,"projects":true,"skills":true,"intake":true,"workspace":true,"socialPublisher":true}';
update public.team_members set feature_access = feature_access || '{"socialPublisher":true}'::jsonb
where not (feature_access ? 'socialPublisher');

comment on table public.social_connections is 'Encrypted Meta user tokens. Service role only; use social_connection_status() from the browser.';
comment on table public.social_publish_jobs is 'One durable and independently retryable job per channel variant.';

-- Install the one-minute worker when the matching Vault values are available.
-- Deployments without them remain safe: jobs stay queued and can be inspected
-- in the operations UI until the recurring worker is configured.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
do $$
declare v_ready boolean := false;
begin
  if to_regnamespace('vault') is not null then
    execute $check$
      select count(distinct name) = 3
      from vault.decrypted_secrets
      where name in ('project_url', 'service_role_key', 'social_publisher_worker_secret')
    $check$ into v_ready;
  end if;
  if v_ready then
    perform cron.schedule(
      'social-publisher-worker',
      '* * * * *',
      $job$
        select net.http_post(
          url := rtrim((select decrypted_secret from vault.decrypted_secrets where name = 'project_url' limit 1), '/') || '/functions/v1/social-publish',
          headers := jsonb_build_object(
            'Content-Type', 'application/json',
            'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key' limit 1),
            'x-social-publisher-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'social_publisher_worker_secret' limit 1)
          ),
          body := jsonb_build_object('limit', 20),
          timeout_milliseconds := 50000
        );
      $job$
    );
  else
    raise warning 'Social Publisher cron not installed: add project_url, service_role_key, and social_publisher_worker_secret to Vault, then schedule the worker block from this migration.';
  end if;
end;
$$;
