# Database reconciliation, September 8, 2026

Connection verified using the linked Supabase CLI outside the sandbox. All remote operations in this increment were read-only metadata queries. No application rows, private conversations, or lead records were requested. No remote migration repair, push, schema change, or deployment occurred.

## Evidence

- `2026-09-08-migration-history.json`: the 33 migration identifiers and names recorded remotely.
- `2026-09-08-schema-baseline.json`: columns, RLS flags, policies, selected grants and constraints for the foundation tables. This is a scoped snapshot, not a full database backup.
- `20260519202226_add_agent_workspace.sql`: recovered original migration, already applied remotely. Kept outside the executable migration directory to avoid duplicate policy creation or accidental replay.
- `../../supabase/schema-baseline-audit.sql`: reproducible read-only query. Returns one aggregated result because this CLI displays only the last result of multiple SQL statements.

## Confirmed differences and implications

Local and remote identifiers match through 011. There are 29 later local files and 22 remote timestamped entries without matching identifiers. Several remote names correspond to local features, but names alone do not establish SQL equivalence.

| Remote identifier | Remote name | Candidate local source |
|---|---|---|
| 20260408142325 | 016_feature_access | 016_feature_access.sql |
| 20260408151748 | 018_contacts_unique_org_email | 018_contacts_unique_org_email.sql |
| 20260408154636 | 019_email_blocks | 019_email_blocks.sql |
| 20260416204926 | file_drop | 020_file_drop.sql |
| 20260429162925 | contests | 029_contests.sql |
| 20260519202226 | add_agent_workspace | Missing; original now recovered as evidence |
| 20260526154836 | 032_file_shares | 032_file_shares.sql |
| 20260603224147 | 034_event_experiences | 034_event_experiences.sql |
| 20260610134118 | multi_round_selection | 035_multi_round_selection.sql |
| 20260716194644 | collaboration_standard | 036_collaboration_standard.sql |
| 20260716203818 | ccs_request_config | 037_ccs_request_config.sql |
| 20260716220335 | ccs_client_contact_link | 038_ccs_client_contact_link.sql |
| 20260716222544 | ccs_services_and_autonumber | 039_ccs_services_and_autonumber.sql |
| 20260904160631 | website_audit_report_email | 041_website_audit_report_email.sql |

Other remote entries include file-storage/share policy changes, intake contact linking, multi-file sharing, AV leads, and lead-form views. Inspect original statements and compare actual objects before choosing canonical migration files. Existing branch tables/policies are present despite local branch migration identifiers not being recorded. Do not treat missing history identifiers as missing functionality.

## Access findings

- `agent_runs` exists with 22 columns and RLS enabled. All three policies use organization membership; run contents are not user-private.
- Project and parent-run foreign keys enforce existence, but not matching tenant/project scope. Endpoint checks close that request path; direct database write policies still need separate hardening.
- `projects.brand_snapshot` exists and is shared project context. It must not store private representative lead context.
- Live `activity_log` insert policy has `WITH CHECK (true)` for public roles. It cannot serve as a trustworthy server-only portal audit log without changes.
- Live invitations have a public `SELECT` policy with `USING (true)`. A portal invitation flow must not reuse that visibility. Audit underlying grants and existing invite consumers before tightening legacy behavior.
- Projects also have branch access policies. Private representative membership must remain separate from internal organization/branch membership.

## Next implementation sequence

1. Retrieve the remaining historical migration statements and compare them to candidate local SQL and live objects. Preserve originals in an archive and establish one canonical replayable migration history.
2. Reproduce the baseline in an isolated database and test it before any remote history repair. Do not run `db push --include-all` against the current divergent history.
3. Prepare additive portal membership, private lead, note, follow-up and audit migrations on that baseline. Use organization-scoped relationships and server-controlled sensitive changes.
4. Run real RLS/API tests for two representatives, assigned staff, admins and multiple organizations, then implement the first portal journey and UI.
5. Review the exact staging migration/deployment set. The recovered historical SQL is not a deployment script.

The connection blocker is resolved. Migration reconciliation is started but not complete; the portal schema and UI have not yet been implemented.
