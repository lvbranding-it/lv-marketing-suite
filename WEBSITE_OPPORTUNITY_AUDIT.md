# LV Website Opportunity Audit

The Website Opportunity Audit is a public, bilingual funnel that reviews up to five representative pages, combines normalized HTML signals with mobile PageSpeed data, and produces a deterministic opportunity plan. Visitors can see the complete report without creating an account; contact information is requested only when they ask LV Branding for help.

## Product routes

English:

- `/en/tools/website-opportunity-audit`
- `/en/tools/website-opportunity-audit/context`
- `/en/tools/website-opportunity-audit/analyzing`
- `/en/tools/website-opportunity-audit/results/:auditId`

Spanish:

- `/es/tools/auditoria-de-oportunidades-web`
- `/es/tools/auditoria-de-oportunidades-web/contexto`
- `/es/tools/auditoria-de-oportunidades-web/analizando`
- `/es/tools/auditoria-de-oportunidades-web/resultados/:auditId`

`/tools/website-opportunity-audit` resolves the initial locale from a saved choice and then the browser language. Later language changes preserve the report ID and stored audit state; they do not rerun the audit. Live result URLs keep their anonymous read capability in the URL fragment (`#access_token=…`), so a bookmark can reopen a result without putting that secret in HTTP requests, server logs, or referrer headers. Anyone who receives the complete result URL can read that report until it expires, so it should be treated as a private share link.

## Architecture

The current application remains a Vite SPA. Live page retrieval does not run in the browser because arbitrary sites are not reliably available through CORS and the PageSpeed key must stay private.

- React owns the intake, context questions, progress state, bilingual report, and help form.
- `website-audit` is the public Supabase Edge Function gateway. It performs URL validation, safe destination checks, representative-page retrieval, static HTML analysis, PageSpeed normalization, anonymous token authorization, persistence, event capture, and trusted lead routing.
- The versioned scoring engine and typed EN/ES catalogs live in `supabase/functions/_shared/website-audit`. Small files under `src/lib/website-audit` re-export the same contract for the browser, so live persistence and the rendered report cannot drift onto different scoring or copy versions.
- Postgres stores normalized signals and findings, not full fetched HTML.
- `submit-av-lead` remains the established CRM/email integration. The audit gateway constructs its payload from the authorized stored audit; the browser cannot supply trusted scores, priority findings, or lead temperature.

The current Edge Function completes the crawl in one request. It caps each fetch at 9 seconds, PageSpeed at 22 seconds, redirects at four, and pages at five. PageSpeed runs only for the submitted page in this MVP.

Response size is capped in two tiers: 8 MB for the submitted page and 2.5 MB for each representative page. The submitted page is fetched on its own, while the representative pages are fetched concurrently and each in-flight body is held twice while its chunks are joined, so the lower linked ceiling is what bounds peak worker memory. A single 1.5 MB cap was rejecting site-builder homepages, which commonly inline their content and ship 3 MB or more of HTML.

The production build emits localized English and Spanish landing shells with title, description, canonical, hreflang, and index directives in the initial HTML. It also emits localized `noindex,nofollow` shells for context, analyzing, and result routes. Vercel routes those paths to the generated shells before the general SPA fallback; React keeps the metadata synchronized during client navigation.

## Scoring and evidence

The ruleset is `lv-website-opportunity-v1`. Each of the five dimensions has 100 available points, and the overall weights are 25/25/20/15/15. Checks that cannot run are `notMeasured` and leave the denominator; report coverage discloses the missing evidence separately.

Stable rule IDs, outcomes, evidence classes, point values, severity, impact, effort, and priority are stored independently from display language. Priority uses severity × business impact × confidence ÷ effort. Eligible Fix now, Plan next, and Protect checks are distinct; a passing check is never relabeled as a repair action just to fill a slot.

The sample report uses a reserved `.example` hostname and explicit representative fixture data. It never presents the entered domain as fetched or analyzed.

