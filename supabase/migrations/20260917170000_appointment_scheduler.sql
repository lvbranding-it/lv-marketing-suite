-- Prospect appointment scheduler.
-- Supabase is the source of truth. Calendar providers are optional host-level
-- integrations whose secrets remain service-role only.

create table public.appointment_booking_pages (
  id                    uuid primary key default gen_random_uuid(),
  org_id                uuid not null unique references public.organizations(id) on delete cascade,
  slug                  text not null unique check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  title                 text not null default 'Let''s talk about your project'
                              check (char_length(btrim(title)) between 1 and 160),
  description           text not null default 'Choose a team member and a time that works for you.',
  timezone              text not null default 'America/Chicago',
  duration_minutes      integer not null default 30 check (duration_minutes in (15, 20, 30, 45, 60, 90, 120)),
  buffer_minutes        integer not null default 15 check (buffer_minutes between 0 and 120),
  minimum_notice_hours  integer not null default 24 check (minimum_notice_hours between 0 and 720),
  booking_window_days   integer not null default 60 check (booking_window_days between 1 and 365),
  confirmation_message  text not null default 'Your consultation is confirmed. We look forward to learning about your project.',
  confirmation_url      text not null default 'https://www.lvbranding.com'
                              check (confirmation_url ~ '^https://'),
  brand_color           text not null default '#CB2039' check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
  is_active             boolean not null default true,
  created_by            uuid references auth.users(id) on delete set null default auth.uid(),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table public.appointment_hosts (
  id            uuid primary key default gen_random_uuid(),
  page_id       uuid not null references public.appointment_booking_pages(id) on delete cascade,
  org_id        uuid not null references public.organizations(id) on delete cascade,
  user_id       uuid references auth.users(id) on delete set null,
  display_name  text not null check (char_length(btrim(display_name)) between 1 and 120),
  email         text not null check (char_length(email) between 3 and 320),
  avatar_url    text,
  is_enabled    boolean not null default true,
  is_default    boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (page_id, email)
);

create unique index appointment_hosts_one_default_idx
  on public.appointment_hosts(page_id) where is_default;

create table public.appointment_host_availability (
  id          uuid primary key default gen_random_uuid(),
  host_id     uuid not null references public.appointment_hosts(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  weekday     integer not null check (weekday between 1 and 7),
  start_time  time without time zone not null,
  end_time    time without time zone not null,
  created_at  timestamptz not null default now(),
  check (start_time < end_time),
  unique (host_id, weekday, start_time, end_time)
);

create table public.appointment_busy_blocks (
  id          uuid primary key default gen_random_uuid(),
  host_id     uuid not null references public.appointment_hosts(id) on delete cascade,
  org_id      uuid not null references public.organizations(id) on delete cascade,
  starts_at   timestamptz not null,
  ends_at     timestamptz not null,
  reason      text,
  created_by  uuid references auth.users(id) on delete set null default auth.uid(),
  created_at  timestamptz not null default now(),
  check (starts_at < ends_at)
);

create table public.appointment_bookings (
  id                    uuid primary key default gen_random_uuid(),
  page_id               uuid not null references public.appointment_booking_pages(id) on delete cascade,
  host_id               uuid not null references public.appointment_hosts(id) on delete restrict,
  org_id                uuid not null references public.organizations(id) on delete cascade,
  guest_name            text not null check (char_length(btrim(guest_name)) between 1 and 160),
  guest_email           text not null check (char_length(guest_email) between 3 and 320),
  guest_phone           text check (guest_phone is null or char_length(guest_phone) <= 60),
  company               text check (company is null or char_length(company) <= 200),
  project_notes         text check (project_notes is null or char_length(project_notes) <= 3000),
  starts_at             timestamptz not null,
  ends_at               timestamptz not null,
  status                text not null default 'confirmed'
                              check (status in ('confirmed', 'cancelled', 'completed', 'no_show')),
  meeting_url           text,
  provider              text check (provider in ('google', 'microsoft')),
  provider_event_id     text,
  provider_sync_error   text,
  confirmation_sent_at timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  check (starts_at < ends_at),
  unique (host_id, starts_at)
);

create unique index appointment_one_active_booking_per_email_idx
  on public.appointment_bookings(page_id, lower(guest_email))
  where status = 'confirmed';

-- OAuth material is deliberately not granted to anon/authenticated. Only Edge
-- Functions using the service role can read this table. The app reads the
-- redacted status through appointment_calendar_connection_status().
create table public.appointment_calendar_connections (
  id                    uuid primary key default gen_random_uuid(),
  host_id               uuid not null unique references public.appointment_hosts(id) on delete cascade,
  org_id                uuid not null references public.organizations(id) on delete cascade,
  provider              text not null check (provider in ('google', 'microsoft')),
  account_email         text,
  encrypted_access_token text not null,
  encrypted_refresh_token text,
  token_expires_at      timestamptz,
  scopes                text,
  calendar_id           text not null default 'primary',
  connected_by          uuid references auth.users(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create table public.appointment_oauth_states (
  state_hash   text primary key,
  host_id      uuid not null references public.appointment_hosts(id) on delete cascade,
  org_id       uuid not null references public.organizations(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  provider     text not null check (provider in ('google', 'microsoft')),
  expires_at   timestamptz not null,
  created_at   timestamptz not null default now()
);

create index appointment_hosts_page_idx on public.appointment_hosts(page_id, is_enabled, is_default desc);
create index appointment_availability_host_idx on public.appointment_host_availability(host_id, weekday);
create index appointment_bookings_host_time_idx on public.appointment_bookings(host_id, starts_at, ends_at);
create index appointment_bookings_org_time_idx on public.appointment_bookings(org_id, starts_at desc);
create index appointment_busy_blocks_host_time_idx on public.appointment_busy_blocks(host_id, starts_at, ends_at);

create trigger appointment_booking_pages_updated_at before update on public.appointment_booking_pages
  for each row execute function public.update_updated_at_column();
create trigger appointment_hosts_updated_at before update on public.appointment_hosts
  for each row execute function public.update_updated_at_column();
create trigger appointment_bookings_updated_at before update on public.appointment_bookings
  for each row execute function public.update_updated_at_column();
create trigger appointment_calendar_connections_updated_at before update on public.appointment_calendar_connections
  for each row execute function public.update_updated_at_column();

alter table public.appointment_booking_pages enable row level security;
alter table public.appointment_hosts enable row level security;
alter table public.appointment_host_availability enable row level security;
alter table public.appointment_busy_blocks enable row level security;
alter table public.appointment_bookings enable row level security;
alter table public.appointment_calendar_connections enable row level security;
alter table public.appointment_oauth_states enable row level security;

create policy appointment_pages_member_all on public.appointment_booking_pages
  for all to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy appointment_hosts_member_all on public.appointment_hosts
  for all to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy appointment_availability_member_all on public.appointment_host_availability
  for all to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy appointment_blocks_member_all on public.appointment_busy_blocks
  for all to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));
create policy appointment_bookings_member_read on public.appointment_bookings
  for select to authenticated using (public.is_org_member(org_id));
create policy appointment_bookings_member_update on public.appointment_bookings
  for update to authenticated using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

grant select, insert, update, delete on public.appointment_booking_pages to authenticated;
grant select, insert, update, delete on public.appointment_hosts to authenticated;
grant select, insert, update, delete on public.appointment_host_availability to authenticated;
grant select, insert, update, delete on public.appointment_busy_blocks to authenticated;
grant select, update on public.appointment_bookings to authenticated;
revoke all on public.appointment_calendar_connections from anon, authenticated;
revoke all on public.appointment_oauth_states from anon, authenticated;

-- Idempotently creates the organization's page, default Admin host and weekday hours.
create or replace function public.ensure_appointment_booking_page(
  p_org_id uuid,
  p_slug text default 'lv-branding-consultation',
  p_admin_email text default 'admin@lvbranding.com'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page_id uuid;
  v_host_id uuid;
  v_slug text := lower(btrim(p_slug));
begin
  if not public.is_org_member(p_org_id) then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;
  if v_slug !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception using errcode = '22023', message = 'INVALID_SLUG';
  end if;

  select id into v_page_id from public.appointment_booking_pages where org_id = p_org_id;
  if v_page_id is null then
    begin
      insert into public.appointment_booking_pages(org_id, slug)
      values (p_org_id, v_slug)
      returning id into v_page_id;
    exception when unique_violation then
      insert into public.appointment_booking_pages(org_id, slug)
      values (p_org_id, v_slug || '-' || left(replace(p_org_id::text, '-', ''), 8))
      returning id into v_page_id;
    end;
  end if;

  select id into v_host_id from public.appointment_hosts where page_id = v_page_id and lower(email) = lower(p_admin_email);
  if v_host_id is null then
    insert into public.appointment_hosts(page_id, org_id, user_id, display_name, email, is_default)
    values (v_page_id, p_org_id, case when lower(coalesce((select email from auth.users where id = auth.uid()), '')) = lower(p_admin_email) then auth.uid() else null end,
            'Admin', lower(p_admin_email), true)
    returning id into v_host_id;
  end if;

  insert into public.appointment_host_availability(host_id, org_id, weekday, start_time, end_time)
  select v_host_id, p_org_id, weekday, '09:00'::time, '17:00'::time
  from generate_series(1, 5) weekday
  on conflict do nothing;

  return v_page_id;
end
$$;

revoke all on function public.ensure_appointment_booking_page(uuid, text, text) from public;
grant execute on function public.ensure_appointment_booking_page(uuid, text, text) to authenticated;

-- Public page projection: no organization internals, connection metadata or PII.
create or replace function public.get_public_appointment_page(p_slug text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'id', p.id,
    'slug', p.slug,
    'title', p.title,
    'description', p.description,
    'timezone', p.timezone,
    'duration_minutes', p.duration_minutes,
    'brand_color', p.brand_color,
    'confirmation_message', p.confirmation_message,
    'confirmation_url', p.confirmation_url,
    'hosts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id,
        'display_name', h.display_name,
        'avatar_url', h.avatar_url,
        'is_default', h.is_default
      ) order by h.is_default desc, h.display_name)
      from public.appointment_hosts h
      where h.page_id = p.id and h.is_enabled
    ), '[]'::jsonb)
  )
  from public.appointment_booking_pages p
  where p.slug = lower(btrim(p_slug)) and p.is_active
