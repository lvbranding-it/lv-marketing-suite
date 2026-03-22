-- Create a public bucket for email image assets
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'email-assets',
  'email-assets',
  true,
  5242880, -- 5 MB
  ARRAY['image/jpeg','image/png','image/gif','image/webp','image/svg+xml']
)
ON CONFLICT (id) DO NOTHING;

-- Org members can upload images
CREATE POLICY "org members can upload email assets"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'email-assets'
  AND (storage.foldername(name))[1] IN (
    SELECT org_id::text FROM team_members WHERE user_id = auth.uid()
  )
);

-- Org members can delete their own uploads
CREATE POLICY "org members can delete email assets"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'email-assets'
  AND (storage.foldername(name))[1] IN (
    SELECT org_id::text FROM team_members WHERE user_id = auth.uid()
  )
);

-- Anyone can read (public bucket — needed for email recipients to see images)
CREATE POLICY "public read email assets"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'email-assets');
