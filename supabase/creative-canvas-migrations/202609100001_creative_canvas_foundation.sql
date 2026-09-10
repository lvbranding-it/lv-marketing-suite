-- LV Creative Canvas foundation
-- Candidate additive migration. Apply in staging through the reconciled migration
-- workflow; do not use a blanket db push while legacy history is divergent.

begin;

create type public.creative_access_role as enum ('owner_admin', 'creative_director', 'collaborator', 'viewer');
create type public.creative_asset_source as enum ('upload', 'generated', 'edited', 'variation', 'reference');
create type public.creative_generation_status as enum ('draft', 'queued', 'processing', 'completed', 'failed', 'cancelled');
create type public.creative_decision_type as enum ('favorite', 'shortlisted', 'rejected', 'needs_revision', 'client_selected', 'approved_final');

create table public.creative_project_members (
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.creative_access_role not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (project_id, user_id)
);

create table public.creative_canvases (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null default 'Main canvas' check (char_length(name) between 1 and 160),
  scene_document jsonb not null default '{}'::jsonb,
  scene_version integer not null default 1 check (scene_version > 0),
  thumbnail_asset_id uuid,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id, org_id)
);

create table public.brand_contexts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null unique references public.projects(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  content jsonb not null default '{}'::jsonb,
  version integer not null default 1 check (version > 0),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, project_id, org_id)
);

create table public.creative_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  storage_path text not null unique,
  original_filename text not null,
  mime_type text not null check (mime_type in ('image/png', 'image/jpeg', 'image/webp')),
  file_size bigint not null check (file_size > 0 and file_size <= 26214400),
  width integer check (width is null or width > 0),
  height integer check (height is null or height > 0),
  source_type public.creative_asset_source not null,
  parent_asset_id uuid references public.creative_assets(id) on delete set null,
  generation_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint creative_assets_extension_matches_mime check (
    (mime_type = 'image/png' and lower(storage_path) ~ '\.png$') or
    (mime_type = 'image/jpeg' and lower(storage_path) ~ '\.(jpg|jpeg)$') or
    (mime_type = 'image/webp' and lower(storage_path) ~ '\.webp$')
  ),
  unique (id, project_id, org_id)
);

alter table public.creative_canvases
  add constraint creative_canvases_thumbnail_asset_fk
  foreign key (thumbnail_asset_id) references public.creative_assets(id) on delete set null;

create table public.asset_versions (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.creative_assets(id) on delete cascade,
  parent_version_id uuid references public.asset_versions(id) on delete set null,
  storage_path text not null unique,
  version_number integer not null check (version_number > 0),
  edit_instruction text,
  provider text,
  model text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (asset_id, version_number)
);

