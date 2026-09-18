-- Appointment approval, editing, cancellation, deletion, and calendar moves.

alter table public.appointment_bookings
  alter column status set default 'pending';

alter table public.appointment_booking_pages
  alter column confirmation_message set default 'Your appointment request has been received. We will email you as soon as it is approved.';
update public.appointment_booking_pages
set confirmation_message = 'Your appointment request has been received. We will email you as soon as it is approved.'
where confirmation_message = 'Your consultation is confirmed. We look forward to learning about your project.';

alter table public.appointment_bookings
  drop constraint if exists appointment_bookings_status_check;
alter table public.appointment_bookings
  add constraint appointment_bookings_status_check
  check (status in ('pending', 'confirmed', 'cancelled', 'completed', 'no_show'));

alter table public.appointment_bookings
  drop constraint if exists appointment_bookings_host_id_starts_at_key;
drop index if exists public.appointment_one_active_booking_per_email_idx;

create unique index appointment_one_active_booking_per_email_idx
  on public.appointment_bookings(page_id, lower(guest_email))
  where status in ('pending', 'confirmed');
create unique index appointment_one_active_booking_per_slot_idx
  on public.appointment_bookings(host_id, starts_at)
  where status in ('pending', 'confirmed');

-- Rename the existing seeded host without overwriting names an administrator
-- already customized.
update public.appointment_hosts
set display_name = 'LV Branding’s Team'
where is_default and display_name = 'Admin' and lower(email) = 'admin@lvbranding.com';

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
    select d.*, slot_start as starts_at,
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
      where b.host_id = s.host_id and b.status in ('pending', 'confirmed')
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

