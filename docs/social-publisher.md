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
  META_GRAPH_VERSION=v25.0 \
  SOCIAL_TOKEN_ENCRYPTION_KEY=... \
  SOCIAL_PUBLISHER_WORKER_SECRET=... \
  APP_URL=https://marketing.lvbranding.com \
  --project-ref kgdeqwjuspiqraxrlcew
```

Use a randomly generated value of at least 32 characters for both social
secrets. `SOCIAL_TOKEN_ENCRYPTION_KEY` encrypts Meta tokens with AES-GCM before
database storage. The browser roles have no grants on token tables.

In the Meta application, configure this exact OAuth redirect URI:

```text
https://kgdeqwjuspiqraxrlcew.supabase.co/functions/v1/social-meta-oauth
```

The app requests `pages_show_list`, `pages_read_engagement`,
`pages_manage_posts`, `instagram_basic`, `instagram_content_publish`, and
`business_management`. Meta app mode, access level, Business Portfolio access,
Page tasks, and the Instagram professional-account link must also be correct.

## Recurring worker

Before applying the migration, add these Supabase Vault entries:

- `project_url`: the Supabase project URL
- `service_role_key`: the project service-role key, used only as the gateway API key
- `social_publisher_worker_secret`: the same value set on the Edge Function

The migration installs a one-minute `pg_cron` task when all three entries are
present. If they are absent, the migration emits a warning and leaves jobs
queued safely. After adding the entries later, rerun only the guarded scheduler
block at the bottom of the migration.

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
