begin;
-- Preserve removed internal memberships for administrator review; never expose them to clients.
create table public.portal_internal_membership_archive (
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id),
 membership jsonb not null,
 source_table text not null,
 archived_at timestamptz not null default now()
);
alter table public.portal_internal_membership_archive enable row level security;
revoke all on public.portal_internal_membership_archive from public,anon,authenticated;

create function public.portal_is_representative(p_user uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.portal_memberships where user_id=p_user and role in ('ambassador','business_developer'));
$$;
revoke all on function public.portal_is_representative(uuid) from public,anon,authenticated;
create function public.portal_account_restricted() returns boolean
language sql stable security definer set search_path='' as $$
 select public.portal_is_representative(auth.uid());
$$;
revoke all on function public.portal_account_restricted() from public,anon;
grant execute on function public.portal_account_restricted() to authenticated;

create or replace function public.portal_is_admin(p_org uuid) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and not public.portal_is_representative(auth.uid())
 and exists(select 1 from public.team_members where org_id=p_org and user_id=auth.uid() and role::text in ('owner','admin'));
$$;
create or replace function public.portal_role(p_org uuid) returns text language sql stable security definer set search_path='' as $$
 select case when public.portal_is_representative(auth.uid()) then
 (select role from public.portal_memberships where org_id=p_org and user_id=auth.uid() and active)
 when public.portal_is_admin(p_org) then 'admin' else
 (select role from public.portal_memberships where org_id=p_org and user_id=auth.uid() and active) end;
$$;

create function public.portal_remove_internal_access() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.role not in ('ambassador','business_developer') then return new; end if;
 insert into public.portal_internal_membership_archive(user_id,membership,source_table)
 select user_id,to_jsonb(t),'team_members' from public.team_members t where user_id=new.user_id;
 delete from public.team_members where user_id=new.user_id;
 if to_regclass('public.branch_team_members') is not null then
 execute 'insert into public.portal_internal_membership_archive(user_id,membership,source_table)
 select user_id,to_jsonb(t),''branch_team_members'' from public.branch_team_members t where user_id=$1' using new.user_id;
 execute 'delete from public.branch_team_members where user_id=$1' using new.user_id;
 end if;
 return new;
end; $$;
revoke all on function public.portal_remove_internal_access() from public,anon,authenticated;
create trigger portal_representative_internal_access after insert or update of role on public.portal_memberships
 for each row execute function public.portal_remove_internal_access();

-- Block direct API attempts to recreate internal memberships or workspaces.
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

-- Repair existing representative accounts using the same audited preservation path.
update public.portal_memberships set role=role where role in ('ambassador','business_developer');
commit;
