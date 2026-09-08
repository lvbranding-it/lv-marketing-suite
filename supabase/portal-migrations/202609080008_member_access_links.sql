-- Secure portal access-link delivery for representatives who already accepted an invitation.
begin;

alter table public.portal_memberships
  add column if not exists last_access_sent_at timestamptz,
  add column if not exists access_send_count integer not null default 0
    check (access_send_count between 0 and 10000);

create function public.portal_member_access_recipient(p_org uuid,p_user uuid)
returns table(email text,display_name text)
language plpgsql security definer set search_path='' as $$
begin
  if not public.portal_is_admin(p_org) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  perform public.portal_throttle();
  return query
    select lower(u.email),m.display_name
    from public.portal_memberships m
    join auth.users u on u.id=m.user_id
    where m.org_id=p_org and m.user_id=p_user and m.active and u.email is not null;
  if not found then
    raise exception 'Representative unavailable' using errcode='42501';
  end if;
end; $$;

create function public.portal_mark_member_access_sent(p_org uuid,p_user uuid)
returns void language plpgsql security definer set search_path='' as $$
declare sent_count integer;
begin
  if not public.portal_is_admin(p_org) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  update public.portal_memberships
    set last_access_sent_at=now(),access_send_count=access_send_count+1
    where org_id=p_org and user_id=p_user and active
    returning access_send_count into sent_count;
  if sent_count is null then
    raise exception 'Representative unavailable' using errcode='42501';
  end if;
  insert into public.portal_audit_events(org_id,actor_id,action,detail)
    values(p_org,auth.uid(),'member_access_emailed',
      jsonb_build_object('user_id',p_user,'send_count',sent_count));
end; $$;

revoke all on function
  public.portal_member_access_recipient(uuid,uuid),
  public.portal_mark_member_access_sent(uuid,uuid)
from public,anon;
grant execute on function
  public.portal_member_access_recipient(uuid,uuid),
  public.portal_mark_member_access_sent(uuid,uuid)
to authenticated;

grant select(last_access_sent_at,access_send_count)
  on public.portal_memberships to authenticated;

commit;
