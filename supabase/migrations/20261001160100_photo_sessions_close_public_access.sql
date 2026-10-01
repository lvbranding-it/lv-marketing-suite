-- Photo sessions, part 2 of 2: removes the open table rules.
--
-- Apply this only once the site that uses the share-link functions from part 1
-- (20261001160000) is live. The previous client page reads these tables
-- directly and stops working the moment these rules are gone.
--
-- After this, someone without a login sees a session only through its share
-- link, via those functions. The team keeps its own rules; the client-facing
-- server functions (get-photo-urls, finalize-session, advance-round,
-- get-deliverable-urls) use the service role and are unaffected.

-- Anyone could list every session, share link and client email included.
drop policy if exists "public can read session by share token" on public.photo_sessions;

-- Anyone could list every photo, and change the selection on any of them.
drop policy if exists "public can read photos for shared session" on public.session_photos;
drop policy if exists "public can update photo status" on public.session_photos;

-- Anyone could read every comment and post on any session.
drop policy if exists "public can read comments for shared session" on public.photo_comments;
drop policy if exists "public can insert comments" on public.photo_comments;

-- Anyone could list every published deliverable. Clients get theirs through
-- get-deliverable-urls, which checks the share link.
drop policy if exists "public can read published deliverables" on public.session_deliverables;
