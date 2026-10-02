-- Photo sessions: small copies of each photo, made when it is uploaded.
--
-- Galleries asked Supabase to resize every photo they showed. Supabase bills
-- each distinct photo resized in a billing cycle beyond 100 on the Pro plan,
-- and one 172-photo session went past that. Each photo now gets a 600-pixel
-- thumbnail and a 1600-pixel preview at upload, stored next to the original,
-- and nothing asks Supabase to resize.

alter table public.session_photos
  add column if not exists thumb_path text,
  add column if not exists preview_path text;

-- Photos uploaded before this get their copies the first time someone on the
-- team opens their session. Two people opening it at once write the same
-- copy, which replaces a file, and replacing needs its own permission.
drop policy if exists "org members can replace session photos" on storage.objects;
create policy "org members can replace session photos"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'session-photos'
    and (storage.foldername(name))[1] in (select org_id::text from public.team_members where user_id = auth.uid())
  )
  with check (
    bucket_id = 'session-photos'
    and (storage.foldername(name))[1] in (select org_id::text from public.team_members where user_id = auth.uid())
  );
