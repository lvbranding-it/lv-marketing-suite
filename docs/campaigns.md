# Campaign tracking and public email links

Campaign rates use unique recipients divided by sent emails and display up to one decimal place. List and sent-detail stats refresh every 30 seconds while visible; **Refresh stats** forces an immediate fetch. Recipient lists fetch all pages rather than stopping at Supabase's 1,000-row limit.

## Event delivery

SendGrid posts to `https://kgdeqwjuspiqraxrlcew.supabase.co/functions/v1/email-webhook`. This provider callback must have `verify_jwt = false`: SendGrid does not supply a Supabase user JWT. On October 22, 2026, production had JWT verification enabled and returned 401 before the handler ran. Restoring the callback allowed actual events for that day's campaign to arrive again.

`record_campaign_event` locks each recipient and commits the status, timestamps, suppression and counter changes in one transaction. Repeated opens, clicks, unsubscribes and permanent bounces do not increase counts again. An open cannot downgrade a click, bounce or unsubscribe status. Persistence failures return 500 so the provider can retry. Event recipient/campaign metadata is matched to the stored recipient; suppression addresses and organizations come from that row.

The callback supports SendGrid signature verification when `SENDGRID_WEBHOOK_VERIFICATION_KEY` is configured. It must contain the base64 public verification key matching the provider's Signed Event Webhook setting. Without that setting the existing unsigned delivery integration is retained. Enabling signed delivery on both ends remains a separate operational hardening step; gateway JWT verification is not a substitute for provider signature verification.

Earlier missing activity depends on the provider retaining and retrying it. No campaign was resent during this repair, and no engagement events were fabricated.

## Public email links

On a sent campaign, choose **Create share link**, then **Copy link** or **View email**. Links use `/campaign/<random-token>`. Sharing is off by default, including for existing campaigns. **Disable link** clears the token immediately; creating another link generates a new token.

The public response includes only the email subject, preview and body in the same email layout. Merge fields use generic values and there is no recipient-specific unsubscribe link, recipient list or analytics data. Visiting the web version does not count as an email open or click. Links in the original template remain unchanged.

Vercel's `api/campaign.ts` serves HTML with Open Graph metadata for social crawlers. The `campaign-share` Edge Function permits only sent campaigns with an active token. Table RLS remains unchanged; anonymous users receive no table access. The HTML response disables scripts/forms, isolates its origin with a CSP sandbox, and uses no-store caching so revoked links stop resolving. Social networks can retain their own preview caches after revocation.

## Deployment and validation

1. Apply `20261022120000_campaign_tracking_sharing.sql` only; do not replay unrelated legacy migrations. Production applied this migration and recorded its version on October 22, 2026.
2. Deploy `email-webhook`, `email-unsubscribe`, `send-campaign` and `campaign-share`. Preserve the explicit non-JWT settings for the public callbacks.
3. Deploy the frontend and Vercel API together. `VITE_SUPABASE_URL` must exist in the Vercel server environment as well as the frontend build environment.

Validation: database transaction/idempotency/access tests, signature and public rendering tests, server-rendered route tests, campaign percentage tests, desktop/mobile browser checks with mocked backend data, production build, and live empty/malformed callback and missing-share checks. Actual events were observed arriving for the affected campaign after deployment. No production email was sent for testing.
