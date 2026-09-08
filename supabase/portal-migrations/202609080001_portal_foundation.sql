-- Isolated additive portal migration. See docs/portal/DEPLOYMENT.md.
-- Dependencies: public.organizations, public.team_members, auth.users, auth.uid().
-- Does not alter legacy contacts, roles, invitations, or migration history.
begin;

create table public.portal_memberships (
  org_id uuid not null references public.organizations(id),
  user_id uuid not null references auth.users(id),
  role text not null check (role in ('ambassador','business_developer','staff')),
  display_name text not null check (length(display_name) between 1 and 120),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (org_id,user_id)
);
create table public.portal_leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organizations(id),
  attributed_user_id uuid not null references auth.users(id),
  created_by uuid not null references auth.users(id),
  assigned_user_id uuid,
  first_name text not null default '', last_name text not null default '',
  company text not null default '', email text not null default '', phone text not null default '',
  website text not null default '', source text not null default '', service text not null default '',
  summary text not null default '', language text not null default 'unknown' check (language in ('en','es','unknown')),
  priority text not null default 'normal' check (priority in ('low','normal','high')),
  next_action text not null default '', followup_at timestamptz,
  shared_stage text not null default 'draft' check (shared_stage in ('draft','new','contact_needed','contacted','discovery_scheduled','qualified','proposal_preparation','proposal_sent','negotiation','won','lost','on_hold','not_a_fit')),
  submitted_at timestamptz, archived_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  version integer not null default 1,
  unique (org_id,id),
  foreign key (org_id,assigned_user_id) references public.portal_memberships(org_id,user_id),
  check (length(summary) <= 10000 and length(first_name) <= 120 and length(last_name) <= 120
    and length(company) <= 250 and length(email) <= 320 and length(phone) <= 80
    and length(website) <= 2000 and length(source) <= 250 and length(service) <= 250 and length(next_action) <= 2000)
);
create table public.portal_sales (
  lead_id uuid primary key references public.portal_leads(id),
  stage text not null default 'new' check (stage in ('new','contact_needed','contacted','discovery_scheduled','qualified','proposal_preparation','proposal_sent','negotiation','won','lost','on_hold','not_a_fit')),
  updated_at timestamptz not null default now()
);
create table public.portal_notes (
  id uuid primary key default gen_random_uuid(), lead_id uuid not null references public.portal_leads(id),
  author_id uuid not null references auth.users(id),
  visibility text not null check (visibility in ('personal','shared','internal')),
  body text not null check (length(trim(body)) between 1 and 10000),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.portal_note_revisions (
  id uuid primary key default gen_random_uuid(), note_id uuid not null references public.portal_notes(id),
  body text not null, replaced_at timestamptz not null default now()
);
create table public.portal_activities (
  id uuid primary key default gen_random_uuid(), lead_id uuid not null references public.portal_leads(id),
  actor_id uuid not null references auth.users(id), action text not null,
  visibility text not null default 'shared' check (visibility in ('shared','internal','personal')),
  detail jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.portal_audit_events (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id),
  actor_id uuid not null references auth.users(id), lead_id uuid references public.portal_leads(id),
  action text not null, detail jsonb not null default '{}', created_at timestamptz not null default now()
);
create table public.portal_notifications (
  id uuid primary key default gen_random_uuid(), org_id uuid not null references public.organizations(id),
  recipient_id uuid not null references auth.users(id), lead_id uuid not null references public.portal_leads(id),
  kind text not null, created_at timestamptz not null default now(), read_at timestamptz
);
create index portal_leads_owner on public.portal_leads(org_id,attributed_user_id,created_at desc);
create index portal_leads_assigned on public.portal_leads(org_id,assigned_user_id);
create index portal_leads_followup on public.portal_leads(org_id,followup_at) where archived_at is null;
create index portal_notes_lead on public.portal_notes(lead_id,created_at);
create index portal_activities_lead on public.portal_activities(lead_id,created_at);
create index portal_notifications_recipient on public.portal_notifications(recipient_id,created_at desc);
create index portal_revisions_note on public.portal_note_revisions(note_id);
create index portal_audit_org on public.portal_audit_events(org_id,created_at desc);

create function public.portal_is_admin(p_org uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select auth.uid() is not null and exists(select 1 from public.team_members where org_id=p_org and user_id=auth.uid() and role::text in ('owner','admin'));
$$;
create function public.portal_role(p_org uuid) returns text language sql stable security definer set search_path = '' as $$
 select case when public.portal_is_admin(p_org) then 'admin' else
 (select role from public.portal_memberships where org_id=p_org and user_id=auth.uid() and active) end;
$$;
create function public.portal_can_read(p_lead uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.portal_leads l where l.id=p_lead and
 (public.portal_is_admin(l.org_id) or
 (public.portal_role(l.org_id) in ('ambassador','business_developer') and l.attributed_user_id=auth.uid()) or
 (public.portal_role(l.org_id)='staff' and l.assigned_user_id=auth.uid())));
$$;
create function public.portal_can_manage(p_lead uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.portal_leads l where l.id=p_lead and
 (public.portal_is_admin(l.org_id) or (public.portal_role(l.org_id)='staff' and l.assigned_user_id=auth.uid())));
$$;
create function public.portal_can_read_note(p_note uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.portal_notes n where n.id=p_note and public.portal_can_read(n.lead_id) and
 (n.visibility='shared' or (n.visibility='personal' and n.author_id=auth.uid()) or (n.visibility='internal' and public.portal_can_manage(n.lead_id))));
$$;

alter table public.portal_memberships enable row level security;
alter table public.portal_leads enable row level security;
alter table public.portal_sales enable row level security;
alter table public.portal_notes enable row level security;
alter table public.portal_note_revisions enable row level security;
alter table public.portal_activities enable row level security;
alter table public.portal_audit_events enable row level security;
alter table public.portal_notifications enable row level security;
create policy portal_members_read on public.portal_memberships for select to authenticated using
 (public.portal_is_admin(org_id) or (user_id=auth.uid() and active));
create policy portal_leads_read on public.portal_leads for select to authenticated using (public.portal_can_read(id));
create policy portal_sales_read on public.portal_sales for select to authenticated using (public.portal_can_manage(lead_id));
create policy portal_notes_read on public.portal_notes for select to authenticated using (public.portal_can_read_note(id));
create policy portal_revisions_read on public.portal_note_revisions for select to authenticated using (public.portal_can_read_note(note_id));
create policy portal_activities_read on public.portal_activities for select to authenticated using
 (public.portal_can_read(lead_id) and (visibility='shared' or (visibility='personal' and actor_id=auth.uid()) or (visibility='internal' and public.portal_can_manage(lead_id))));
create policy portal_audit_read on public.portal_audit_events for select to authenticated using (public.portal_is_admin(org_id));
create policy portal_notifications_read on public.portal_notifications for select to authenticated using
 (recipient_id=auth.uid() and public.portal_can_read(lead_id));

-- No browser role receives direct write permissions. All mutations use verified commands.
revoke all on public.portal_memberships,public.portal_leads,public.portal_sales,public.portal_notes,
 public.portal_note_revisions,public.portal_activities,public.portal_audit_events,public.portal_notifications from anon,authenticated;
grant select on public.portal_memberships,public.portal_leads,public.portal_sales,public.portal_notes,
 public.portal_note_revisions,public.portal_activities,public.portal_audit_events,public.portal_notifications to authenticated;

create function public.portal_workspaces() returns table(org_id uuid,name text,role text) language sql stable security definer set search_path = '' as $$
 select o.id,o.name,public.portal_role(o.id) from public.organizations o where public.portal_role(o.id) is not null order by o.name,o.id;
$$;

create function public.portal_set_member(p_org uuid,p_user uuid,p_role text,p_name text,p_active boolean default true)
 returns void language plpgsql security definer set search_path = '' as $$
begin
 if not public.portal_is_admin(p_org) then raise exception 'Not authorized' using errcode='42501'; end if;
 insert into public.portal_memberships(org_id,user_id,role,display_name,active) values(p_org,p_user,p_role,trim(p_name),p_active)
 on conflict(org_id,user_id) do update set role=excluded.role,display_name=excluded.display_name,active=excluded.active;
 insert into public.portal_audit_events(org_id,actor_id,action,detail) values(p_org,auth.uid(),'membership_changed',jsonb_build_object('user_id',p_user,'role',p_role,'active',p_active));
end; $$;

create function public.portal_save_lead(p_org uuid,p_fields jsonb,p_id uuid default null,p_version integer default null)
 returns uuid language plpgsql security definer set search_path = '' as $$
declare l public.portal_leads; new_id uuid; actor_role text;
begin
 actor_role:=public.portal_role(p_org);
 if actor_role is null then raise exception 'Not authorized' using errcode='42501'; end if;
 if jsonb_typeof(p_fields) is distinct from 'object' then raise exception 'Invalid fields' using errcode='22023'; end if;
 if exists(select 1 from jsonb_object_keys(p_fields) k where k not in
 ('first_name','last_name','company','email','phone','website','source','service','summary','language','priority','next_action','followup_at'))
 then raise exception 'Unsupported field' using errcode='22023'; end if;
 if p_id is null then
   if actor_role not in ('admin','ambassador','business_developer') then raise exception 'Not authorized' using errcode='42501'; end if;
   insert into public.portal_leads(org_id,attributed_user_id,created_by) values(p_org,auth.uid(),auth.uid()) returning * into l;
 else
   select * into l from public.portal_leads where id=p_id and org_id=p_org for update;
   if l.id is null or not public.portal_can_read(l.id) or l.archived_at is not null then raise exception 'Lead unavailable' using errcode='42501'; end if;
   if l.version is distinct from p_version then raise exception 'Lead changed. Reload before saving.' using errcode='40001'; end if;
 end if;
 update public.portal_leads set
 first_name=trim(coalesce(p_fields->>'first_name',first_name)),last_name=trim(coalesce(p_fields->>'last_name',last_name)),
 company=trim(coalesce(p_fields->>'company',company)),email=lower(trim(coalesce(p_fields->>'email',email))),
 phone=trim(coalesce(p_fields->>'phone',phone)),website=trim(coalesce(p_fields->>'website',website)),
 source=trim(coalesce(p_fields->>'source',source)),service=trim(coalesce(p_fields->>'service',service)),
 summary=trim(coalesce(p_fields->>'summary',summary)),language=coalesce(p_fields->>'language',language),priority=coalesce(p_fields->>'priority',priority),
 next_action=trim(coalesce(p_fields->>'next_action',next_action)),
 followup_at=case when p_fields ? 'followup_at' then nullif(p_fields->>'followup_at','')::timestamptz else followup_at end,
 updated_at=now(),version=case when p_id is null then 1 else version+1 end where id=l.id returning id into new_id;
 insert into public.portal_activities(lead_id,actor_id,action) values(new_id,auth.uid(),case when p_id is null then 'created' else 'updated' end);
 insert into public.portal_audit_events(org_id,actor_id,lead_id,action) values(p_org,auth.uid(),new_id,case when p_id is null then 'created' else 'updated' end);
 return new_id;
end; $$;

create function public.portal_submit_lead(p_id uuid,p_version integer) returns void language plpgsql security definer set search_path = '' as $$
declare l public.portal_leads;
begin
 select * into l from public.portal_leads where id=p_id for update;
 if l.id is null or not public.portal_can_read(p_id) or (l.attributed_user_id<>auth.uid() and not public.portal_is_admin(l.org_id)) or l.archived_at is not null
 then raise exception 'Not authorized' using errcode='42501'; end if;
 if l.submitted_at is not null then return; end if;
 if l.version is distinct from p_version then raise exception 'Lead changed. Reload before submitting.' using errcode='40001'; end if;
 if l.first_name='' or l.last_name='' or l.company='' or (l.email='' and l.phone='') or l.source='' or l.service='' or l.summary=''
 then raise exception 'Complete required lead fields before submitting.' using errcode='22023'; end if;
 update public.portal_leads set submitted_at=now(),shared_stage='new',updated_at=now(),version=version+1 where id=p_id;
 insert into public.portal_sales(lead_id) values(p_id);
 insert into public.portal_activities(lead_id,actor_id,action) values(p_id,auth.uid(),'submitted');
 insert into public.portal_audit_events(org_id,actor_id,lead_id,action) values(l.org_id,auth.uid(),p_id,'submitted');
 insert into public.portal_notifications(org_id,recipient_id,lead_id,kind)
 select l.org_id,t.user_id,p_id,'submitted' from public.team_members t where t.org_id=l.org_id and t.role::text in ('owner','admin');
end; $$;

create function public.portal_manage_lead(p_id uuid,p_version integer,p_stage text,p_assignee uuid default null,p_publish boolean default false)
 returns void language plpgsql security definer set search_path = '' as $$
declare l public.portal_leads;
begin
 select * into l from public.portal_leads where id=p_id for update;
 if l.id is null or not public.portal_can_manage(p_id) or l.submitted_at is null or l.archived_at is not null
 then raise exception 'Not authorized' using errcode='42501'; end if;
 if l.version is distinct from p_version then raise exception 'Lead changed. Reload before saving.' using errcode='40001'; end if;
 if p_assignee is distinct from l.assigned_user_id and not public.portal_is_admin(l.org_id) then raise exception 'Only administrators assign leads' using errcode='42501'; end if;
 if p_assignee is not null and not exists(select 1 from public.portal_memberships where org_id=l.org_id and user_id=p_assignee and active and role='staff')
 then raise exception 'Assignee must be active portal staff' using errcode='22023'; end if;
 update public.portal_sales set stage=p_stage,updated_at=now() where lead_id=p_id;
 update public.portal_leads set assigned_user_id=p_assignee,shared_stage=case when p_publish then p_stage else shared_stage end,updated_at=now(),version=version+1 where id=p_id;
 insert into public.portal_activities(lead_id,actor_id,action,visibility,detail) values(p_id,auth.uid(),'pipeline_updated','internal',jsonb_build_object('stage',p_stage,'assignee',p_assignee));
 insert into public.portal_audit_events(org_id,actor_id,lead_id,action,detail) values(l.org_id,auth.uid(),p_id,'pipeline_updated',jsonb_build_object('stage',p_stage,'assignee',p_assignee,'published',p_publish));
 if p_publish then
   insert into public.portal_activities(lead_id,actor_id,action,detail) values(p_id,auth.uid(),'progress_shared',jsonb_build_object('stage',p_stage));
   insert into public.portal_notifications(org_id,recipient_id,lead_id,kind) values(l.org_id,l.attributed_user_id,p_id,'progress_shared');
 end if;
end; $$;

create function public.portal_save_note(p_lead uuid,p_body text,p_visibility text,p_note uuid default null,p_updated_at timestamptz default null)
 returns uuid language plpgsql security definer set search_path = '' as $$
declare n public.portal_notes; result uuid; org uuid;
begin
 if not public.portal_can_read(p_lead) then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_visibility='internal' and not public.portal_can_manage(p_lead) then raise exception 'Not authorized' using errcode='42501'; end if;
 if p_note is null then
 insert into public.portal_notes(lead_id,author_id,body,visibility) values(p_lead,auth.uid(),trim(p_body),p_visibility) returning id into result;
 else
 select * into n from public.portal_notes where id=p_note and lead_id=p_lead for update;
 if n.id is null or n.author_id<>auth.uid() or not public.portal_can_read_note(n.id) then raise exception 'Not authorized' using errcode='42501'; end if;
 if n.visibility is distinct from p_visibility then raise exception 'Note visibility cannot change' using errcode='22023'; end if;
 if n.updated_at is distinct from p_updated_at then raise exception 'Note changed. Reload before saving.' using errcode='40001'; end if;
 insert into public.portal_note_revisions(note_id,body) values(n.id,n.body);
 update public.portal_notes set body=trim(p_body),updated_at=clock_timestamp() where id=n.id returning id into result;
 end if;
 select org_id into org from public.portal_leads where id=p_lead;
 insert into public.portal_activities(lead_id,actor_id,action,visibility) values(p_lead,auth.uid(),case when p_note is null then 'note_added' else 'note_edited' end,p_visibility);
 insert into public.portal_audit_events(org_id,actor_id,lead_id,action,detail) values(org,auth.uid(),p_lead,'note_saved',jsonb_build_object('note_id',result,'visibility',p_visibility));
 return result;
end; $$;

create function public.portal_read_notification(p_id uuid) returns void language plpgsql security definer set search_path = '' as $$
begin
 update public.portal_notifications set read_at=coalesce(read_at,now()) where id=p_id and recipient_id=auth.uid() and public.portal_can_read(lead_id);
 if not found then raise exception 'Notification unavailable' using errcode='42501'; end if;
end; $$;

-- Explicit grants: SECURITY DEFINER functions must never inherit PUBLIC execute.
revoke all on function public.portal_is_admin(uuid),public.portal_role(uuid),public.portal_can_read(uuid),public.portal_can_manage(uuid),public.portal_can_read_note(uuid),
 public.portal_workspaces(),public.portal_read_notification(uuid),public.portal_set_member(uuid,uuid,text,text,boolean),public.portal_save_lead(uuid,jsonb,uuid,integer),public.portal_submit_lead(uuid,integer),
 public.portal_manage_lead(uuid,integer,text,uuid,boolean),public.portal_save_note(uuid,text,text,uuid,timestamptz) from public,anon;
grant execute on function public.portal_is_admin(uuid),public.portal_role(uuid),public.portal_can_read(uuid),public.portal_can_manage(uuid),public.portal_can_read_note(uuid),
 public.portal_workspaces(),public.portal_read_notification(uuid),public.portal_set_member(uuid,uuid,text,text,boolean),public.portal_save_lead(uuid,jsonb,uuid,integer),public.portal_submit_lead(uuid,integer),
 public.portal_manage_lead(uuid,integer,text,uuid,boolean),public.portal_save_note(uuid,text,text,uuid,timestamptz) to authenticated;
commit;
