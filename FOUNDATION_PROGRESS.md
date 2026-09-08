# Portal foundation: first implementation increment

## Completed locally

- Both AI endpoints now verify bearer tokens through Supabase Auth `getUser(token)` rather than trusting decoded JWT subjects.
- Both require explicit organization scope and current internal team membership. This intentionally preserves internal-team access semantics; representative and branch-only grants are not enabled by this increment.
- Agent execution requires a project in the authorized organization and, when supplied, a parent run in that same project and organization. These checks happen before context use, run insertion, or provider calls.
- Skill execution checks that a supplied billing branch belongs to the authorized organization.
- Updated the five existing direct skill callers that omitted organization scope: contact research, research queue, intake strategy, project marketing context, and campaign email drafting.
- Added shared authorization unit tests and real-handler tests with mocked Auth/database/provider boundaries. These do not establish deployed RLS correctness.
- Added a read-only metadata audit in `supabase/schema-baseline-audit.sql`.

## Database reconciliation status

Supabase connection verified on September 8, 2026. CLI credentials work outside the sandbox; the sandbox-only attempt could not access them. Read-only migration and schema queries succeeded. No migration was applied and no function deployed.

Live schema and history evidence is saved in `docs/database/`. The first 11 migration identifiers match. Later history diverges: 29 local identifiers (012–041, with 033 absent) are not recorded under those identifiers, and 22 timestamped remote migrations are absent locally. This is history divergence, not proof that the corresponding tables are missing.

Recovered the original `20260519202226_add_agent_workspace` SQL into the evidence directory. Live `agent_runs` has 22 columns, RLS enabled, and organization-wide select/insert/update policies. Its project and parent-run foreign keys do not enforce matching organizations/projects. `projects.brand_snapshot` exists. The local endpoint checks are therefore necessary, and private portal conversation storage must not inherit these policies.

See `docs/database/RECONCILIATION.md` for the remaining migration work. Deno and Docker were not found on PATH during the initial checks; real database integration tests remain outstanding.

## Validation and release order

Run `npm test` and `npm run build`. Endpoint tests execute transpiled handlers with mocked external dependencies; the browser build does not type-check Deno functions. A Deno check and staging integration tests remain required before deployment.

Deploy the updated frontend callers before or together with the stricter skill endpoint. Older cached clients that omit organization scope will receive a validation error and need to refresh. No new environment variables or dependencies are required. Existing server configuration requires `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and `CLAUDE_API_KEY`; browser credentials remain unchanged.

Verify staging using two organizations: valid existing workflows succeed; forged/expired credentials, nonmembership, cross-org project IDs, cross-project parent IDs and cross-org branch IDs fail before provider usage or writes. Verify actual Auth signing configuration rather than relying on gateway JWT decoding.

## Remaining milestone 0 work

- Reconcile deployed schema, grants, RLS and invitation behavior, then add reproducible migrations and database security tests.
- Catalog and consolidate the nine agents and 33 skills; migrate caller-supplied instructions to a server-owned capability registry while preserving specialized internal workflows.
- Introduce explicit representative membership and invitation scope before enabling portal routes.
- Add authorization for representative lead context, private run persistence, durable rate limits and authoritative audit writes in the following foundation increment.

This is the first security increment, not completion of milestone 0 or the portal. It does not grant representatives access to existing internal AI endpoints.

## First portal workflow increment

Implemented a candidate additive portal schema and bilingual dashboard, lead list/detail, notes, next follow-up dates, submission, staff assignment/internal pipeline, deliberate shared progress, notification inbox and representative roster. A development-only `/portal-preview` uses fictional data and disables mutations. The normal `/portal` uses existing authentication and server/database authorization.

See `docs/portal/DEPLOYMENT.md` for tested scope, remaining MVP features, staging setup and rollback. The candidate SQL is outside the legacy migration directory until canonical history reconciliation. No portal schema was deployed. All 33 remote migration definitions were read and compared conservatively; the comparison report is in `docs/database/2026-09-08-migration-comparison.md`.

## Portal onboarding increment

Added expiring hashed invitation links, explicit acceptance by the invited verified account, role/access management UI, and portal-aware routing through the existing sign-in page. Existing personal workspaces are preserved. The second candidate migration is `202609080002_portal_invitations.sql`. Invitations are copied/shared manually; no messages, accounts, or memberships were created in production during this work.

Local verification now covers the database onboarding edge cases and the browser invitation/sign-in handoff. Configure and verify Auth redirect/email behavior in staging before inviting real representatives.

### Standalone advisor increment

Added general LV Branding Advisor chat from the portal menu/dashboard, without lead selection. Reuses skill-run with a dedicated portal-authorized mode, strict context allowlist, EN/ES prompts and editable drafts. Candidate migration 003 and updated function require staging deployment. Approved knowledge retrieval and voice remain pending.
