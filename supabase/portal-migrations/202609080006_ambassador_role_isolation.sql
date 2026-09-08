begin;
-- No bulk role revocation. Existing legitimate same-org administrators remain administrators.
create function public.portal_account_restricted() returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.portal_memberships p where p.user_id=auth.uid() and p.role in ('ambassador','business_developer'))
 and not exists(select 1 from public.portal_memberships p join public.team_members t on t.org_id=p.org_id and t.user_id=p.user_id
 where p.user_id=auth.uid() and t.role::text in ('owner','admin'));
$$;
revoke all on function public.portal_account_restricted() from public,anon;
grant execute on function public.portal_account_restricted() to authenticated;
create or replace function public.portal_is_admin(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and not public.portal_account_restricted()
 and exists(select 1 from public.team_members where org_id=p_org and user_id=auth.uid() and role::text in ('owner','admin'));
$$;
create policy portal_representatives_no_team_access on public.team_members as restrictive for all to authenticated
 using(not public.portal_account_restricted()) with check(not public.portal_account_restricted());
create policy portal_representatives_no_org_access on public.organizations as restrictive for all to authenticated
 using(not public.portal_account_restricted()) with check(not public.portal_account_restricted());
do $$ begin
 if to_regclass('public.branch_team_members') is not null then
 execute 'create policy portal_representatives_no_branch_access on public.branch_team_members as restrictive for all to authenticated using(not public.portal_account_restricted()) with check(not public.portal_account_restricted())';
 end if;
end $$;
-- An invitation recipient should not receive a new personal owner workspace at signup.
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path='' as $$
declare new_org_id uuid; user_name text;
begin
 user_name:=coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1));
 insert into public.profiles(id,full_name) values(new.id,user_name);
 if exists(select 1 from public.portal_invitations where invited_email=lower(trim(new.email))
 and cancelled_at is null and accepted_at is null and expires_at>now()) then return new; end if;
 insert into public.organizations(name,owner_user_id) values(user_name||'''s Workspace',new.id) returning id into new_org_id;
 insert into public.team_members(org_id,user_id,role) values(new_org_id,new.id,'owner');
 return new;
end; $$;


create table public.portal_access_corrections (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 previous_membership jsonb not null,
 reason text not null,
 corrected_at timestamptz not null default now()
);
alter table public.portal_access_corrections enable row level security;
revoke all on public.portal_access_corrections from public,anon,authenticated;
commit;
