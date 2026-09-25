-- Publish event_photos so the live screen hears about approvals.
--
-- The screen at /event/<slug>/live-screen subscribes to postgres_changes on
-- public.event_photos and refetches whenever a row moves. The subscription has
-- always been there, but the table was never added to the supabase_realtime
-- publication, so the logical decoder never emitted its rows: the channel
-- reported SUBSCRIBED and then stayed silent for the life of the event.
--
-- What hid the fault is that the screen still refreshed by other means. React
-- Query refetches on reconnect and on window focus by default, so venue wifi
-- dropping, or anyone clicking the machine, pulled in whatever had been
-- approved since. It looked like live push and failed only on the nights the
-- network held and nobody touched the screen. That screen is usually a source
-- into a video switcher, where reloading it is not an option, so the refresh
-- has to arrive on its own.
--
-- No policy change is needed. event_photos_public_approved already grants
-- select on rows whose status is approved or featured, so an anonymous screen
-- receives the pending -> approved update: the new row satisfies the policy,
-- and that transition is precisely the event the screen is waiting for.
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = 'event_photos'
    ) then
      alter publication supabase_realtime add table public.event_photos;
    end if;
  end if;
end
$$;
