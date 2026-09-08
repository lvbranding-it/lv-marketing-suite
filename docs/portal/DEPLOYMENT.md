# Ambassador Portal: first functional increment

## What is implemented

The `/portal` workspace supports organization selection, a daily dashboard, server-paginated lead lists with search/stage/priority/sort controls, table/mobile-card views, draft capture, contact editing, a next action and follow-up date, explicit submission, notes and note revisions, a chronological activity list, internal assignment and pipeline changes, deliberately published progress, an in-app notification inbox, and admin representative access management and invitation links.

The same UI uses the existing English/Spanish language provider and LV components, colors and font. Representative navigation is separate from internal suite navigation. The existing Supabase sign-in is reused. Browser API requests enforce scope through Postgres permissions and commands; hiding controls is not the authorization mechanism.

This is a first lead-handoff increment, not the entire MVP. Duplicate detection, full task/reminder management, archival/merges/exports, configurable stages, expanded lead fields, performance reports, resources/Knowledge Center, lead-aware AI, voice and usage/rate controls remain planned. Until those release gates are complete, use a staging pilot with existing test accounts; this is not a broad representative launch.

## Review the UI now

Run `npm run dev` and open `/portal-preview` on the displayed local port. That development-only route does not require sign-in and uses fictional `example.test` leads. It supports EN/ES, mobile/table/card layouts, form review, and an administrator role preview. All save/submission/pipeline actions are disabled in preview. It never creates Supabase records. The preview route is excluded from production routing.

For the authenticated workspace, use `/portal` after applying the migration to staging. Set `VITE_ENABLE_AMBASSADOR_PORTAL=true` to show its navigation link in the existing suite. This build-time flag controls discoverability only; all API access remains protected independently. The default example value is false.

## Database artifact and prerequisites

The candidate migrations are `supabase/portal-migrations/202609080001_portal_foundation.sql` followed by `202609080002_portal_invitations.sql` and `202609080003_standalone_advisor.sql`. They are intentionally outside `supabase/migrations` while the legacy history is reconciled. They create new `portal_*` tables/functions/indexes/policies; the advisor migration also adds optional first_name and preferred_first_name profile fields. They do not alter legacy CRM, membership, invitations, run storage, or migration history. Each migration is transactional and will fail on a conflicting existing portal object rather than silently replacing it.

Verified dependency contracts are `public.organizations(id,name)`, `public.team_members(org_id,user_id,role)`, `auth.users(id,email,email_confirmed_at)`, `auth.uid()`, and the `anon`/`authenticated` roles. The standalone test fixture reproduces these interfaces; it is not a full production-schema restoration.

Do not run a general `supabase db push --include-all` against the current divergent legacy history. Before a production migration, finish the canonical history reconciliation, rehearse the exact migration set on staging, and integrate this candidate under the agreed migration workflow. Applying SQL directly without recording it in the canonical migration history would recreate the existing divergence.

## Access and write behavior

- Existing organization owner/admin roles administer that organization's portal.
- Ambassador, business developer, and assigned staff access live in `portal_memberships`. Creating this membership does not add internal suite membership.
- Representatives read only leads attributed to them. Staff read assigned leads. Admins read leads within their own organization.
- Internal stages live in `portal_sales`, separately protected from representative-readable `portal_leads.shared_stage`.
- Personal notes and their revisions remain author-only, including against admins. Shared notes require lead access. Internal notes require lead-management access.
- All client table writes are revoked. Commands validate identity/capabilities, scope, permitted fields, assignment eligibility, and edit versions before mutation.
- Submission locks the lead, validates required data, preserves attribution, creates sales state, timeline/audit events and admin notifications atomically. Repeating a successful submission does not duplicate the notification.
- Permission changes are audited. Deactivation removes access on the next protected query/command while retaining history.
- Lead audit entries omit note bodies. Notification content reveals no hidden notes; inbox reads and acknowledgements are recipient-scoped.
- Initial follow-ups are one next action/date on the lead. Dedicated completed/canceled tasks and reminder delivery are not represented as complete features yet.

## Staging setup

1. Prepare a separate staging database with the verified dependency schema and standard Supabase Auth roles. Apply the candidate through the agreed staging migration workflow.
2. Create two representative test accounts and one staff test account using existing Supabase Auth, plus an organization owner/admin. Use synthetic contacts only.
3. As the authenticated organization admin, open Representatives and create an invitation link for each synthetic test account. Copy and open the link using the matching verified account, then explicitly accept. Use Manage access to set roles or deactivate access. Roles are `ambassador`, `business_developer` and `staff`. Never add representatives to LV `team_members` to make the portal work.
4. Open `/portal` and choose the intended LV organization. The portal does not assume the first internal/personal organization is the correct destination when an explicit organization is selected.
5. Execute the handoff tests below, including direct API manipulation, then enable the sidebar flag for the pilot.

The migration does not seed production accounts or assign privileges to hardcoded emails or user IDs. The invitation UI supports existing accounts and new-account registration through the same Supabase Auth service.

## Verification