create table public.creative_directions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  canvas_id uuid not null references public.creative_canvases(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  name text not null,
  rationale text,
  visual_narrative text,
  keywords text[] not null default '{}',
  status text not null default 'draft' check (status in ('draft', 'shortlisted', 'rejected', 'approved')),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_generations (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  canvas_id uuid not null references public.creative_canvases(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  provider text not null check (provider in ('openai', 'google', 'anthropic')),
  model text not null,
  operation text not null,
  status public.creative_generation_status not null default 'draft',
  original_instruction text not null,
  system_instructions text,
  structured_context jsonb not null default '{}'::jsonb,
  context_manifest jsonb not null default '{}'::jsonb,
  normalized_request jsonb not null default '{}'::jsonb,
  enhanced_prompt text,
  reference_asset_ids uuid[] not null default '{}',
  parent_generation_id uuid references public.ai_generations(id) on delete set null,
  output_asset_id uuid references public.creative_assets(id) on delete set null,
  output_text text,
  input_tokens integer check (input_tokens is null or input_tokens >= 0),
  output_tokens integer check (output_tokens is null or output_tokens >= 0),
  estimated_cost_usd numeric(12,6) check (estimated_cost_usd is null or estimated_cost_usd >= 0),
  duration_ms integer check (duration_ms is null or duration_ms >= 0),
  provider_request_id text,
  idempotency_key text not null,
  error_code text,
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key)
);

alter table public.creative_assets
  add constraint creative_assets_generation_fk
  foreign key (generation_id) references public.ai_generations(id) on delete set null;

create table public.creative_decisions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  canvas_id uuid not null references public.creative_canvases(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  target_type text not null check (target_type in ('asset', 'shape', 'direction', 'generation')),
  target_id text not null,
  decision public.creative_decision_type not null,
  note text,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.creative_comments (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  canvas_id uuid not null references public.creative_canvases(id) on delete cascade,
  org_id uuid not null references public.organizations(id) on delete cascade,
  target_shape_id text,
  body text not null check (char_length(body) between 1 and 5000),
  resolved_at timestamptz,
  created_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.ai_usage_ledger (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete restrict,
  generation_id uuid not null references public.ai_generations(id) on delete cascade,
  provider text not null,
  model text not null,
  usage_type text not null,
  quantity numeric(16,4) not null default 1 check (quantity >= 0),
  estimated_cost_usd numeric(12,6) not null default 0 check (estimated_cost_usd >= 0),
  created_at timestamptz not null default now(),
  unique (generation_id, usage_type)
);

create index creative_canvases_project_updated_idx on public.creative_canvases(project_id, updated_at desc);
create index creative_assets_project_created_idx on public.creative_assets(project_id, created_at desc) where deleted_at is null;
create index asset_versions_asset_version_idx on public.asset_versions(asset_id, version_number desc);
create index creative_directions_canvas_idx on public.creative_directions(canvas_id, updated_at desc);
create index ai_generations_canvas_created_idx on public.ai_generations(canvas_id, created_at desc);
create index ai_generations_active_user_idx on public.ai_generations(user_id, status) where status in ('queued', 'processing');
create index creative_decisions_target_idx on public.creative_decisions(project_id, target_type, target_id, created_at desc);
create index ai_usage_org_month_idx on public.ai_usage_ledger(organization_id, created_at desc);

create or replace function public.creative_project_role(target_project_id uuid)
returns public.creative_access_role
language sql stable security definer set search_path = public
as $$
  select coalesce(
    -- An explicit project override always wins, including read-only viewer.
    (select cpm.role from public.creative_project_members cpm
      where cpm.project_id = target_project_id and cpm.user_id = auth.uid()),
    -- Otherwise the org role decides, but only for members granted Creative
    -- Canvas in team setup. Every Canvas action spends provider credit, so org
    -- membership alone is not enough to open it; owners and admins bypass the
    -- grant exactly as they bypass every other feature flag in the suite.
    -- Comparing jsonb to jsonb rather than casting text keeps a hand-edited
    -- value from raising inside a policy.
    (select case
      when tm.role::text in ('owner', 'admin') then 'owner_admin'::public.creative_access_role
      when coalesce(tm.feature_access -> 'creativeCanvas', 'false'::jsonb) <> 'true'::jsonb
        then null::public.creative_access_role
      when tm.role::text = 'manager' then 'creative_director'::public.creative_access_role
      else 'collaborator'::public.creative_access_role end
     from public.projects p join public.team_members tm on tm.org_id = p.org_id
     where p.id = target_project_id and tm.user_id = auth.uid())
  );
$$;

-- `org_id` is denormalized onto every Canvas table and drives the usage ledger
-- and the monthly budget query, so a row pointing at the wrong organization
-- misattributes real spend. Insert policies checked this; updates did not, and
-- several tables never did. This makes the check one shared expression.
create or replace function public.creative_org_matches_project(target_project_id uuid, target_org_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.projects p where p.id = target_project_id and p.org_id = target_org_id) $$;

-- Storage object paths are `org/project/category/file`. Casting a path segment
-- straight to uuid raises 22P02 on anything malformed, which surfaces a Postgres
-- error instead of a clean denial; returning null instead lets the role lookup
-- decide and fail closed.
create or replace function public.creative_path_uuid(value text)
returns uuid language sql immutable
as $$ select case when value ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then value::uuid end $$;

grant execute on function public.creative_org_matches_project(uuid, uuid) to authenticated;
grant execute on function public.creative_path_uuid(text) to authenticated;

create or replace function public.can_view_creative_project(target_project_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select public.creative_project_role(target_project_id) is not null $$;

-- Coalesced because `null in (...)` is null, not false. A policy reads that as
-- deny either way, but a caller comparing against false does not: that exact
-- gap is why the Edge Function's authorization check could never fire.
create or replace function public.can_edit_creative_project(target_project_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$ select coalesce(public.creative_project_role(target_project_id) in ('owner_admin', 'creative_director', 'collaborator'), false) $$;

grant execute on function public.creative_project_role(uuid) to authenticated;
grant execute on function public.can_view_creative_project(uuid) to authenticated;
grant execute on function public.can_edit_creative_project(uuid) to authenticated;

create or replace function public.create_creative_canvas_project(
  target_org_id uuid,
  project_name text,
  client_name text default null,
  project_description text default null
)
returns table (project_id uuid, canvas_id uuid)
language plpgsql security invoker set search_path = public
as $$
declare
  new_project_id uuid;
  new_canvas_id uuid;
begin
  if auth.uid() is null or not exists (
    select 1 from public.team_members tm where tm.org_id = target_org_id and tm.user_id = auth.uid()
  ) then
    raise exception 'Creative Canvas access denied' using errcode = '42501';
  end if;
  if nullif(trim(project_name), '') is null or char_length(trim(project_name)) > 160 then
    raise exception 'Invalid project name' using errcode = '22023';
  end if;
  insert into public.projects (org_id, name, client_name, description, created_by)
  values (target_org_id, trim(project_name), nullif(trim(client_name), ''), nullif(trim(project_description), ''), auth.uid())
  returning id into new_project_id;
  insert into public.creative_canvases (project_id, org_id, name, created_by)
  values (new_project_id, target_org_id, 'Main canvas', auth.uid())
  returning id into new_canvas_id;
  return query select new_project_id, new_canvas_id;
end;
$$;
grant execute on function public.create_creative_canvas_project(uuid, text, text, text) to authenticated;

alter table public.creative_project_members enable row level security;
alter table public.creative_canvases enable row level security;
alter table public.brand_contexts enable row level security;
alter table public.creative_assets enable row level security;
alter table public.asset_versions enable row level security;
alter table public.creative_directions enable row level security;
alter table public.ai_generations enable row level security;
alter table public.creative_decisions enable row level security;
alter table public.creative_comments enable row level security;
alter table public.ai_usage_ledger enable row level security;

create policy creative_project_members_select on public.creative_project_members for select
  using (public.can_view_creative_project(project_id));
create policy creative_project_members_manage on public.creative_project_members for all
  using (public.creative_project_role(project_id) = 'owner_admin')
  with check (public.creative_project_role(project_id) = 'owner_admin');

create policy creative_canvases_select on public.creative_canvases for select using (public.can_view_creative_project(project_id));
create policy creative_canvases_insert on public.creative_canvases for insert with check (
  public.can_edit_creative_project(project_id) and created_by = auth.uid() and public.creative_org_matches_project(project_id, org_id)
);
create policy creative_canvases_update on public.creative_canvases for update
  using (public.can_edit_creative_project(project_id)) with check (public.can_edit_creative_project(project_id) and public.creative_org_matches_project(project_id, org_id));
create policy creative_canvases_delete on public.creative_canvases for delete using (
  public.creative_project_role(project_id) in ('owner_admin', 'creative_director')
);

create policy brand_contexts_select on public.brand_contexts for select using (public.can_view_creative_project(project_id));
create policy brand_contexts_write on public.brand_contexts for all using (public.can_edit_creative_project(project_id))
  with check (public.can_edit_creative_project(project_id) and public.creative_org_matches_project(project_id, org_id));

create policy creative_assets_select on public.creative_assets for select using (public.can_view_creative_project(project_id) and deleted_at is null);
create policy creative_assets_insert on public.creative_assets for insert with check (
  public.can_edit_creative_project(project_id) and created_by = auth.uid() and public.creative_org_matches_project(project_id, org_id)
);
create policy creative_assets_update on public.creative_assets for update using (public.can_edit_creative_project(project_id)) with check (public.can_edit_creative_project(project_id) and public.creative_org_matches_project(project_id, org_id));

create policy asset_versions_select on public.asset_versions for select using (
  exists (select 1 from public.creative_assets a where a.id = asset_id and public.can_view_creative_project(a.project_id))
);
create policy asset_versions_insert on public.asset_versions for insert with check (
  created_by = auth.uid() and exists (select 1 from public.creative_assets a where a.id = asset_id and public.can_edit_creative_project(a.project_id))
);

create policy creative_directions_select on public.creative_directions for select using (public.can_view_creative_project(project_id));
create policy creative_directions_write on public.creative_directions for all using (public.can_edit_creative_project(project_id)) with check (public.can_edit_creative_project(project_id) and public.creative_org_matches_project(project_id, org_id));
create policy ai_generations_select on public.ai_generations for select using (public.can_view_creative_project(project_id));
create policy ai_generations_insert on public.ai_generations for insert with check (public.can_edit_creative_project(project_id) and user_id = auth.uid() and public.creative_org_matches_project(project_id, org_id));
create policy creative_decisions_select on public.creative_decisions for select using (public.can_view_creative_project(project_id));
create policy creative_decisions_insert on public.creative_decisions for insert with check (public.can_edit_creative_project(project_id) and created_by = auth.uid() and public.creative_org_matches_project(project_id, org_id));
create policy creative_comments_select on public.creative_comments for select using (public.can_view_creative_project(project_id));
create policy creative_comments_write on public.creative_comments for all using (public.can_edit_creative_project(project_id)) with check (public.can_edit_creative_project(project_id) and created_by = auth.uid() and public.creative_org_matches_project(project_id, org_id));
create policy ai_usage_ledger_select on public.ai_usage_ledger for select using (public.can_view_creative_project(project_id));

-- Generation status, provider response, and usage writes are server-only.
revoke insert, update, delete on public.ai_usage_ledger from authenticated;
revoke update, delete on public.ai_generations from authenticated;

create trigger creative_canvases_updated_at before update on public.creative_canvases
  for each row execute function public.update_updated_at_column();
create trigger brand_contexts_updated_at before update on public.brand_contexts
  for each row execute function public.update_updated_at_column();
create trigger creative_directions_updated_at before update on public.creative_directions
  for each row execute function public.update_updated_at_column();
create trigger ai_generations_updated_at before update on public.ai_generations
  for each row execute function public.update_updated_at_column();
create trigger creative_comments_updated_at before update on public.creative_comments
  for each row execute function public.update_updated_at_column();

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('creative-canvas-assets', 'creative-canvas-assets', false, 26214400, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- `name` is written as `storage.objects.name` throughout. Unqualified, the
-- reference inside the insert policy's subquery bound to `public.projects.name`
-- instead — the project's title, which has no slashes — so `foldername` returned
-- an empty array, the org check could never match, and every upload was refused.
create policy creative_canvas_storage_select on storage.objects for select using (
  bucket_id = 'creative-canvas-assets'
  and public.can_view_creative_project(public.creative_path_uuid((storage.foldername(storage.objects.name))[2]))
);
create policy creative_canvas_storage_insert on storage.objects for insert with check (
  bucket_id = 'creative-canvas-assets'
  and public.can_edit_creative_project(public.creative_path_uuid((storage.foldername(storage.objects.name))[2]))
  and exists (
    select 1 from public.projects proj
    where proj.id = public.creative_path_uuid((storage.foldername(storage.objects.name))[2])
      and proj.org_id::text = (storage.foldername(storage.objects.name))[1]
  )
);
create policy creative_canvas_storage_delete on storage.objects for delete using (
  bucket_id = 'creative-canvas-assets'
  and public.creative_project_role(public.creative_path_uuid((storage.foldername(storage.objects.name))[2])) in ('owner_admin', 'creative_director')
);

commit;
