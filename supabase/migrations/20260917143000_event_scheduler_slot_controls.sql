-- Configurable appointment duration and administrator-controlled blocked slots.

alter table public.event_schedule_events
  add column if not exists slot_duration_minutes integer not null default 5;

alter table public.event_schedule_events
  drop constraint if exists event_schedule_events_slot_duration_check;
alter table public.event_schedule_events
  add constraint event_schedule_events_slot_duration_check
  check (slot_duration_minutes between 5 and 240 and mod(slot_duration_minutes, 5) = 0);

create table if not exists public.event_schedule_blocked_slots (
  id           uuid primary key default gen_random_uuid(),
  org_id       uuid not null references public.organizations(id) on delete cascade,
  event_id     uuid not null references public.event_schedule_events(id) on delete cascade,
  booking_date date not null,
  slot_time    time without time zone not null,
  reason       text,
  created_by   uuid references auth.users(id) on delete set null default auth.uid(),
  created_at   timestamptz not null default now(),
  unique (event_id, booking_date, slot_time)
);

create index if not exists event_schedule_blocked_slots_org_date_idx
  on public.event_schedule_blocked_slots (org_id, booking_date, slot_time);

alter table public.event_schedule_blocked_slots enable row level security;

create policy "event_schedule_member_read_blocked_slots"
  on public.event_schedule_blocked_slots for select
  to authenticated
  using (public.is_org_member(org_id));

grant select on public.event_schedule_blocked_slots to authenticated;

create or replace function public.event_schedule_slot_valid(
  p_ranges text[],
  p_duration_minutes integer,
  p_slot_time time without time zone
)
returns boolean
language sql
immutable
set search_path = public
as $$
  select extract(second from p_slot_time) = 0
    and exists (
      select 1
      from unnest(p_ranges) as slot(range_text)
      where p_slot_time >= split_part(slot.range_text, '-', 1)::time
        and p_slot_time + make_interval(mins => p_duration_minutes)
              <= split_part(slot.range_text, '-', 2)::time
        and mod(
          (extract(epoch from (
            p_slot_time - split_part(slot.range_text, '-', 1)::time
          )) / 60)::integer,
          p_duration_minutes
        ) = 0
    )
$$;

-- Public availability merges booked and manually blocked slots, still without
-- exposing guest data or the internal reason for an administrative block.
create or replace function public.event_schedule_booked_slots(p_event_id uuid)
returns table(booking_date date, slot_time text)
language sql
stable
security definer
set search_path = public
as $$
  select occupied.booking_date, occupied.slot_time
  from (
    select b.booking_date, to_char(b.slot_time, 'HH24:MI') as slot_time
    from public.event_schedule_bookings b
    join public.event_schedule_events e on e.id = b.event_id
    where b.event_id = p_event_id and e.is_active
    union
    select s.booking_date, to_char(s.slot_time, 'HH24:MI') as slot_time
    from public.event_schedule_blocked_slots s
    join public.event_schedule_events e on e.id = s.event_id
    where s.event_id = p_event_id and e.is_active
  ) occupied
  order by occupied.booking_date, occupied.slot_time
$$;

revoke all on function public.event_schedule_booked_slots(uuid) from public;
grant execute on function public.event_schedule_booked_slots(uuid) to anon, authenticated;

-- Recreate booking with duration-aware alignment and serialization against
-- simultaneous admin blocks for the same event.
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
  for update;

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
  if not public.event_schedule_slot_valid(
    v_event.time_slots, v_event.slot_duration_minutes, p_slot_time
  ) then
    raise exception using errcode = '22023', message = 'INVALID_EVENT_TIME';
  end if;
  if exists (
    select 1 from public.event_schedule_blocked_slots
    where event_id = p_event_id
      and booking_date = p_booking_date
      and slot_time = p_slot_time
  ) then
    raise exception using errcode = 'P0001', message = 'SLOT_UNAVAILABLE';
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

create or replace function public.set_event_schedule_slot_blocked(
  p_event_id uuid,
  p_booking_date date,
  p_slot_time time without time zone,
  p_blocked boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event public.event_schedule_events%rowtype;
begin
  select * into v_event
  from public.event_schedule_events
  where id = p_event_id
  for update;

  if not found or not public.is_org_member(v_event.org_id) then
    raise exception using errcode = '42501', message = 'EVENT_ACCESS_DENIED';
  end if;
  if not (p_booking_date = any(v_event.dates)) then
    raise exception using errcode = '22023', message = 'INVALID_EVENT_DATE';
  end if;
  if not public.event_schedule_slot_valid(
    v_event.time_slots, v_event.slot_duration_minutes, p_slot_time
  ) then
    raise exception using errcode = '22023', message = 'INVALID_EVENT_TIME';
  end if;

  if p_blocked then
    if exists (
      select 1 from public.event_schedule_bookings
      where event_id = p_event_id
        and booking_date = p_booking_date
        and slot_time = p_slot_time
    ) then
      raise exception using errcode = 'P0001', message = 'SLOT_ALREADY_BOOKED';
    end if;
    insert into public.event_schedule_blocked_slots (
      org_id, event_id, booking_date, slot_time
    ) values (
      v_event.org_id, p_event_id, p_booking_date, p_slot_time
    ) on conflict (event_id, booking_date, slot_time) do nothing;
  else
    delete from public.event_schedule_blocked_slots
    where event_id = p_event_id
      and booking_date = p_booking_date
      and slot_time = p_slot_time;
  end if;
end
$$;

revoke all on function public.set_event_schedule_slot_blocked(uuid, date, time, boolean)
  from public, anon;
grant execute on function public.set_event_schedule_slot_blocked(uuid, date, time, boolean)
  to authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime'
         and schemaname = 'public'
         and tablename = 'event_schedule_blocked_slots'
     ) then
    alter publication supabase_realtime add table public.event_schedule_blocked_slots;
  end if;
end
$$;

comment on table public.event_schedule_blocked_slots is
  'Administrator-blocked scheduler availability; public callers see only occupied date/time pairs.';
