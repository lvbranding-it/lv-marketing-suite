-- Atomically claim a single first-portal-entry welcome per authenticated ambassador.
begin;
create table public.portal_welcome_seen (
 user_id uuid primary key references auth.users(id) on delete cascade,
 seen_at timestamptz not null default now()
);
alter table public.portal_welcome_seen enable row level security;
revoke all on public.portal_welcome_seen from public,anon,authenticated;
create function public.portal_claim_welcome(p_org uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare claimed uuid;
begin
 if public.portal_role(p_org) not in ('ambassador','business_developer') or public.portal_role(p_org) is null then
  raise exception 'Not authorized' using errcode='42501';
 end if;
 insert into public.portal_welcome_seen(user_id) values(auth.uid())
 on conflict do nothing returning user_id into claimed;
 return claimed is not null;
end; $$;
revoke all on function public.portal_claim_welcome(uuid) from public,anon;
grant execute on function public.portal_claim_welcome(uuid) to authenticated;
commit;
