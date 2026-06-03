-- ── LV Event Experiences ───────────────────────────────────────────────────────

create table if not exists public.events (
  id                         uuid primary key default gen_random_uuid(),
  org_id                     uuid not null references public.organizations(id) on delete cascade,
  name                       text not null,
  slug                       text not null,
  status                     text not null default 'draft',
  event_date                 date,
  venue_name                 text,
  city                       text,
  state                      text,
  logo_url                   text,
  sponsor_logo_urls          jsonb not null default '[]'::jsonb,
  primary_color              text not null default '#0B1F4D',
  secondary_color            text not null default '#CB2039',
  accent_color               text not null default '#FFFFFF',
  theme                      text not null default 'default',
  upload_headline            text not null default 'Share Your Moment!',
  upload_subheadline         text,
  confirmation_message       text,
  screen_headline            text,
  screen_subheadline         text,
  lower_third_text           text,
  sponsor_message            text,
  require_caption            boolean not null default false,
  require_name               boolean not null default false,
  require_consent            boolean not null default true,
  auto_approve               boolean not null default false,
  allow_camera_capture       boolean not null default true,
  allow_gallery_upload       boolean not null default true,
  camera_mode                text not null default 'both',
  selfie_button_label        text not null default 'Take a Selfie',
  rear_camera_button_label   text not null default 'Take Event Photo',
  gallery_button_label       text not null default 'Upload From Gallery',
  slideshow_interval_seconds integer not null default 7,
  show_captions              boolean not null default true,
  show_names                 boolean not null default false,
  show_sponsors              boolean not null default true,
  show_logo                  boolean not null default true,
  show_qr_code_on_screen     boolean not null default true,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  unique (org_id, slug)
);

create table if not exists public.event_photos (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references public.events(id) on delete cascade,
  org_id           uuid not null references public.organizations(id) on delete cascade,
  image_path       text not null,
  attendee_name    text,
  caption          text,
  status           text not null default 'pending',
  is_featured      boolean not null default false,
  upload_source    text not null default 'gallery',
  consent_accepted boolean not null default false,
  uploaded_at      timestamptz not null default now(),
  approved_at      timestamptz,
  rejected_at      timestamptz
);

alter table public.events       enable row level security;
alter table public.event_photos enable row level security;

create policy "events_org_select"    on public.events for select using (org_id in (select org_id from public.team_members where user_id = auth.uid()));
create policy "events_org_insert"    on public.events for insert with check (org_id in (select org_id from public.team_members where user_id = auth.uid()));
create policy "events_org_update"    on public.events for update using (org_id in (select org_id from public.team_members where user_id = auth.uid()));
create policy "events_org_delete"    on public.events for delete using (org_id in (select org_id from public.team_members where user_id = auth.uid()));
create policy "events_public_active" on public.events for select using (status = 'active');

create policy "event_photos_org_select"       on public.event_photos for select using (org_id in (select org_id from public.team_members where user_id = auth.uid()));
create policy "event_photos_org_update"       on public.event_photos for update using (org_id in (select org_id from public.team_members where user_id = auth.uid()));
create policy "event_photos_org_delete"       on public.event_photos for delete using (org_id in (select org_id from public.team_members where user_id = auth.uid()));
create policy "event_photos_public_insert"    on public.event_photos for insert with check (true);
create policy "event_photos_public_approved"  on public.event_photos for select using (status in ('approved','featured'));

insert into storage.buckets (id, name, public) values ('event-photos', 'event-photos', true) on conflict (id) do nothing;
insert into storage.buckets (id, name, public) values ('event-assets', 'event-assets', true) on conflict (id) do nothing;

create policy "event_photos_storage_insert" on storage.objects for insert with check (bucket_id = 'event-photos');
create policy "event_photos_storage_select" on storage.objects for select using (bucket_id = 'event-photos');
create policy "event_assets_storage_insert" on storage.objects for insert with check (bucket_id = 'event-assets');
create policy "event_assets_storage_select" on storage.objects for select using (bucket_id = 'event-assets');
create policy "event_assets_storage_delete" on storage.objects for delete using (bucket_id = 'event-assets' and (storage.foldername(name))[1] in (select org_id::text from public.team_members where user_id = auth.uid()));