create or replace function public.manage_appointment_booking(
  p_booking_id uuid,
  p_action text,
  p_host_id uuid default null,
  p_guest_name text default null,
  p_guest_email text default null,
  p_guest_phone text default null,
  p_company text default null,
  p_project_notes text default null,
  p_starts_at timestamptz default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_booking public.appointment_bookings%rowtype;
  v_page public.appointment_booking_pages%rowtype;
  v_host public.appointment_hosts%rowtype;
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_start timestamptz;
  v_end timestamptz;
  v_local_start timestamp;
  v_local_end timestamp;
  v_name text;
  v_email text;
begin
  select * into v_booking from public.appointment_bookings where id = p_booking_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'APPOINTMENT_NOT_FOUND'; end if;
  if coalesce(public.org_role(v_booking.org_id), '') not in ('owner', 'admin') then
    raise exception using errcode = '42501', message = 'NOT_AUTHORIZED';
  end if;
  select * into v_page from public.appointment_booking_pages where id = v_booking.page_id;

  if v_action = 'delete' then
    delete from public.appointment_bookings where id = v_booking.id;
    return to_jsonb(v_booking);
  elsif v_action = 'cancel' then
    if v_booking.status in ('cancelled', 'completed', 'no_show') then return to_jsonb(v_booking); end if;
    update public.appointment_bookings set status = 'cancelled' where id = v_booking.id returning * into v_booking;
    return to_jsonb(v_booking);
  elsif v_action not in ('approve', 'update') then
    raise exception using errcode = '22023', message = 'INVALID_APPOINTMENT_ACTION';
  end if;

  if v_action = 'approve' and v_booking.status = 'confirmed' then return to_jsonb(v_booking); end if;
  if v_action = 'approve' and v_booking.status <> 'pending' then
    raise exception using errcode = '22023', message = 'ONLY_PENDING_APPOINTMENTS_CAN_BE_APPROVED';
  end if;
  if v_action = 'update' and v_booking.status not in ('pending', 'confirmed') then
    raise exception using errcode = '22023', message = 'INACTIVE_APPOINTMENT';
  end if;

  select * into v_host from public.appointment_hosts
  where id = coalesce(p_host_id, v_booking.host_id)
    and page_id = v_booking.page_id and is_enabled;
  if not found then raise exception using errcode = '22023', message = 'HOST_UNAVAILABLE'; end if;

  v_start := coalesce(p_starts_at, v_booking.starts_at);
  v_end := v_start + make_interval(mins => v_page.duration_minutes);
  v_local_start := v_start at time zone v_page.timezone;
  v_local_end := v_end at time zone v_page.timezone;
  if v_start <= now() then raise exception using errcode = '22023', message = 'APPOINTMENT_MUST_BE_IN_THE_FUTURE'; end if;
  if v_local_start::date <> v_local_end::date or not exists (
    select 1 from public.appointment_host_availability a
    where a.host_id = v_host.id
      and a.weekday = extract(isodow from v_local_start)::integer
      and a.start_time <= v_local_start::time and a.end_time >= v_local_end::time
  ) then raise exception using errcode = '22023', message = 'OUTSIDE_AVAILABLE_HOURS'; end if;
  if exists (
    select 1 from public.appointment_busy_blocks x
    where x.host_id = v_host.id
      and tstzrange(x.starts_at, x.ends_at, '[)') && tstzrange(v_start, v_end, '[)')
  ) or exists (
    select 1 from public.appointment_bookings b
    where b.id <> v_booking.id and b.host_id = v_host.id
      and b.status in ('pending', 'confirmed')
      and tstzrange(b.starts_at, b.ends_at, '[)') && tstzrange(v_start, v_end, '[)')
  ) then raise exception using errcode = 'P0001', message = 'SLOT_UNAVAILABLE'; end if;

  if v_action = 'approve' then
    update public.appointment_bookings set status = 'confirmed' where id = v_booking.id returning * into v_booking;
    return to_jsonb(v_booking);
  end if;

  v_name := btrim(coalesce(p_guest_name, v_booking.guest_name));
  v_email := lower(btrim(coalesce(p_guest_email, v_booking.guest_email)));
  if char_length(v_name) not between 1 and 160 then raise exception using errcode = '22023', message = 'INVALID_GUEST_NAME'; end if;
  if char_length(v_email) < 3 or char_length(v_email) > 320
     or v_email !~* '^[A-Z0-9.!#$%&''*+/=?^_`{|}~-]+@[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?(?:\.[A-Z0-9](?:[A-Z0-9-]{0,61}[A-Z0-9])?)+$' then
    raise exception using errcode = '22023', message = 'INVALID_GUEST_EMAIL';
  end if;
  update public.appointment_bookings set
    host_id = v_host.id, guest_name = v_name, guest_email = v_email,
    guest_phone = case when p_guest_phone is null then v_booking.guest_phone else nullif(btrim(p_guest_phone), '') end,
    company = case when p_company is null then v_booking.company else nullif(btrim(p_company), '') end,
    project_notes = case when p_project_notes is null then v_booking.project_notes else nullif(btrim(p_project_notes), '') end,
    starts_at = v_start, ends_at = v_end
  where id = v_booking.id returning * into v_booking;
  return to_jsonb(v_booking);
exception when unique_violation then
  raise exception using errcode = 'P0001', message = 'SLOT_OR_EMAIL_ALREADY_BOOKED';
end
$$;

revoke all on function public.manage_appointment_booking(uuid, text, uuid, text, text, text, text, text, timestamptz) from public;
grant execute on function public.manage_appointment_booking(uuid, text, uuid, text, text, text, text, text, timestamptz) to authenticated;

-- Preserve the public RPC while making duplicate pending requests report the
-- same email-specific error as confirmed requests.
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
    if exists (
      select 1 from public.appointment_bookings
      where page_id = v_page.id and lower(guest_email) = v_email
        and status in ('pending', 'confirmed')
    ) then
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
          'Website consultation requested with ' || v_host.display_name,
          jsonb_build_object('appointment_booking_id', v_booking_id, 'starts_at', p_starts_at));

  return v_booking_id;
end
$$;

revoke all on function public.book_public_appointment(text, uuid, text, text, text, text, text, timestamptz) from public;
grant execute on function public.book_public_appointment(text, uuid, text, text, text, text, text, timestamptz) to service_role;
