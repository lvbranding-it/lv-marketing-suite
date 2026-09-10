-- Connect Creative Canvas to the existing client pipeline.
--
-- Until now a canvas could only be born with a brand-new project, so the client
-- work already in `projects` — the intake brief, the AI-maintained brand
-- snapshot, the asset history — was invisible to it. A canvas can now be opened
-- on any project the person can already edit, and a client can carry several
-- canvases (a launch, a rebrand, a seasonal campaign) that share one brand
-- context and one asset library.

begin;

-- Snapshot values arrive as strings, arrays, numbers or nested objects depending
-- on which agent wrote them, and the Canvas brand form is all plain text. This
-- renders any of those as something a person can read and edit.
create or replace function public.creative_snapshot_text(value jsonb)
returns text language sql immutable as $$
  select nullif(trim(case
    when value is null or jsonb_typeof(value) = 'null' then ''
    when jsonb_typeof(value) = 'string' then value #>> '{}'
    when jsonb_typeof(value) in ('number', 'boolean') then value #>> '{}'
    when jsonb_typeof(value) = 'array' then (
      select string_agg(coalesce(element #>> '{}', element::text), E'\n')
      from jsonb_array_elements(value) element
    )
    -- Nested objects become readable `key: value` lines rather than raw JSON,
    -- because a creative edits this in a plain textarea.
    else (
      select string_agg(entry.key || ': ' || coalesce(entry.value #>> '{}', entry.value::text), E'\n')
      from jsonb_each(value) as entry
    )
  end), '')
$$;

-- Picks the first key that a given snapshot actually carries. Snapshots are
-- written by different agents in English and Spanish, so no single key name is
-- reliable; this keeps the mapping best-effort rather than brittle.
create or replace function public.creative_snapshot_pick(snapshot jsonb, variadic keys text[])
returns text language sql immutable as $$
  select public.creative_snapshot_text(snapshot -> key)
  from unnest(keys) as key
  where public.creative_snapshot_text(snapshot -> key) is not null
  limit 1
$$;

/**
 * Builds a Canvas brand context from what the project already knows.
 *
 * Deliberately partial: it fills the fields it can identify and leaves the rest
 * for a person, because a half-filled brief that is correct beats a full one
 * that guessed. Whatever is not mapped here still reaches the model, which
 * receives the entire snapshot server-side at generation time.
 */
create or replace function public.creative_brand_context_from_project(target_project_id uuid)
returns jsonb language sql stable security definer set search_path = public as $$
  select coalesce(jsonb_strip_nulls(jsonb_build_object(
    'brandName', coalesce(public.creative_snapshot_pick(p.brand_snapshot, 'brand_name', 'brand', 'marca'), p.client_name),
    'businessDescription', coalesce(public.creative_snapshot_pick(p.brand_snapshot, 'business_description', 'descripcion'), p.description),
    'objective', public.creative_snapshot_pick(p.brand_snapshot, 'objective', 'objetivo_civico', 'goals', 'project_current'),
    'audiences', coalesce(
      nullif(concat_ws(E'\n\n',
        public.creative_snapshot_pick(p.brand_snapshot, 'primary_audience'),
        public.creative_snapshot_pick(p.brand_snapshot, 'secondary_audience')), ''),
      public.creative_snapshot_pick(p.brand_snapshot, 'audiencia', 'audiences', 'target_audience')),
    'positioning', public.creative_snapshot_pick(p.brand_snapshot, 'positioning', 'posicionamiento'),
    'valueProposition', public.creative_snapshot_pick(p.brand_snapshot, 'uvp_layers', 'value_proposition', 'oferta_de_valor'),
    'personality', public.creative_snapshot_pick(p.brand_snapshot, 'core_values', 'personality', 'brand_personality'),
    'visualPrinciples', public.creative_snapshot_pick(p.brand_snapshot, 'visual_style', 'visual_principles'),
    'competitors', public.creative_snapshot_pick(p.brand_snapshot, 'competitors', 'competencia'),
    'languages', public.creative_snapshot_pick(p.brand_snapshot, 'language', 'languages', 'idiomas'),
    'market', public.creative_snapshot_pick(p.brand_snapshot, 'geografia', 'geographies', 'market', 'location'),
    'requiredMessages', public.creative_snapshot_pick(p.brand_snapshot, 'primary_headline', 'key_messages', 'required_messages')
  )), '{}'::jsonb)
  from public.projects p
  where p.id = target_project_id
$$;

/**
 * Opens a canvas on a project that already exists.
 *
 * Authorization reuses `can_edit_creative_project`, so the Canvas feature grant
 * and any project override apply here exactly as they do everywhere else. The
 * brand context is seeded once, and only when the project has none: re-opening
 * a second canvas for the same client must never overwrite what a creative has
 * already edited.
 */
create or replace function public.create_canvas_for_project(
  target_project_id uuid,
  canvas_name text default 'Main canvas'
)
returns table (project_id uuid, canvas_id uuid)
language plpgsql security invoker set search_path = public as $$
declare
  target_org_id uuid;
  new_canvas_id uuid;
  seeded jsonb;
begin
  if not public.can_edit_creative_project(target_project_id) then
    raise exception 'Creative Canvas access denied' using errcode = '42501';
  end if;
  select p.org_id into target_org_id from public.projects p where p.id = target_project_id;
  if target_org_id is null then
    raise exception 'Project not found' using errcode = 'P0002';
  end if;

  insert into public.creative_canvases (project_id, org_id, name, created_by)
  values (target_project_id, target_org_id,
          coalesce(nullif(trim(canvas_name), ''), 'Main canvas'), auth.uid())
  returning id into new_canvas_id;

  seeded := public.creative_brand_context_from_project(target_project_id);
  if seeded <> '{}'::jsonb then
    -- Named constraint rather than `on conflict (project_id)`: the OUT parameter
    -- of this function is also called project_id, and a bare column name in the
    -- conflict target is ambiguous between the two.
    insert into public.brand_contexts (project_id, org_id, content, created_by)
    values (target_project_id, target_org_id, seeded, auth.uid())
    on conflict on constraint brand_contexts_project_id_key do nothing;
  end if;

  return query select target_project_id, new_canvas_id;
end;
$$;

revoke all on function public.creative_snapshot_text(jsonb) from public, anon;
revoke all on function public.creative_snapshot_pick(jsonb, text[]) from public, anon;
revoke all on function public.creative_brand_context_from_project(uuid) from public, anon;
grant execute on function public.creative_snapshot_text(jsonb) to authenticated;
grant execute on function public.creative_snapshot_pick(jsonb, text[]) to authenticated;
grant execute on function public.creative_brand_context_from_project(uuid) to authenticated;
grant execute on function public.create_canvas_for_project(uuid, text) to authenticated;

-- A client accumulates canvases over time, so the listing reads them per project
-- newest first.
create index if not exists creative_canvases_org_project_idx
  on public.creative_canvases (org_id, project_id, created_at desc);

commit;
