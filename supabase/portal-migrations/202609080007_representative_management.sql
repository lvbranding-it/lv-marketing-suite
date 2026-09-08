-- Representative invitation lifecycle and delivery metadata.
begin;

alter table public.portal_invitations
  add column if not exists last_sent_at timestamptz,
  add column if not exists send_count integer not null default 0
    check (send_count between 0 and 10000);

create function public.portal_replace_invitation(
  p_id uuid,
  p_email text,
  p_name text,
  p_role text
) returns table(invitation_id uuid, token text)
language plpgsql security definer set search_path='' as $$
declare
  previous public.portal_invitations;
  raw_token text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-','');
  email text:=lower(trim(p_email));
  new_id uuid;
begin
  select * into previous from public.portal_invitations where id=p_id for update;
  if previous.id is null or not public.portal_is_admin(previous.org_id) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if previous.accepted_at is not null then
    raise exception 'Accepted invitations cannot be replaced' using errcode='22023';
  end if;
  perform public.portal_throttle();
  perform pg_advisory_xact_lock(hashtextextended(previous.org_id::text||':'||email,0));
  update public.portal_invitations set cancelled_at=coalesce(cancelled_at,now())
    where id=previous.id;
  update public.portal_invitations set cancelled_at=now()
    where org_id=previous.org_id and invited_email=email
      and accepted_at is null and cancelled_at is null;
  insert into public.portal_invitations(
    org_id,invited_email,display_name,role,token_digest,invited_by
  ) values(
    previous.org_id,email,trim(p_name),p_role,
    encode(sha256(convert_to(raw_token,'UTF8')),'hex'),auth.uid()
  ) returning id into new_id;
  insert into public.portal_audit_events(org_id,actor_id,action,detail)
    values(previous.org_id,auth.uid(),'invitation_replaced',
      jsonb_build_object('previous_invitation_id',previous.id,'invitation_id',new_id,'role',p_role));
  return query select new_id,raw_token;
end; $$;

create function public.portal_delete_invitation(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare inv public.portal_invitations;
begin
  select * into inv from public.portal_invitations where id=p_id for update;
  if inv.id is null or not public.portal_is_admin(inv.org_id) then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  if inv.accepted_at is not null then
    raise exception 'Accepted invitations are retained for audit' using errcode='22023';
  end if;
  perform public.portal_throttle();
  delete from public.portal_invitations where id=inv.id;
  insert into public.portal_audit_events(org_id,actor_id,action,detail)
    values(inv.org_id,auth.uid(),'invitation_deleted',
      jsonb_build_object('invitation_id',inv.id,'email',inv.invited_email,'role',inv.role));
end; $$;

create function public.portal_mark_invitation_sent(p_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare inv public.portal_invitations;
begin
  select * into inv from public.portal_invitations where id=p_id for update;
  if inv.id is null or not public.portal_is_admin(inv.org_id)
    or inv.accepted_at is not null or inv.cancelled_at is not null then
    raise exception 'Not authorized' using errcode='42501';
  end if;
  update public.portal_invitations
    set last_sent_at=now(),send_count=send_count+1 where id=inv.id;
  insert into public.portal_audit_events(org_id,actor_id,action,detail)
    values(inv.org_id,auth.uid(),'invitation_emailed',
      jsonb_build_object('invitation_id',inv.id,'send_count',inv.send_count+1));
end; $$;

revoke all on function
  public.portal_replace_invitation(uuid,text,text,text),
  public.portal_delete_invitation(uuid),
  public.portal_mark_invitation_sent(uuid)
from public,anon;
grant execute on function
  public.portal_replace_invitation(uuid,text,text,text),
  public.portal_delete_invitation(uuid),
  public.portal_mark_invitation_sent(uuid)
to authenticated;

grant select(last_sent_at,send_count) on public.portal_invitations to authenticated;

commit;
