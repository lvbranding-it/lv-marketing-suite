-- Optional post-booking destination configured per event. A null value means
-- the public UI falls back to https://www.lvbranding.com.

alter table public.event_schedule_events
  add column if not exists confirmation_redirect_url text;

alter table public.event_schedule_events
  drop constraint if exists event_schedule_events_confirmation_redirect_url_check;
alter table public.event_schedule_events
  add constraint event_schedule_events_confirmation_redirect_url_check
  check (
    confirmation_redirect_url is null
    or confirmation_redirect_url ~ '^https://[^[:space:]]+$'
  );

comment on column public.event_schedule_events.confirmation_redirect_url is
  'Optional HTTPS destination for the confirmation-card Continue button; null uses the LV Branding website.';
