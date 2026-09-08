-- General advisor mode requires portal access, but never a lead or project.
begin;
alter table public.profiles add column if not exists first_name text;
alter table public.profiles add column if not exists preferred_first_name text;
create function public.portal_advisor_session(p_org uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare member_role text; first text;
begin
 member_role:=public.portal_role(p_org);
 if member_role is null then raise exception 'Not authorized' using errcode='42501'; end if;
 perform public.portal_throttle();
 select coalesce(nullif(trim(preferred_first_name),''),nullif(trim(first_name),'')) into first from public.profiles where id=auth.uid();
 return jsonb_build_object('role',member_role,'first_name',left(first,80));
end; $$;
revoke all on function public.portal_advisor_session(uuid) from public,anon;
grant execute on function public.portal_advisor_session(uuid) to authenticated;
commit;
