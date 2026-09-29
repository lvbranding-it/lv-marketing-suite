-- Workspace pages become documents, and the reference library accepts video.
--
-- 1. One rich document per page.
--    Pages were a list of blocks, each its own plain-text box. A browser cannot
--    select across separate text boxes, so a page typed paragraph by paragraph
--    (one had 71 blocks) could not be copied as a whole, and formatting did not
--    exist at all: pasted AI output kept its ** and ## as literal characters.
--    The page now carries a single HTML document. document_text is the same
--    content as plain text, kept for search and word counts.
--
--    Nothing is migrated here and no block is touched. Each page converts itself
--    from its blocks the first time it is opened in the new editor, so the
--    conversion always starts from the latest content. workspace_blocks stays as
--    it is, as the source for pages not yet opened and as a backup of every page
--    that has been.
--
-- 2. Video in the reference library.
--    Blocked in three places before this: the category constraint had no video,
--    the bucket allowed no video types, and its 50 MB cap is smaller than most
--    phone clips. The cap rises to 500 MB for the whole bucket; the app keeps its
--    own 50 MB limit on everything that is not video.
--
--    The bucket limit cannot exceed the project-wide upload limit, which is set in
--    the Supabase dashboard (Storage > Settings) and is not reachable from SQL.

alter table public.workspace_pages
  add column if not exists document_html text,
  add column if not exists document_text text;

comment on column public.workspace_pages.document_html is
  'The page as one rich document. Null until the page is first opened in the document editor, which converts it from workspace_blocks.';
comment on column public.workspace_pages.document_text is
  'Plain-text copy of document_html, paragraphs separated by blank lines. Used for search and word counts.';

alter table public.workspace_assets drop constraint if exists workspace_assets_category_check;
alter table public.workspace_assets add constraint workspace_assets_category_check
  check (category in ('logo', 'photo', 'video', 'pdf', 'palette', 'design_system', 'calendar', 'reference'));

update storage.buckets
set file_size_limit = 524288000,
    allowed_mime_types = (
      select array_agg(distinct mime order by mime)
      from unnest(
        coalesce(allowed_mime_types, '{}'::text[])
        || array['video/mp4', 'video/quicktime', 'video/webm', 'video/x-m4v', 'video/mpeg', 'video/ogg']
      ) as mime
    )
where id = 'workspace-assets';
