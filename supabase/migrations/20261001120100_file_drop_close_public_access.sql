-- Closes three ways into File Drop that needed no login.
--
-- Apply this only once the site that reads upload links through
-- get_file_request_by_token (20261001120000) is live. The previous upload page
-- reads file_requests directly and stops finding its link once the first
-- policy below is gone.

-- 1. Anyone with the public key could list every active request, token
--    included, and then send files to any of them. The upload page now uses
--    get_file_request_by_token; org members keep their own policy.
drop policy if exists "public_read_active_file_requests" on public.file_requests;

-- 2. Anyone could add rows to file_submissions. Files are recorded by the
--    client-upload function, which uses the service role and needs no policy.
drop policy if exists "public_insert_file_submissions" on public.file_submissions;

-- 3. Anyone could upload anything anywhere in the file-shares bucket. Uploads
--    now have to go into the uploader's own org folder — where the Send / Share
--    tab already puts them — matching the bucket's read and delete policies.
drop policy if exists "file_shares_storage_insert" on storage.objects;
create policy "file_shares_storage_insert" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'file-shares'
    and (storage.foldername(name))[1] in (
      select org_id::text from public.team_members where user_id = auth.uid()
    )
  );