## Data and retention

Migration `040_website_opportunity_audit.sql` creates:

- `website_audits`
- `website_audit_pages`
- `website_audit_findings`
- `website_audit_answers`
- `website_audit_leads`
- `website_audit_events`
- `edge_rate_limit_buckets`

All tables have RLS enabled and no anonymous direct-read policies. Result reads and event/lead writes go through the Edge Function using an audit ID plus a hashed anonymous bearer token. Audit access expires after 30 days; browser result and draft storage follows the same window. A daily `pg_cron` job deletes expired audits and their cascading child rows; the gateway also performs an hourly opportunistic sweep while it is receiving traffic. Audit job reservation uses transaction-scoped advisory locks so the durable per-client and per-domain limits hold across parallel Edge workers.

Lead temperature is stored only in the internal audit lead row and is never returned to the visitor. The gateway calculates it from the trusted score, recommended route, stated site purpose, and project timeline. Lead handoff uses a leased database outbox, a downstream idempotency key, and resumable CRM/team-email/prospect-email status. The gateway drains due rows during normal traffic, and migration 040 installs a one-minute `pg_net` cron drain when the required Vault secrets are present.

## Security boundary

The fetcher permits only public HTTP/HTTPS destinations on ports 80/443, rejects credentials and local hostnames, resolves A and AAAA records, blocks private/link-local/metadata/reserved ranges, rechecks every redirect, refuses non-HTML responses, and never executes remote JavaScript.

Important production caveat: DNS validation followed by a hostname-based `fetch()` cannot pin the checked IP in the Supabase runtime. A hostile DNS service could theoretically rebind between resolution and connection. If strict SSRF isolation is a launch requirement, route outbound audit requests through an egress service that resolves, validates, and pins the destination IP. The existing checks remain useful defense in depth but are not a substitute for that network boundary.

## Launch checklist

No remote migration, secret change, function deployment, or Vercel deployment is performed by this implementation. To launch:

1. Add `project_url`, `service_role_key`, and `outbox_drain_secret` to Supabase Vault so migration 040 can install the independent one-minute outbox drain. `outbox_drain_secret` must equal the function secret `AUDIT_DRAIN_SECRET`. Do not authenticate the drain with the service role key: Supabase injects `SUPABASE_SERVICE_ROLE_KEY` into the function itself and can issue a different value than the one stored in Vault, which returns 403 on every scheduled call while the rest of the function keeps working normally.
2. Review and apply `supabase/migrations/040_website_opportunity_audit.sql` to the production Supabase project. If the Vault secrets were added afterward, install the documented `website-opportunity-audit-outbox` cron command from the migration manually.
3. Set the server-only secrets: `supabase secrets set PAGESPEED_API_KEY=... AUDIT_DRAIN_SECRET=...`. `AUDIT_DRAIN_SECRET` must match the `outbox_drain_secret` Vault entry from step 1.
4. Deploy the updated `submit-av-lead` function so `website-audit` is a recognized source. Its public route has bounded input, durable abuse limits, and service-only audit payloads.
5. Deploy `website-audit`. Its `verify_jwt = false` setting is intentional because audit access is protected by the per-report bearer token, not a user account.
6. Deploy the Vite application.
7. Run controlled audits against strong, average, intentionally flawed, redirected, slow, non-HTML, and blocked-network test destinations before promotion.
8. Confirm the outbox cron exists, then verify CRM notifications, bilingual replies, `website_audit_leads`, and funnel events in production.

If PageSpeed is unavailable or its key is not configured, the HTML audit still completes. The affected lab checks are marked not measured and coverage falls; the service never invents scores or silently substitutes demo data.

## Verification

```sh
npm test -- --reporter=dot
npm run build
```

The automated suite covers deterministic scoring, unavailable-check handling, score-band boundaries, priority-plan deduplication, URL validation, persistence, and complete EN/ES catalog parity.
