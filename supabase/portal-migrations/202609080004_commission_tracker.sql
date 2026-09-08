-- Manual tracking only. Does not calculate commissions or execute payments.
begin;
create table public.portal_commissions (
 id uuid primary key default gen_random_uuid(),
 org_id uuid not null references public.organizations(id),
 ambassador_id uuid not null,
 title text not null check(length(trim(title)) between 1 and 200),
 kind text not null check(kind in ('direct','connection')),
 amount_cents bigint not null check(amount_cents between 0 and 99999999999),
 currency text not null default 'USD' check(currency='USD'),
 status text not null check(status in ('projected','accrued','under_review','approved','scheduled','paid','reversed','disputed','void')),
 plan_reference text not null check(length(trim(plan_reference)) between 1 and 250),
 notes text not null default '' check(length(notes)<=4000),
 payment_date date,
 payment_reference text not null default '' check(length(payment_reference)<=250),
 version integer not null default 1,
 updated_at timestamptz not null default now(),
 created_at timestamptz not null default now(),
 foreign key(org_id,ambassador_id) references public.portal_memberships(org_id,user_id),
 check(status not in ('scheduled','paid') or payment_date is not null),
 check(status <> 'paid' or length(trim(payment_reference))>0)
);
create index portal_commissions_recipient on public.portal_commissions(org_id,ambassador_id,created_at desc);
create table public.portal_commission_history (
 id uuid primary key default gen_random_uuid(),
 commission_id uuid not null references public.portal_commissions(id),
 org_id uuid not null references public.organizations(id),
 actor_id uuid not null references auth.users(id),
 reason text not null check(length(trim(reason)) between 1 and 1000),
 before_record jsonb, after_record jsonb not null,
 created_at timestamptz not null default now()
);
alter table public.portal_commissions enable row level security;
alter table public.portal_commission_history enable row level security;
revoke all on public.portal_commissions,public.portal_commission_history from anon,authenticated;
grant select on public.portal_commissions,public.portal_commission_history to authenticated;
create policy commission_read on public.portal_commissions for select to authenticated using (
 public.portal_is_admin(org_id) or (
 ambassador_id=auth.uid() and public.portal_role(org_id) in ('ambassador','business_developer')
 ));
create policy commission_history_admin on public.portal_commission_history for select to authenticated using(public.portal_is_admin(org_id));

create function public.portal_save_commission(p_org uuid,p_record jsonb,p_id uuid default null,p_version integer default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare old_row public.portal_commissions; new_row public.portal_commissions; recipient uuid;
begin
 if not public.portal_is_admin(p_org) then raise exception 'Not authorized' using errcode='42501'; end if;
 if jsonb_typeof(p_record) <> 'object' or p_record is null then raise exception 'Invalid record'; end if;
 if exists(select 1 from jsonb_object_keys(p_record) k where k not in
 ('ambassador_id','title','kind','amount_cents','status','plan_reference','notes','payment_date','payment_reference','reason'))
 then raise exception 'Unsupported field'; end if;
 if length(trim(coalesce(p_record->>'reason',''))) not between 1 and 1000 then raise exception 'Audit reason required'; end if;
 if coalesce(p_record->>'amount_cents','') !~ '^[0-9]+$' then raise exception 'Invalid amount'; end if;
 recipient:=(p_record->>'ambassador_id')::uuid;
 if p_id is not null then
  select * into old_row from public.portal_commissions where id=p_id and org_id=p_org for update;
  if not found then raise exception 'Not authorized' using errcode='42501'; end if;
  if p_version is null or old_row.version<>p_version then raise exception 'Record changed; refresh before saving' using errcode='40001'; end if;
  if old_row.ambassador_id<>recipient then raise exception 'Recipient cannot be changed; void and create a corrected record'; end if;
  if old_row.status in ('paid','reversed','void') then raise exception 'Final records are locked; use a separate reviewed adjustment'; end if;
 end if;
 if not exists(select 1 from public.portal_memberships where org_id=p_org and user_id=recipient and active and role in ('ambassador','business_developer'))
 then raise exception 'Active representative required'; end if;
 if p_id is null then
 insert into public.portal_commissions(org_id,ambassador_id,title,kind,amount_cents,status,plan_reference,notes,payment_date,payment_reference)
 values(p_org,recipient,p_record->>'title',p_record->>'kind',(p_record->>'amount_cents')::bigint,p_record->>'status',p_record->>'plan_reference',coalesce(p_record->>'notes',''),nullif(p_record->>'payment_date','')::date,coalesce(p_record->>'payment_reference',''))
 returning * into new_row;
 else
 update public.portal_commissions set title=p_record->>'title',kind=p_record->>'kind',amount_cents=(p_record->>'amount_cents')::bigint,
 status=p_record->>'status',plan_reference=p_record->>'plan_reference',notes=coalesce(p_record->>'notes',''),
 payment_date=nullif(p_record->>'payment_date','')::date,payment_reference=coalesce(p_record->>'payment_reference',''),
 version=version+1,updated_at=now() where id=p_id returning * into new_row;
 end if;
 insert into public.portal_commission_history(commission_id,org_id,actor_id,reason,before_record,after_record)
 values(new_row.id,p_org,auth.uid(),p_record->>'reason',case when p_id is null then null else to_jsonb(old_row) end,to_jsonb(new_row));
 return new_row.id;
end; $$;
revoke all on function public.portal_save_commission(uuid,jsonb,uuid,integer) from public,anon;
grant execute on function public.portal_save_commission(uuid,jsonb,uuid,integer) to authenticated;
commit;
