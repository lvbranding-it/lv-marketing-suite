-- Intake submissions table
create table public.intake_submissions (
  id            uuid        primary key default gen_random_uuid(),
  org_id        uuid        not null references public.organizations(id) on delete cascade,
  created_at    timestamptz not null default now(),
  status        text        not null default 'new'
                            check (status in ('new', 'reviewed', 'converted')),

  -- Quick-access columns (also stored in form_data)
  contact_name  text,
  contact_email text,
  contact_role  text,
  company_name  text,

  -- Full form payload
  form_data     jsonb       not null default '{}'
);

alter table public.intake_submissions enable row level security;

-- Anyone can submit (public form — no auth)
create policy "Public can submit intake"
  on public.intake_submissions
  for insert
  with check (true);

-- Only org members can read
create policy "Org members read intake"
  on public.intake_submissions
  for select
  using (is_org_member(org_id));

-- Org admins can update status
create policy "Org admins update intake"
  on public.intake_submissions
  for update
  using  (org_role(org_id) = 'admin')
  with check (org_role(org_id) = 'admin');

-- Org admins can delete
create policy "Org admins delete intake"
  on public.intake_submissions
  for delete
  using (org_role(org_id) = 'admin');
