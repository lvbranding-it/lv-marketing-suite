# Event Scheduler

The scheduler from `lvbranding-it/lvbranding-events` now uses the Marketing
Suite Supabase project. Firebase is not part of the production bundle or the
runtime data path.

- Public booking: `/events`
- Authenticated administration: `/events/admin`
- Shared event links: `/events/<event-id>`

## Supabase architecture

Migration `supabase/migrations/20260916181000_event_scheduler.sql` creates:

- `event_schedule_events` for organization-owned schedules and branding;
- `event_schedule_bookings` for private guest registrations and check-ins;
- `event_schedule_booked_slots`, a public RPC that returns only occupied dates
  and times—not guest names or email addresses;
- `book_event_schedule_slot`, an atomic public booking RPC that validates the
  event date/time, prevents duplicate emails and prevents double-booking;
- organization-scoped row-level security for all administration; and
- an idempotent email claim used by the confirmation edge function.

The public UI polls availability and the authenticated admin UI also subscribes
to Supabase Realtime. `event-schedule-confirmation` sends the guest email with
the existing `SENDGRID_API_KEY` Supabase secret and records successful delivery
in the booking row.

Migration `supabase/migrations/20260917120000_event_scheduler_assets.sql`
creates the public-read `event-schedule-assets` logo bucket. Uploads, updates,
and deletes are limited to authenticated members of the organization in the
asset path. The browser accepts PNG, JPG, and WebP logos up to 5 MB. Public
event links can read only active event settings and occupied slot times; guest
names, email addresses, and administrative actions remain protected by RLS.

Migration `supabase/migrations/20260917143000_event_scheduler_slot_controls.sql`
adds configurable 5–120 minute appointment intervals and organization-scoped
blocked slots. Administrators manage blocks from the saved event editor. The
public availability RPC merges bookings and administrative blocks into the same
date/time-only response, and row locking prevents a block and guest booking from
claiming the same time concurrently.

## One-time legacy import

Apply the event scheduler migration through the repository's reconciled production migration
workflow first. Do not use a blanket `supabase db push --include-all` against a
database whose legacy migration history has not been reconciled.

Then run the idempotent importer from a trusted shell:

```sh
SUPABASE_URL=https://YOUR_PROJECT.supabase.co \
SUPABASE_SERVICE_ROLE_KEY=YOUR_SERVICE_ROLE_KEY \
EVENT_SCHEDULER_ORG_ID=YOUR_ORGANIZATION_UUID \
FIREBASE_WEB_API_KEY=THE_OLD_PUBLIC_WEB_KEY \
npm run migrate:event-scheduler
```

The importer reads the old `events` and `bookings` collections once, preserves
check-in status, stores each old document ID in `legacy_source_id`, and can be
rerun safely. The service-role key must never be placed in a `VITE_*` variable,
committed, or exposed to the browser.

After comparing event and booking counts, deploy the edge function:

```sh
supabase functions deploy event-schedule-confirmation --no-verify-jwt
```

Once the Supabase records and confirmation email are verified, the old Firebase
web app, Firestore database and Cloud Function can be retired.
