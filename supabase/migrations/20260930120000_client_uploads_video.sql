-- Client upload links (/upload/:token) accept video.
--
-- Videos go straight from the browser to this bucket with a one-time signed
-- upload URL, so the bucket's own limit is what actually stops an oversized
-- file. 500 MB matches the video limit the page and the client-upload function
-- apply; other files are still held to 50 MB by both.
--
-- The bucket keeps accepting any file type, as it always has.
--
-- The project-wide upload limit (Dashboard → Storage → Settings) still caps
-- every bucket. Until it is raised to at least 500 MB, anything above it is
-- refused whatever this says.

update storage.buckets
set file_size_limit = 524288000
where id = 'client-uploads';
