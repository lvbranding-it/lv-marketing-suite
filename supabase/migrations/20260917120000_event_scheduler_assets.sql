-- Public event logos with organization-scoped write access.
-- The bucket is readable without authentication because logos are rendered on
-- public booking pages. Only authenticated members of the organization named
-- by the first path segment may create, replace, or delete an asset.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'event-schedule-assets',
  'event-schedule-assets',
  true,
  5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "event schedule logos are publicly readable"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'event-schedule-assets');

create policy "organization members can upload event schedule logos"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'event-schedule-assets'
    and (storage.foldername(name))[1] in (
      select org_id::text
      from public.team_members
      where user_id = auth.uid()
    )
  );

create policy "organization members can update event schedule logos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'event-schedule-assets'
    and (storage.foldername(name))[1] in (
      select org_id::text
      from public.team_members
      where user_id = auth.uid()
    )
  )
  with check (
    bucket_id = 'event-schedule-assets'
    and (storage.foldername(name))[1] in (
      select org_id::text
      from public.team_members
      where user_id = auth.uid()
    )
  );

create policy "organization members can delete event schedule logos"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'event-schedule-assets'
    and (storage.foldername(name))[1] in (
      select org_id::text
      from public.team_members
      where user_id = auth.uid()
    )
  );
