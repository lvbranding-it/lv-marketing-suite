-- Initial page setup must not restore weekdays an administrator intentionally
-- removed. Default hours are seeded only when the default host is first made.
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
            'LV Branding’s Team', lower(p_admin_email), true)
    returning id into v_host_id;

    insert into public.appointment_host_availability(host_id, org_id, weekday, start_time, end_time)
    select v_host_id, p_org_id, weekday, '09:00'::time, '17:00'::time
    from generate_series(1, 5) weekday;
  end if;

  return v_page_id;
end
$$;

revoke all on function public.ensure_appointment_booking_page(uuid, text, text) from public;
grant execute on function public.ensure_appointment_booking_page(uuid, text, text) to authenticated;
