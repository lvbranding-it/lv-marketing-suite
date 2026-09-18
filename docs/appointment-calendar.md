# Appointment calendar

The prospect scheduler uses Supabase as its source of truth. Google Calendar and
Microsoft 365 connections are optional per host and are managed from
`/appointments`.

## Live routes

- Admin: `https://marketing.lvbranding.com/appointments`
- Public: `https://marketing.lvbranding.com/book/lv-branding-consultation`
- Embed: add `?embed=1` to the public URL, or copy the iframe from the admin page.

Public submissions are saved as pending requests. The guest receives a request
receipt and can download a tentative calendar hold. An owner or administrator
can approve, edit, cancel, or delete the request from `/appointments`; approval
creates the connected provider event and sends the final confirmation email.

## Provider OAuth setup

Use this exact redirect URI for both provider applications:

`https://kgdeqwjuspiqraxrlcew.supabase.co/functions/v1/appointment-calendar-oauth`

Set the credentials as Supabase Edge Function secrets:

```sh
npx supabase secrets set \
  GOOGLE_CALENDAR_CLIENT_ID=... \
  GOOGLE_CALENDAR_CLIENT_SECRET=... \
  MICROSOFT_CALENDAR_CLIENT_ID=... \
  MICROSOFT_CALENDAR_CLIENT_SECRET=... \
  MICROSOFT_CALENDAR_TENANT=common \
  --project-ref kgdeqwjuspiqraxrlcew
```

For Google, enable the Google Calendar API and configure the OAuth consent
screen. For Microsoft Entra, add delegated `User.Read` and
`Calendars.ReadWrite` permissions and allow offline access.

OAuth access and refresh tokens are encrypted by the Edge Function before they
are stored. The token table grants no browser role access; authenticated admins
can read only redacted connection status through a database function.

Deploy the scheduler functions after applying its migrations:

```sh
npx supabase functions deploy appointment-availability appointment-booking appointment-management appointment-calendar-oauth \
  --project-ref kgdeqwjuspiqraxrlcew
```
