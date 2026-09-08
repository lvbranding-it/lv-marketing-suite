-- Requires portal foundation. Tokens are issued once and only their SHA-256 digest is stored.
begin;
create table public.portal_invitations (
 id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id),
 invited_email text not null, display_name text not null check(length(trim(display_name)) between 1 and 120),
 role text not null check(role in ('ambassador','business_developer','staff')),
 token_digest text not null unique, invited_by uuid not null references auth.users(id),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '7 days',
 accepted_at timestamptz, accepted_by uuid references auth.users(id), cancelled_at timestamptz,
 check(length(invited_email)<=320 and invited_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$')
);
create unique index portal_invitations_pending on public.portal_invitations(org_id,invited_email) where accepted_at is null and cancelled_at is null;
create index portal_invitations_org on public.portal_invitations(org_id,created_at desc);
alter table public.portal_invitations enable row level security;
create policy portal_invitations_admin_read on public.portal_invitations for select to authenticated using(public.portal_is_admin(org_id));
revoke all on public.portal_invitations from public,anon,authenticated;
grant select(id,org_id,invited_email,display_name,role,invited_by,created_at,expires_at,accepted_at,cancelled_at) on public.portal_invitations to authenticated;

create table public.portal_request_limits (
 user_id uuid primary key references auth.users(id), window_started timestamptz not null, requests integer not null
);
alter table public.portal_request_limits enable row level security;
revoke all on public.portal_request_limits from public,anon,authenticated;
create function public.portal_throttle() returns void language plpgsql security definer set search_path='' as $$
declare used integer; window_at timestamptz:=date_trunc('minute',clock_timestamp());
begin
 if auth.uid() is null then raise exception 'Not authorized' using errcode='42501'; end if;
 insert into public.portal_request_limits(user_id,window_started,requests) values(auth.uid(),window_at,1)
 on conflict(user_id) do update set window_started=excluded.window_started,
 requests=case when public.portal_request_limits.window_started=excluded.window_started then public.portal_request_limits.requests+1 else 1 end
 returning requests into used;
 if used>30 then raise exception 'Please wait before trying again' using errcode='P0429'; end if;
end; $$;
revoke all on function public.portal_throttle() from public,anon,authenticated;

create function public.portal_create_invitation(p_org uuid,p_email text,p_name text,p_role text)
 returns table(invitation_id uuid,token text) language plpgsql security definer set search_path='' as $$
declare raw_token text:=replace(gen_random_uuid()::text||gen_random_uuid()::text,'-',''); email text:=lower(trim(p_email)); new_id uuid;
begin
 if not public.portal_is_admin(p_org) then raise exception 'Not authorized' using errcode='42501'; end if;
 perform public.portal_throttle();
 -- Serialize invitations for the same target; renewing a link cancels its predecessor.
 perform pg_advisory_xact_lock(hashtextextended(p_org::text||':'||email,0));
 update public.portal_invitations set cancelled_at=now() where org_id=p_org and invited_email=email and accepted_at is null and cancelled_at is null;
 insert into public.portal_invitations(org_id,invited_email,display_name,role,token_digest,invited_by)
 values(p_org,email,trim(p_name),p_role,encode(sha256(convert_to(raw_token,'UTF8')),'hex'),auth.uid()) returning id into new_id;
 insert into public.portal_audit_events(org_id,actor_id,action,detail) values(p_org,auth.uid(),'invitation_created',jsonb_build_object('invitation_id',new_id,'role',p_role));
 return query select new_id,raw_token;
end; $$;
create function public.portal_cancel_invitation(p_id uuid) returns void language plpgsql security definer set search_path='' as $$
declare inv public.portal_invitations;
begin
 select * into inv from public.portal_invitations where id=p_id for update;
 if inv.id is null or not public.portal_is_admin(inv.org_id) then raise exception 'Not authorized' using errcode='42501'; end if;
 perform public.portal_throttle();
 if inv.accepted_at is not null then raise exception 'Invitation already accepted' using errcode='22023'; end if;
 update public.portal_invitations set cancelled_at=coalesce(cancelled_at,now()) where id=p_id;
 insert into public.portal_audit_events(org_id,actor_id,action,detail) values(inv.org_id,auth.uid(),'invitation_cancelled',jsonb_build_object('invitation_id',p_id));
end; $$;
create function public.portal_invitation_details(p_token text)
 returns table(org_name text,role text,display_name text,expires_at timestamptz) language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 return query select o.name,i.role,i.display_name,i.expires_at from public.portal_invitations i join public.organizations o on o.id=i.org_id
 join auth.users u on u.id=auth.uid() and lower(u.email)=i.invited_email and u.email_confirmed_at is not null
 where i.token_digest=encode(sha256(convert_to(p_token,'UTF8')),'hex') and i.cancelled_at is null and i.accepted_at is null and i.expires_at>now();
 if not found then raise exception 'Invitation unavailable' using errcode='42501'; end if;
end; $$;
create function public.portal_accept_invitation(p_token text) returns uuid language plpgsql security definer set search_path='' as $$
declare inv public.portal_invitations; verified_email text;
begin
 if auth.uid() is null or p_token !~ '^[a-f0-9]{64}$' then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 select lower(email) into verified_email from auth.users where id=auth.uid() and email_confirmed_at is not null;
 select * into inv from public.portal_invitations where token_digest=encode(sha256(convert_to(p_token,'UTF8')),'hex') for update;
 if verified_email is null or inv.id is null or inv.invited_email<>verified_email or inv.cancelled_at is not null or inv.expires_at<=now()
 then raise exception 'Invitation unavailable' using errcode='42501'; end if;
 perform public.portal_throttle();
 if inv.accepted_at is not null then
   if inv.accepted_by=auth.uid() and exists(select 1 from public.portal_memberships where org_id=inv.org_id and user_id=auth.uid() and active) then return inv.org_id; end if;
   raise exception 'Invitation unavailable' using errcode='42501';
 end if;
 -- A stale invitation cannot change an existing member's role or reactivate revoked access.
 if exists(select 1 from public.portal_memberships where org_id=inv.org_id and user_id=auth.uid())
 then raise exception 'Membership already exists. Contact your administrator.' using errcode='22023'; end if;
 insert into public.portal_memberships(org_id,user_id,role,display_name) values(inv.org_id,auth.uid(),inv.role,inv.display_name);
 update public.portal_invitations set accepted_at=now(),accepted_by=auth.uid() where id=inv.id;
 insert into public.portal_audit_events(org_id,actor_id,action,detail) values(inv.org_id,auth.uid(),'invitation_accepted',jsonb_build_object('invitation_id',inv.id,'role',inv.role));
 return inv.org_id;
end; $$;
revoke all on function public.portal_create_invitation(uuid,text,text,text),public.portal_cancel_invitation(uuid),public.portal_invitation_details(text),public.portal_accept_invitation(text) from public,anon;
grant execute on function public.portal_create_invitation(uuid,text,text,text),public.portal_cancel_invitation(uuid),public.portal_invitation_details(text),public.portal_accept_invitation(text) to authenticated;
commit;