- `npm test`: existing tests plus portal language/input checks and real Postgres RLS/transaction tests using [PGlite](https://pglite.dev/docs/).
- `npm run build`: TypeScript, Vite and existing public-page build scripts.
- `npm run test:browser`: local Chrome review of desktop search/detail/forms, Spanish mobile behavior without horizontal overflow, and deliberate admin sharing controls. The test configuration uses the installed Chrome channel and port 8081; it starts Vite if needed. Preview tests do not prove authenticated browser integration.

Database tests cover isolation, cross-org admin denial, anonymous denial, forbidden direct writes/attribution injection, membership control, deactivation, incomplete submission rollback, idempotency, concurrency, assigned staff, private internal stages, invalid assignees, personal/internal/shared notes, revisions, and notification recipient isolation. Auth JWT delivery is simulated locally; actual Supabase sessions, RLS under deployed grants, and the complete production schema must also be exercised in staging.

Manual staging journey: representative A creates a draft, adds personal/shared notes and a follow-up date, submits, admin sees the inbox item, admin assigns staff, staff changes the internal stage, A still sees the last published stage, staff explicitly publishes progress, A receives an update. Representative B and a different organization's admin must see none of A's lead data. Deactivate A and verify direct API access fails without deleting the history.

## Deployment and rollback

The earlier security changes and this portal increment have separate deployment steps. A frontend deployment does not itself publish Supabase Edge Functions. Verify `agent-run` and `skill-run` were deployed through the Supabase function workflow as part of the prior security increment.

For this increment, deploy and verify the portal schema in staging before enabling the frontend link. No new provider keys are required; `VITE_ENABLE_AMBASSADOR_PORTAL` is the only new environment setting. Do not expose service-role keys to the browser.

Production release remains gated by the missing launch features, canonical migration reconciliation and a staging review. Roll back visibility by disabling the build-time navigation flag and returning to the prior frontend build. The flag does not revoke direct access to `/portal`; deactivate relevant portal memberships if access must stop. Preserve new tables/history. Do not drop populated portal tables or replay legacy migrations during rollback.

## Invitation onboarding and account routing

Administrators create a private link in Representatives. Creating the link does not send an email or other message automatically. The admin copies and shares it through an approved channel. Links expire after seven days; generating a replacement for the same organization/email cancels the previous link.

Tokens contain two random UUIDs and are stored as SHA-256 digests. The raw token is shown once to the issuing admin. The link uses a URL fragment, which is not sent in HTTP requests or referrers. The acceptance screen removes the fragment and keeps the token in that tab's session storage only until acceptance or expiry. No public invitation metadata lookup is provided. Even admins cannot select token digests through the browser table grants.

An invitee signs in through the existing `/auth` page or registers with the same Supabase Auth backend from `/portal-invite`. Acceptance requires the authenticated user's verified email to match the invitation. The invitation cannot supply a user ID, grant an internal organization role, override an existing membership, or reactivate a deactivated member through replay. Users explicitly click Accept invitation. No existing personal organization is deleted.

Configure the intended environment's Supabase Auth redirect allowlist to include `/portal-invite` and retain email verification. For a new account, the user verifies their email and reopens the original invitation link. The application supports this even when the verification email opens a different tab. Existing authentication email delivery and signup policies still apply; this increment does not provision or modify them.

After ordinary sign-in, active ambassador/developer/staff memberships route to the portal, even if signup also created a personal organization. Existing suite users without such memberships retain the dashboard landing page. Return destinations are restricted to local portal paths; external redirect targets are rejected.

Invitation creation, cancellation and acceptance have a database-enforced limit of 30 successful commands per user per minute. Invalid transactions roll back their counters along with their changes; gateway-level abuse throttling remains a separate launch requirement. Pending invitation history and access changes are admin-visible and audited without recording bearer tokens.

Additional automated checks cover verified-email binding, wrong-account denial, token-digest access denial, expiry/cancellation/replacement, replay after deactivation, stale membership overrides, command limits, safe sign-in destinations, and fragment-only invitation links. Browser tests review the invite dialog and reuse of the existing sign-in page without creating accounts or sending messages.


## Standalone LV Branding Advisor

The portal menu and dashboard open general advisor chat without selecting a lead. English and Spanish starter prompts cover introductions, discovery, objection practice and outreach. Replies can be edited and copied; nothing is sent automatically. Conversation state stays in React memory across portal tabs and clears on reload or leaving the portal.

Deploy candidate migration 003 after 001 and 002, then redeploy the updated `skill-run` Edge Function and frontend. The existing Claude credential is reused. The new mode requires an authenticated active portal member or org administrator; it rejects client-supplied lead/project context and custom system prompts. Its database RPC reads only access and the current user's explicit first-name fields, with the existing per-user request throttle. No CRM records are retrieved, and no transcripts are written to shared runs or snapshots.

This increment uses the existing agency identity prompt. Approved Knowledge Center retrieval, optional lead-aware mode, voice, durable private chat history and dedicated cost reporting remain future work. Provider integration is tested with mocked responses locally; verify a real authenticated response in staging after deployment.

## Invitation authentication correction

The invitation page now uses Supabase email-link sign-in for both new and existing accounts, rather than leading new users to password sign-in. No password is provisioned by a portal invitation. Legacy /auth?returnTo=%2Fportal-invite URLs redirect signed-out users back to invitation onboarding.

Required hosting configuration: Supabase Auth must allow https://marketing.lvbranding.com/portal-invite as a redirect, allow email authentication/new registrations for new invitees, and have working authentication email delivery. The signInWithOtp call uses the existing email template's link; it does not require changing templates to numeric OTPs. See https://supabase.com/docs/guides/auth/auth-email-passwordless.

The raw portal invitation token stays in tab session storage, never the authentication email request or redirect URL. After clicking the email link, return to the original invitation tab. If the link opens on a different device/browser, reopen the original invitation there after signing in. A missing token now gives those recovery instructions. Invitation acceptance still checks the verified invited email and requires explicit acceptance; authentication alone grants no portal membership.

This supersedes the password-signup instructions earlier in this document. No database migration or Edge Function deployment is required. Browser checks mock email requests and verify the absence of password inputs, invitation preservation and the legacy-route redirect. Actual email delivery and production redirect configuration still require a live check after frontend deployment.