$$;

revoke all on function public.get_public_appointment_page(text) from public;
grant execute on function public.get_public_appointment_page(text) to anon, authenticated;

-- Generates slots in the page's IANA timezone and removes internal bookings /
-- blocks. Provider busy periods are filtered in the availability Edge Function.
create or replace function public.get_appointment_available_slots(
  p_slug text,
  p_host_id uuid,
  p_from_date date,
  p_to_date date
)
returns table(starts_at timestamptz, ends_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  with settings as (
    select p.*, h.id host_id
    from public.appointment_booking_pages p
    join public.appointment_hosts h on h.page_id = p.id and h.is_enabled
    where p.slug = lower(btrim(p_slug)) and p.is_active and h.id = p_host_id
  ), days as (
    select s.*, d::date local_date
    from settings s
    cross join lateral generate_series(
      greatest(p_from_date, (now() at time zone s.timezone)::date)::timestamp,
      least(p_to_date, (now() at time zone s.timezone)::date + s.booking_window_days)::timestamp,
      interval '1 day'
    ) d
  ), slots as (
    select d.*,
      slot_start as starts_at,
      slot_start + make_interval(mins => d.duration_minutes) as ends_at
    from days d
    join public.appointment_host_availability a
      on a.host_id = d.host_id and a.weekday = extract(isodow from d.local_date)::integer
    cross join lateral generate_series(
      timezone(d.timezone, d.local_date + a.start_time),
      timezone(d.timezone, d.local_date + a.end_time) - make_interval(mins => d.duration_minutes),
      make_interval(mins => d.duration_minutes + d.buffer_minutes)
    ) slot_start
  )
  select s.starts_at, s.ends_at
  from slots s
  where s.starts_at >= now() + make_interval(hours => s.minimum_notice_hours)
    and not exists (
      select 1 from public.appointment_bookings b
      where b.host_id = s.host_id and b.status = 'confirmed'
        and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(s.starts_at, s.ends_at, '[)')
    )
    and not exists (
      select 1 from public.appointment_busy_blocks x
      where x.host_id = s.host_id
        and tstzrange(x.starts_at, x.ends_at, '[)') && tstzrange(s.starts_at, s.ends_at, '[)')
    )
  order by s.starts_at
$$;

revoke all on function public.get_appointment_available_slots(text, uuid, date, date) from public;
grant execute on function public.get_appointment_available_slots(text, uuid, date, date) to anon, authenticated;

create or replace function public.book_public_appointment(
  p_slug text,
  p_host_id uuid,
  p_guest_name text,
  p_guest_email text,
  p_guest_phone text,
  p_company text,
  p_project_notes text,
  p_starts_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_page public.appointment_booking_pages%rowtype;
  v_host public.appointment_hosts%rowtype;
  v_booking_id uuid;
  v_contact_id uuid;
  v_name text := btrim(coalesce(p_guest_name, ''));
  v_email text := lower(btrim(coalesce(p_guest_email, '')));
  v_first text;
  v_last text;
begin
  select * into v_page from public.appointment_booking_pages
    where slug = lower(btrim(p_slug)) and is_active for key share;
  if not found then raise exception using errcode = 'P0001', message = 'BOOKING_PAGE_UNAVAILABLE'; end if;

  select * into v_host from public.appointment_hosts
    where id = p_host_id and page_id = v_page.id and is_enabled for key share;
  if not found then raise exception using errcode = 'P0001', message = 'HOST_UNAVAILABLE'; end if;
  if char_length(v_name) < 1 or char_length(v_name) > 160 then
    raise exception using errcode = '22023', message = 'INVALID_GUEST_NAME';
  end if;
  if char_length(v_email) < 3 or char_length(v_email) > 320
     or v_email !~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$' then
    raise exception using errcode = '22023', message = 'INVALID_GUEST_EMAIL';
  end if;

  -- Serializes attempts for this host/start before rechecking availability.
  perform pg_advisory_xact_lock(hashtextextended(v_host.id::text || p_starts_at::text, 0));
  if not exists (
    select 1 from public.get_appointment_available_slots(
      v_page.slug, v_host.id,
      (p_starts_at at time zone v_page.timezone)::date,
      (p_starts_at at time zone v_page.timezone)::date
    ) s where s.starts_at = p_starts_at
  ) then
    raise exception using errcode = 'P0001', message = 'SLOT_UNAVAILABLE';
  end if;

  begin
    insert into public.appointment_bookings(
      page_id, host_id, org_id, guest_name, guest_email, guest_phone, company,
      project_notes, starts_at, ends_at
    ) values (
      v_page.id, v_host.id, v_page.org_id, v_name, v_email,
      nullif(btrim(coalesce(p_guest_phone, '')), ''), nullif(btrim(coalesce(p_company, '')), ''),
      nullif(btrim(coalesce(p_project_notes, '')), ''), p_starts_at,
      p_starts_at + make_interval(mins => v_page.duration_minutes)
    ) returning id into v_booking_id;
  exception when unique_violation then
    if exists (select 1 from public.appointment_bookings where page_id = v_page.id and lower(guest_email) = v_email and status = 'confirmed') then
      raise exception using errcode = 'P0001', message = 'EMAIL_ALREADY_BOOKED';
    end if;
    raise exception using errcode = 'P0001', message = 'SLOT_UNAVAILABLE';
  end;

  v_first := split_part(v_name, ' ', 1);
  v_last := nullif(btrim(substr(v_name, length(v_first) + 1)), '');
  insert into public.contacts(org_id, first_name, last_name, email, phone, company, source, tags, raw_data, pipeline_stage)
  values (v_page.org_id, v_first, v_last, v_email, nullif(btrim(coalesce(p_guest_phone, '')), ''),
          nullif(btrim(coalesce(p_company, '')), ''), 'manual', array['Website appointment'],
          jsonb_build_object('appointment_booking_id', v_booking_id, 'appointment_host', v_host.display_name), 'lead')
  on conflict (org_id, email) do update set
    first_name = coalesce(public.contacts.first_name, excluded.first_name),
    last_name = coalesce(public.contacts.last_name, excluded.last_name),
    phone = coalesce(public.contacts.phone, excluded.phone),
    company = coalesce(public.contacts.company, excluded.company),
    tags = case when 'Website appointment' = any(public.contacts.tags) then public.contacts.tags else array_append(public.contacts.tags, 'Website appointment') end,
    raw_data = public.contacts.raw_data || excluded.raw_data,
    updated_at = now()
  returning id into v_contact_id;

  insert into public.contact_activities(org_id, contact_id, type, body, meta)
  values (v_page.org_id, v_contact_id, 'meeting',
          'Website consultation booked with ' || v_host.display_name,
          jsonb_build_object('appointment_booking_id', v_booking_id, 'starts_at', p_starts_at));

  return v_booking_id;
end
$$;

revoke all on function public.book_public_appointment(text, uuid, text, text, text, text, text, timestamptz) from public;
grant execute on function public.book_public_appointment(text, uuid, text, text, text, text, text, timestamptz) to service_role;

create or replace function public.appointment_calendar_connection_status(p_org_id uuid)
returns table(host_id uuid, provider text, account_email text, connected_at timestamptz)
language sql
stable
security definer
set search_path = public
as $$
  select c.host_id, c.provider, c.account_email, c.created_at
  from public.appointment_calendar_connections c
  where c.org_id = p_org_id and public.is_org_member(p_org_id)
$$;

revoke all on function public.appointment_calendar_connection_status(uuid) from public;
grant execute on function public.appointment_calendar_connection_status(uuid) to authenticated;

create or replace function public.disconnect_appointment_calendar(p_host_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_org_id uuid;
begin
  select org_id into v_org_id from public.appointment_hosts where id = p_host_id;
  if v_org_id is null or public.org_role(v_org_id) not in ('owner', 'admin') then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;
  delete from public.appointment_calendar_connections where host_id = p_host_id;
end
$$;

revoke all on function public.disconnect_appointment_calendar(uuid) from public;
grant execute on function public.disconnect_appointment_calendar(uuid) to authenticated;

-- Converts admin-entered wall-clock time using the page timezone, avoiding
-- dependence on the administrator browser's local timezone.
create or replace function public.create_appointment_busy_block(
  p_host_id uuid,
  p_local_date date,
  p_start_time time without time zone,
  p_end_time time without time zone,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host public.appointment_hosts%rowtype;
  v_timezone text;
  v_id uuid;
begin
  select h.* into v_host
  from public.appointment_hosts h
  where h.id = p_host_id;
  if not found or not public.is_org_member(v_host.org_id) then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;
  select timezone into v_timezone from public.appointment_booking_pages where id = v_host.page_id;
  if p_end_time <= p_start_time then
    raise exception using errcode = '22023', message = 'INVALID_TIME_RANGE';
  end if;
  insert into public.appointment_busy_blocks(host_id, org_id, starts_at, ends_at, reason)
  values (v_host.id, v_host.org_id,
          timezone(v_timezone, p_local_date + p_start_time),
          timezone(v_timezone, p_local_date + p_end_time),
          nullif(btrim(coalesce(p_reason, '')), ''))
  returning id into v_id;
  return v_id;
end
$$;

revoke all on function public.create_appointment_busy_block(uuid, date, time, time, text) from public;
grant execute on function public.create_appointment_busy_block(uuid, date, time, time, text) to authenticated;
