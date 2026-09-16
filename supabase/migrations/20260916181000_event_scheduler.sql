-- Event Scheduler — Supabase-backed replacement for lv-branding-events Firebase.
-- Public callers can read active event configuration, query occupied slots and
-- create one validated booking through narrow RPCs. Guest PII is visible only
-- to members of the owning Marketing Suite organization.

create or replace function public.event_schedule_time_ranges_valid(p_ranges text[])
returns boolean
language plpgsql
immutable
set search_path = public
as $$
declare
  v_range text;
begin
  if coalesce(cardinality(p_ranges), 0) = 0 then return false; end if;
  foreach v_range in array p_ranges loop
    if v_range !~ '^(?:[01][0-9]|2[0-3]):[0-5][0-9]-(?:[01][0-9]|2[0-3]):[0-5][0-9]$' then
      return false;
    end if;
    if split_part(v_range, '-', 1)::time >= split_part(v_range, '-', 2)::time then
      return false;
    end if;
  end loop;
  return true;
end
$$;

create table if not exists public.event_schedule_events (
  id               uuid primary key default gen_random_uuid(),
  org_id           uuid not null references public.organizations(id) on delete cascade,
  name             text not null check (char_length(btrim(name)) between 1 and 160),
  location         text not null default '',
  placement        text not null default '',
  theme_color      text not null default '#f97316'
                         check (theme_color ~ '^#[0-9A-Fa-f]{6}$'),
  dates            date[] not null default '{}',
  time_slots       text[] not null default '{}',
  logo_url         text,
  is_featured      boolean not null default false,
  is_active        boolean not null default true,
  legacy_source_id text unique,
  created_by       uuid references auth.users(id) on delete set null default auth.uid(),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (cardinality(dates) > 0),
  check (public.event_schedule_time_ranges_valid(time_slots))
);

create table if not exists public.event_schedule_bookings (
  id                      uuid primary key default gen_random_uuid(),
  org_id                  uuid not null references public.organizations(id) on delete cascade,
  event_id                uuid not null references public.event_schedule_events(id) on delete cascade,
  guest_name              text not null check (char_length(btrim(guest_name)) between 1 and 160),
  guest_email             text not null check (char_length(guest_email) between 3 and 320),
  booking_date            date not null,
  slot_time               time without time zone not null,
  checked_in              boolean not null default false,
  confirmation_claimed_at timestamptz,
  confirmation_sent_at    timestamptz,
  legacy_source_id        text unique,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  unique (event_id, booking_date, slot_time)
);

create unique index if not exists event_schedule_one_booking_per_email_idx
  on public.event_schedule_bookings (event_id, lower(guest_email));
create unique index if not exists event_schedule_one_featured_per_org_idx
  on public.event_schedule_events (org_id) where is_featured;
create index if not exists event_schedule_events_org_idx
  on public.event_schedule_events (org_id, created_at desc);
create index if not exists event_schedule_bookings_org_date_idx
  on public.event_schedule_bookings (org_id, booking_date, slot_time);
create index if not exists event_schedule_bookings_event_idx
  on public.event_schedule_bookings (event_id, booking_date, slot_time);

drop trigger if exists event_schedule_events_updated_at on public.event_schedule_events;
create trigger event_schedule_events_updated_at
  before update on public.event_schedule_events
  for each row execute function public.update_updated_at_column();

drop trigger if exists event_schedule_bookings_updated_at on public.event_schedule_bookings;
create trigger event_schedule_bookings_updated_at
  before update on public.event_schedule_bookings
  for each row execute function public.update_updated_at_column();

alter table public.event_schedule_events enable row level security;
alter table public.event_schedule_bookings enable row level security;

create policy "event_schedule_active_public_read"
  on public.event_schedule_events for select
  to anon, authenticated
  using (is_active);

create policy "event_schedule_member_read_events"
  on public.event_schedule_events for select
  to authenticated
  using (public.is_org_member(org_id));

create policy "event_schedule_member_create_events"
  on public.event_schedule_events for insert
  to authenticated
  with check (public.is_org_member(org_id));

create policy "event_schedule_member_update_events"
  on public.event_schedule_events for update
  to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

create policy "event_schedule_admin_delete_events"
  on public.event_schedule_events for delete
  to authenticated
  using (public.org_role(org_id) in ('owner', 'admin'));

create policy "event_schedule_member_read_bookings"
  on public.event_schedule_bookings for select
  to authenticated
  using (public.is_org_member(org_id));

create policy "event_schedule_member_create_bookings"
  on public.event_schedule_bookings for insert
  to authenticated
  with check (public.is_org_member(org_id));

create policy "event_schedule_member_update_bookings"
  on public.event_schedule_bookings for update
  to authenticated
  using (public.is_org_member(org_id))
  with check (public.is_org_member(org_id));

create policy "event_schedule_admin_delete_bookings"
  on public.event_schedule_bookings for delete
  to authenticated
  using (public.org_role(org_id) in ('owner', 'admin'));

grant select on public.event_schedule_events to anon, authenticated;
grant insert, update, delete on public.event_schedule_events to authenticated;
grant select, insert, update, delete on public.event_schedule_bookings to authenticated;

-- Returns availability without exposing the guest attached to each occupied slot.
create or replace function public.event_schedule_booked_slots(p_event_id uuid)
returns table(booking_date date, slot_time text)
language sql
stable
security definer
set search_path = public
as $$
  select b.booking_date, to_char(b.slot_time, 'HH24:MI')
  from public.event_schedule_bookings b
  join public.event_schedule_events e on e.id = b.event_id
  where b.event_id = p_event_id
    and e.is_active
  order by b.booking_date, b.slot_time
