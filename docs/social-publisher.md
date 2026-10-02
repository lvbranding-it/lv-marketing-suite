# Social Publisher deployment and operations

The internal vertical slice lives at `/social-publisher`. It supports Meta
account discovery, separate Facebook and Instagram content, approval, UTC-backed
scheduling, independent channel jobs, controlled retries, and audit history.

## Apply and deploy

Apply `supabase/migrations/20260922120000_social_publisher.sql`, then deploy:

```sh
npx supabase functions deploy social-meta-oauth social-publish --project-ref kgdeqwjuspiqraxrlcew
```

Configure server-only Edge Function secrets:

```sh
npx supabase secrets set \
  META_APP_ID=... \
  META_APP_SECRET=... \
  META_LOGIN_CONFIG_ID=... \
  META_GRAPH_VERSION=v25.0 \
  SOCIAL_TOKEN_ENCRYPTION_KEY=... \
  SOCIAL_PUBLISHER_WORKER_SECRET=... \
  APP_URL=https://marketing.lvbranding.com \
  --project-ref kgdeqwjuspiqraxrlcew
```

Use a randomly generated value of at least 32 characters for both social
secrets. `SOCIAL_TOKEN_ENCRYPTION_KEY` encrypts Meta tokens with AES-GCM before
database storage. The browser roles have no grants on token tables.

`META_LOGIN_CONFIG_ID` is optional. When set, the login sends that Facebook
Login for Business configuration instead of the permission list, as Meta
recommends; without it, the permissions below are requested directly.

## Meta app setup

The app ("LV Social Publisher") is a Business app using Facebook Login for
Business. It needs three use cases; others only add review requirements:

- **Manage everything on your Page**: `pages_show_list`, `pages_read_engagement`,
  `pages_manage_posts`, `business_management`
- **Manage messaging & content on Instagram**, set up under *API setup with
  Facebook login* (not *Instagram login*, whose `instagram_business_*`
  permissions, app ID and secret this code does not use):
  `instagram_basic`, `instagram_content_publish`
- **Create & manage ads with Marketing API**: `ads_management`, `ads_read`.
  Meta requires these to publish to Instagram when someone's role on the
  linked Page comes through a Business Portfolio.

In Facebook Login for Business:

- **Settings**: add this exact Valid OAuth Redirect URI:

  ```text
  https://kgdeqwjuspiqraxrlcew.supabase.co/functions/v1/social-meta-oauth
  ```

- **Configurations**: create one with token type *User access token* and the
  eight permissions above; its ID is `META_LOGIN_CONFIG_ID`.

In App settings > Basic: app icon, category, privacy policy URL and a data
deletion URL (instructions page or callback). These are required to publish.

Access: whoever clicks Connect Meta needs a role on the app (App roles) and
must manage the Pages in Meta Business Suite; each Instagram account must be a
professional account linked to its Page, and the Page must have completed Page
Publishing Authorization if Meta asks for it. Meta allows 100 API-published
Instagram posts per account in any 24 hours. With Standard Access, which needs no
App Review or business verification, only people with an app role can connect.
Letting anyone else connect needs Advanced Access, App Review and business
verification.

App mode: while the app is unpublished, anything it posts is visible only to
people with a role on the app. Publish the app before posting for real; test
posts made before then become public when it is published, so delete them.

## Recurring worker

`20261001200000_social_publisher_worker.sql` installs the one-minute `pg_cron`
task that publishes queued posts. It needs one Vault entry, created in the SQL
editor with the same value as the `SOCIAL_PUBLISHER_WORKER_SECRET` Edge
Function secret:

```sql
select vault.create_secret('<SOCIAL_PUBLISHER_WORKER_SECRET value>', 'social_publisher_worker_secret');
```

The migration stops with an error if that entry is missing, and can be rerun.
(The first migration's version of this block wanted three entries, including
the service role key; none had been added, so it never installed the task.)

## Publishing behavior

- Every destination is a separate variant and queue job.
- Job leasing uses `FOR UPDATE SKIP LOCKED`; stale leases recover after ten minutes.
- Temporary Meta failures retry with bounded exponential backoff, up to five attempts.
- Authentication errors mark the account and connection as action required.
- Permanent and ambiguous errors require administrator review. Ambiguous failures
  do not retry automatically because Meta may have accepted the post before the
  response was lost.
- A recorded provider post ID prevents another publish attempt.
- Instagram creation-container IDs are persisted before `media_publish`.

## Controlled release checklist

1. Connect the LV Branding Meta Business Portfolio from the Connections tab.
2. Confirm one Facebook Page and linked professional Instagram account appear.
3. Enable approval-required workflow if desired.
4. Publish one image post to test accounts, then a carousel and Reel.
5. Confirm both channel IDs/permalinks and the audit timeline are retained.
6. Simulate a revoked token and verify that only the affected channel requests reconnection.
7. Review logs for redaction before enabling production destinations.

Facebook scheduling is executed by the same durable worker as Instagram. This
keeps the product's behavior consistent and makes per-channel recovery visible,
while all timestamps remain stored in UTC and displayed in America/Chicago.