$$;

revoke all on function public.event_schedule_booked_slots(uuid) from public;
grant execute on function public.event_schedule_booked_slots(uuid) to anon, authenticated;

-- Validates event/date/range membership and relies on unique indexes for the
-- final concurrency boundary, so simultaneous callers cannot double-book.
create or replace function public.book_event_schedule_slot(
  p_event_id uuid,
  p_guest_name text,
  p_guest_email text,
  p_booking_date date,
  p_slot_time time without time zone
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.event_schedule_events%rowtype;
  v_booking_id uuid;
  v_constraint text;
  v_name text := btrim(coalesce(p_guest_name, ''));
  v_email text := lower(btrim(coalesce(p_guest_email, '')));
begin
  select * into v_event
  from public.event_schedule_events
  where id = p_event_id and is_active
  for key share;

  if not found then
    raise exception using errcode = 'P0001', message = 'EVENT_UNAVAILABLE';
  end if;
  if char_length(v_name) < 1 or char_length(v_name) > 160 then
    raise exception using errcode = '22023', message = 'INVALID_GUEST_NAME';
  end if;
  if char_length(v_email) < 3 or char_length(v_email) > 320
     or v_email !~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$' then
    raise exception using errcode = '22023', message = 'INVALID_GUEST_EMAIL';
  end if;
  if not (p_booking_date = any(v_event.dates)) then
    raise exception using errcode = '22023', message = 'INVALID_EVENT_DATE';
  end if;
  if extract(second from p_slot_time) <> 0
     or mod(extract(minute from p_slot_time)::integer, 5) <> 0
     or not exists (
       select 1
       from unnest(v_event.time_slots) as slot(range_text)
       where p_slot_time >= split_part(slot.range_text, '-', 1)::time
         and p_slot_time < split_part(slot.range_text, '-', 2)::time
     ) then
    raise exception using errcode = '22023', message = 'INVALID_EVENT_TIME';
  end if;
  if exists (
    select 1 from public.event_schedule_bookings
    where event_id = p_event_id and lower(guest_email) = v_email
  ) then
    raise exception using errcode = 'P0001', message = 'EMAIL_ALREADY_BOOKED';
  end if;

  begin
    insert into public.event_schedule_bookings (
      org_id, event_id, guest_name, guest_email, booking_date, slot_time
    ) values (
      v_event.org_id, v_event.id, v_name, v_email, p_booking_date, p_slot_time
    ) returning id into v_booking_id;
  exception when unique_violation then
    get stacked diagnostics v_constraint = constraint_name;
    if v_constraint = 'event_schedule_one_booking_per_email_idx' then
      raise exception using errcode = 'P0001', message = 'EMAIL_ALREADY_BOOKED';
    end if;
    raise exception using errcode = 'P0001', message = 'SLOT_UNAVAILABLE';
  end;

  return v_booking_id;
end
$$;

revoke all on function public.book_event_schedule_slot(uuid, text, text, date, time) from public;
grant execute on function public.book_event_schedule_slot(uuid, text, text, date, time) to anon, authenticated;

create or replace function public.set_event_schedule_featured(p_event_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  select org_id into v_org_id
  from public.event_schedule_events
  where id = p_event_id;

  if v_org_id is null or not public.is_org_member(v_org_id) then
    raise exception using errcode = '42501', message = 'EVENT_ACCESS_DENIED';
  end if;

  update public.event_schedule_events
  set is_featured = false
  where org_id = v_org_id and is_featured and id <> p_event_id;

  update public.event_schedule_events
  set is_featured = true
  where id = p_event_id;
end
$$;

revoke all on function public.set_event_schedule_featured(uuid) from public, anon;
grant execute on function public.set_event_schedule_featured(uuid) to authenticated;

-- Atomic email claim used only by the confirmation edge function.
create or replace function public.claim_event_schedule_confirmation(p_booking_id uuid)
returns table(
  booking_id uuid,
  guest_name text,
  guest_email text,
  booking_date date,
  slot_time text,
  event_name text,
  event_location text,
  event_placement text,
  theme_color text
)
language sql
security definer
set search_path = public
as $$
  with claimed as (
    update public.event_schedule_bookings b
    set confirmation_claimed_at = now()
    where b.id = p_booking_id
      and b.confirmation_sent_at is null
      and (
        b.confirmation_claimed_at is null
        or b.confirmation_claimed_at < now() - interval '10 minutes'
      )
    returning b.*
  )
  select c.id, c.guest_name, c.guest_email, c.booking_date,
         to_char(c.slot_time, 'HH12:MI AM'), e.name, e.location,
         e.placement, e.theme_color
  from claimed c
  join public.event_schedule_events e on e.id = c.event_id
$$;

revoke all on function public.claim_event_schedule_confirmation(uuid) from public, anon, authenticated;
grant execute on function public.claim_event_schedule_confirmation(uuid) to service_role;

-- Enable authenticated admin refreshes when the hosted project has Realtime.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'event_schedule_events'
    ) then
      alter publication supabase_realtime add table public.event_schedule_events;
    end if;
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'event_schedule_bookings'
    ) then
      alter publication supabase_realtime add table public.event_schedule_bookings;
    end if;
  end if;
end
$$;

comment on table public.event_schedule_events is
  'Organization-owned public event schedules migrated from lv-branding-events.';
comment on table public.event_schedule_bookings is
  'Private scheduler registrations; public availability and creation use narrow RPCs.';

