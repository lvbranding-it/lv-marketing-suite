# Ambassador Portal, Branding Intelligence, and Voice: implementation plan

Planning baseline: September 8, 2026. Covers both supplied briefs. This document proposes implementation; it does not change application code or apply migrations.

## Recommended direction

Extend this application with a private representative workspace, an internal opportunity workspace, and one shared knowledge and conversation layer. Reuse Supabase authentication, the existing chat components and Claude integrations, React Query, and the LV design system. Release in milestones so voice does not delay secure lead handoffs. The full expansion remains in scope even where it follows the portal MVP.

## Repository audit

These findings come from checked-in source. Production schema, deployed function settings, actual knowledge content, and provider account configuration have not been verified.

| Area | Existing implementation | Planning implication |
|---|---|---|
| Application | React 19, TypeScript, Vite 8, React Router 6; lazy routes in `src/App.tsx`; React Query | Add portal routes and reuse application providers. |
| Authentication | Supabase sessions in `src/hooks/useAuth.tsx`; session-only `ProtectedRoute` | Retain sign-in; add capability-aware navigation and server enforcement. |
| Organization access | `useOrg.tsx`, `team_members`, `branch_team_members`, RLS helpers | Existing roles are owner/admin/manager/member and regional_ceo/manager/crew. None is a private representative role. |
| Onboarding | Migration 003 creates a personal organization and owner membership on signup; existing invitation functions and acceptance page | Portal invitations must resolve the intended organization explicitly; selecting the first membership is insufficient. |
| Database | Supabase Postgres, RLS, numbered SQL migrations through 041 | Use additive migrations; reconcile deployed schema first. |
| CRM | `Contacts.tsx`, `useContacts.ts`, contact form, slide-over, pipeline; migrations 004/006/010/018 | Reuse UI patterns and authorized contact linking. Existing contacts have six stages, flat CRM notes, org-wide access, and an org/email uniqueness constraint. They do not represent private attributed opportunities. |
| AI agents | Nine agent definitions in `src/lib/agents.ts`; client keyword router; `AgentWorkspace.tsx`, `AgentRunChat.tsx`, `useAgentRuns.ts`; `agent-run` invokes Claude | Extend the existing conversation experience; move authoritative routing and context assembly server-side. |
| Skills | 33 definitions in `src/data/skills.ts`, markdown instructions and `skillPrompts.ts`; `useSkillRunner.ts`, `src/lib/claude.ts`, `skill-run` | The repository has 42 agent/skill entries, with potential overlap, rather than exactly 37. Catalog capabilities before consolidation. Skill output already streams; agent runs currently return JSON. |
| Knowledge | Agency identity embedded in `skill-run`; agent prompts; project marketing context and brand snapshots; editable Workspace pages/blocks; service landing pages | These are source candidates, not automatically approved company facts. No shared approved retrieval/versioning system was identified in inspected code. |
| Admin | `Settings.tsx` contains account, organization, branches, team, activity; management is distributed across feature pages | Add internal portal pages within the same shell and reuse account/team conventions. |
| Notifications | SendGrid in `intake-notify`; other email functions; website-audit durable notification/retry mechanism | Reuse delivery patterns behind a common service. No general personal notification inbox was identified. |
| Content editing | `Workspace.tsx`, `useWorkspace.ts`, workspace pages/blocks; existing file features | Reuse editor patterns, but existing org/branch-wide workspace policies cannot protect approved/internal knowledge by themselves. |
| Design/localization | Radix/shadcn-style UI, Tailwind LV tokens, Fira Sans, `AppShell`, `Header`, `useLanguage.tsx` EN/ES dictionaries | Extend existing tokens and translation keys; include validation, accessible labels, and empty/error states. |
| Tests | Vitest and existing feature tests | Add database integration tests and browser journeys; unit tests alone cannot establish RLS safety. |

### Foundation issues to resolve before representative rollout

1. CRM and Workspace RLS grants broad membership access. Adding representatives to normal LV `team_members` would grant unintended access even if navigation is hidden.
2. In inspected code, `agent-run` decodes a JWT payload and loads a caller-selected project using a service-role client without a visible organization-membership check. `skill-run` also decodes tokens and accepts caller-supplied instructions; its organization check is conditional. Verify deployed gateway behavior, then require verified identity and explicit authorization inside both endpoints. Never treat JWT decoding as verification.
3. Application code references `agent_runs` and `projects.brand_snapshot`, but their schema definitions were not found in checked-in migrations. Capture and reconcile the actual schema and policies before modifying persistence.
4. Existing agent prompts require discovery questionnaires, expose structured snapshot output, and include default payment terms. The advisor needs concise answers, hidden technical details, approved facts, and no invented terms. Keep specialized deliverable formats where useful, with a shared policy layer taking precedence.
5. `activity_log` has a permissive insert policy in migration 011. It is not sufficient evidence for an authoritative audit trail. Audit writes must originate from verified server/database actions.

## User journeys and navigation

Representative: accept invitation → choose language/profile → daily dashboard → capture a draft → review duplicate warning → add notes/follow-up → explicitly select lead in AI → edit/save a draft → submit → see safe updates and personal follow-ups.

Internal team: submission inbox → review or request missing details → assignment → follow-up → pipeline updates → shared progress update → outcome. Administrator additionally manages representative access, stage configuration, merges, exports, reports, and knowledge publishing.

Use `/portal` for Dashboard, My Leads, Add Lead, Follow-ups, Notes, AI Assistant, Resources, and Profile. Use `/portal/admin/*` for All Leads, Representatives, Assignments, Pipeline, Reports, Knowledge, and Settings. Team members receive assigned-work views without user-management controls. Reuse the existing assistant UI in a portal presentation; do not create a second chatbot.

Dashboard: actionable totals, due/overdue tasks, submitted/qualified/won counts, recent authorized activity, and two quick actions. Lists use server pagination, stable sorting, table/card views, search, filters, and mobile cards. Saved filters follow core filtering if needed.

## Access model and permission matrix

Retain current organization and branch roles. Add organization-scoped portal membership/capabilities referencing the same authenticated users. Ambassador and business developer are portal roles, not broad internal membership. Existing owner/admin maps to portal administration for that organization. Staff access requires an explicit grant; branch leadership does not automatically grant access to every portal lead.

| Action | Ambassador | Business developer | LV team member | Administrator |
|---|---|---|---|---|
| Read leads | Own attribution | Own; explicit team grant if enabled | Assigned | All within authorized organization |
| Create/edit | Own draft; permitted fields after submission | Same | Assigned operational fields | All permitted fields |
| Submit | Own | Own | Only if explicitly granted | Yes |
| Internal stage / won / sensitive sales values | No | Only explicit capability | Assigned, permitted transitions | Yes |
| Assign, merge, export | No | Only separately authorized reporting/export scope | No by default | Yes, audited |
| Personal notes | Author only | Author only | Author only | Own only |
| Shared notes | Own leads | Authorized leads | Assigned leads | Authorized leads |
| Internal notes | No | No by default | Assigned leads | Authorized leads |
| Knowledge | Public + representative | Public + representative | Also internal | Also administrator |
| Users/settings/audit | No | No | No | Organization-scoped |

Personal note confidentiality takes precedence over “complete audit trail”: administrators see action metadata, not another author's personal note body. Record this distinction in the UI and documentation. Revocation must take effect on the next protected request, including active chat retrieval and file access. Scope database relationships by organization to prevent cross-tenant assignments or links.

## Proposed data model

Names are provisional until deployed-schema reconciliation.

| Entity | Purpose and important rules |
|---|---|
| Existing `profiles` | Add explicit preferred first name, first name, preferred language, and timezone as needed; never derive the signature name from an email. |
| `portal_memberships` | User, organization, role, active state, granted capabilities, optional team scope, inviter, timestamps. Also supplies representative identity; avoid a redundant profile table initially. |
| `portal_invitations` | Reuse invitation service with portal-specific scope, expiration and one-time acceptance; no broad team membership side effect. |
| `lead_stages` | Organization configuration; seed all 14 requested stages, stable identifiers, ordering, transition permissions, terminal semantics, and EN/ES labels. |
| `leads` | All requested required/optional contact and opportunity fields; creator, immutable original representative, current assignee, stage, submission state, timestamps, archive state, optimistic version. Require email or phone. Permit incomplete drafts; validate full required fields at submission. |
| `lead_sales_details` | Internal values, loss reason and sensitive sales information separate from representative-readable fields. RLS does not hide individual columns. |
| `lead_notes`, `lead_note_revisions` | Personal/shared/internal visibility; immutable original timestamp; edit history; retention aligned with note visibility. |
| `lead_activities` | Append-only visibility-aware timeline including stage and assignment history, submissions, calls, meetings, saved AI drafts. Derive assignment history here rather than duplicating it in another table. |
| `lead_followups` | Lead, authorized assignee, type, priority, due time, completion/cancellation, reminder schedule and completion notes. Derive overdue from time and status. |
| `notifications`, `notification_outbox` | Recipient-private inbox plus transactional durable delivery/retry jobs. Payloads contain no hidden note content. |
| `portal_audit_events` | Immutable actor/action/target/time and minimal change metadata; database/server-only inserts; restricted reads; export and permission events included. |
| `knowledge_resources`, `knowledge_versions`, `knowledge_chunks` | Resource metadata, immutable versions, approval and effective/expiry dates, language links, audience, source provenance, retrieval text and optional embeddings. Resources UI uses the same published catalog. |
| Capability registry and resource mappings | Map existing agent/skill IDs to authorized execution and relevant approved resources, without copying company content into each prompt. |
| Conversation persistence | Adapt existing run storage after audit; add owner-scoped conversations/messages where required. Lead context is opt-in and must never be written into shared project snapshots. |
| AI usage/feedback/action proposals | Minimal routing/source-version/latency/usage metadata; feedback categories; expiring confirmed-action proposals with replay protection. Private transcripts are not general admin telemetry. |

Start with the lead's primary contact fields and optional authorized `contact_id` link. Add multiple-contact relations only when needed. Tags can use an array initially. Existing CRM contacts remain the company address book; leads are attributed opportunities. Do not automatically copy portal personal data into broadly readable contacts. Any internal linking/promotion is explicit and authorized.

Submission, assignment, stage changes, merges, and confirmed AI changes use transactional database commands. Enforce permitted columns and transitions server-side, lock or version concurrent updates, and append activity/audit plus notification jobs in the same transaction. Stable idempotency keys prevent duplicate submissions on retries.

Duplicate detection runs server-side against authorized organization data, normalizing email, phone and domain. Return a generic possible-match warning without identifiers or counts for inaccessible leads; rate-limit enumeration attempts. Admin merging archives the duplicate, records a canonical link, preserves both origin records and histories, and does not combine personal note visibility. Reports deduplicate outcomes while retaining contributor attribution.

Representatives see an explicitly published progress value and shared updates, not automatic disclosure of every internal stage transition. Returning a submission preserves attribution and prior submission timestamps.

## Shared intelligence and knowledge

One server pipeline: verify identity and scope → determine intent → choose authorized capability → retrieve approved knowledge → retrieve minimal explicitly selected lead context → run existing capability → present coherent advisor response → apply central signature → optionally synthesize speech.

Unify the nine agents and 33 skills behind a registry. Resolve overlaps; do not delete capabilities solely to reach the brief's approximate count. Low-confidence routing asks one focused question. Limit routing hops and spend. Every entry point, including direct skill calls, must use the same policy and knowledge layer. Use server-owned instructions selected by ID, not client-supplied authoritative prompts.

Knowledge Center supports manual content, supported documents, URL imports, categories, language pairs, audiences, approval, version history, expiration/review dates, agent mappings and an admin-only preview. Initially import existing agency context and chosen Workspace/service content as drafts. A designated LV editor approves facts before retrieval. Uploaded or website text is untrusted data, never an instruction. Restrict fetch destinations/redirects and file sizes/types; use private storage with authorized short-lived downloads. Do not copy existing public share-token patterns for internal knowledge.

Filter organization, audience, publication state and dates before retrieval ranking. Preserve source/version references. Full-text retrieval can precede embeddings; choose embedding/vector infrastructure only after a retrieval evaluation. Withdrawn knowledge must invalidate caches. No source means an explicit knowledge gap, particularly for claims, clients, pricing, results and credentials.

Lead context is visibly selected, removable, and task-limited. Recheck access every turn. Removing context excludes previous lead-bearing messages from future provider requests or starts a clean context segment; it cannot merely clear a badge. Changing permissions must similarly prevent replay of previously authorized content. Keep lead facts separate from company knowledge.

Central response formatting adds exactly once: `Remember, {firstName}, we are Strategy First. Always.` Use the specified nameless fallback. Apply to completed user-facing chat answers and their spoken version, not raw errors, partial streams, machine JSON, or embedded outreach drafts. Preserve the exact English line even in Spanish answers unless the brand owner changes the requirement. Strip technical specialist artifacts before final presentation and speech.

AI mutations always produce an editable preview. A separate confirmation request revalidates actor, fields, target version and permission before a transaction; model output alone cannot execute. Log the resulting action without copying the whole private conversation.

## Voice architecture

Keep the existing conversation provider and add replaceable speech-to-text and text-to-speech adapters. No speech stack was identified in inspected code. Select services during a focused implementation spike using then-current official documentation, account availability, EN/ES quality, browser behavior, latency, privacy and cost. No provider purchase or current API recommendation is part of this plan.

First deliver push-to-talk: explicit microphone activation → visible recording state → live/near-live editable transcript → user submit → streamed text → optional audio. Support stop/pause/resume/replay, interruption, input language override/automatic detection, independent spoken-response toggle, and speed where supported. Use licensed synthetic voices and pronunciation checks for branded phrases.

Then add opt-in conversational sessions with visible listening state, interruption, idle timeout, reconnection and clean microphone shutdown on exit. Keep review-before-submit available; hands-free auto-submit behavior needs an explicit product choice. Voice-to-lead remains preview → edit → confirm in either mode.

No permanent audio storage by default. Define transcript retention and deletion controls; enforce scoped storage, request limits, session budgets and provider data-use settings before enabling lead data. Do not claim a no-training guarantee until contractual/account settings are verified. Fall back to text when microphone, transcription or synthesis fails.

## Delivery and migration sequence

| Milestone | Deliverables | Exit gate |
|---|---|---|
| 0. Reconcile and harden | Deployed-schema comparison, capability inventory, verified auth, project/run ownership checks, invitation journey, source approval owner | Existing tests pass; direct unauthorized AI requests fail; migration baseline reproducible. |
| 1. Secure data foundation | Portal membership, leads/stages, notes/revisions, tasks, audit, transactional commands; EN/ES validation; fixtures | RLS and mutation tests pass using real authenticated roles, including cross-org and revoked users. |
| 2. Representative portal | Dashboard, lead forms/list/detail, duplicate warning, notes, follow-ups, submission, mobile UI | Representative can complete the entire capture-to-handoff journey. |
| 3. Internal operations | Assignment, pipeline, returns/shared progress, notification inbox/retries, basic reports, admin merge/export | Team can handle and close an opportunity; attribution/history survive merge and deactivation. |
| 4. Knowledge and advisor | Knowledge Center, approved resource catalog, shared retrieval, server routing, opt-in lead context, signature, feedback | Bilingual grounded-answer, injection, and access-isolation evaluations pass across both AI entry points. |
| 5. Voice | Provider spike, push-to-talk/transcript review, playback controls, confirmed voice-to-lead; then conversational mode | EN/ES desktop/mobile end-to-end tests; no writes without confirmation; no background recording. |
| 6. Release readiness | Regression/accessibility checks, retention and usage controls, documentation, deployment rehearsal and pilot | Acceptance criteria from both briefs satisfied for the enabled milestone; existing features still work. |

Portal MVP comprises milestones 0–4 with basic reporting and the existing assistant integration. Voice is a subsequent expansion milestone, not silently dropped from scope. No automated outreach, scraping, commissions, email/calendar/CRM sync, or autonomous decisions are added.

Migration batches: baseline reconciliation first; then identity/access; leads/workflows/RLS; notifications/reporting; knowledge/versioning; conversation/telemetry. Allocate the next migration numbers at implementation time. Seed all requested stages and test identities in non-production fixtures only. Avoid deleting or rewriting existing lead/contact history. Index ownership, organization, stage, assignee, due date, normalized duplicate keys and paginated sort fields.

Deploy backward-compatible schema and functions before feature-flagged UI. Validate staging with production-like synthetic data, verify backup/restore procedures, pilot with a small representative group, then expand. Roll back by disabling new features and restoring the prior application/functions while retaining new data and additive tables. Do not use destructive down migrations. Rehearse recovery and record any compatibility requirements.

## Planned file changes

Existing files likely to change:

- `src/App.tsx`; `src/components/layout/AppShell.tsx`, `Header.tsx`; `src/hooks/useOrg.tsx`, `useLanguage.tsx`: routes, portal scope, navigation and translations.
- `src/pages/Settings.tsx`, `AcceptInvite.tsx`; invitation functions: portal onboarding and access management.
- `src/pages/AgentWorkspace.tsx`, `src/components/agents/AgentRunChat.tsx`, `src/hooks/useAgentRuns.ts`, `useSkillRunner.ts`, `src/lib/agents.ts`, `src/lib/claude.ts`: shared conversation presentation, secure capability selection, context and voice controls.
- `src/data/skills.ts`, `src/data/skillPrompts.ts`; `supabase/functions/agent-run/index.ts`, `skill-run/index.ts`: shared registry/policy integration, secure execution and approved knowledge.
- `src/integrations/supabase/types.ts`, `supabase/config.toml`, `package.json`, `.env.local.example`, `README.md`: types, function settings, necessary test tooling and setup documentation. Never write secrets into examples.
- Contact components/hooks only where reusable UI extraction or explicit authorized contact linking is needed; retain existing CRM behavior.

Proposed new files/directories:

- `src/pages/portal/*`, `src/components/portal/*`, `src/hooks/usePortalAccess.ts`, `useLeads.ts`, `useFollowups.ts`, `useNotifications.ts`, `useKnowledge.ts`.
- `src/lib/portal/*`, `src/lib/voice/*`, `src/components/voice/*`, translation modules consumed by the current language provider.
- `supabase/functions/_shared/{authorization,knowledge,capabilities,brand-rules,ai-context,notifications}.*`; portal command, knowledge ingestion, notification worker and speech endpoints as needed.
- Additive `supabase/migrations/*`, `supabase/tests/*`, portal/AI unit tests and browser journey tests.
- Setup, environment variable, permissions, retention, knowledge-publishing, deployment and rollback documentation. Final implementation supplies an actual changed-file list.

## Acceptance and verification

Test same-org representative A versus B, different organizations, assigned/unassigned staff, admins, optional developer grants, anonymous users, expired invitations, and deactivated users. Attempt direct REST/RPC/function access and forged IDs; do not rely on UI tests for isolation. Test note bodies, revisions, activities, exports, knowledge chunks, files, cached responses, historical conversation context and duplicate warnings as separate leak paths.

Verify transactional submission and stable attribution, unauthorized stage/ownership changes, concurrent edits, notification retries, note timestamp preservation, merged-lead history, archival, pagination/filter/sort, due-time handling and EN/ES dictionary parity. Check keyboard flow, focus, readable badges, mobile forms and voice interruption.

AI evaluations cover grounded company facts, unknown pricing/results, unsafe source instructions, EN/ES routing, hidden technical outputs, context removal, revoked access, exact signature behavior and confirmation replay. Voice tests include denied permissions, language switching, transcription edits, disconnects, timeout, disabled audio and no persistent audio artifacts.

Reports: submitted/qualified/won/lost counts, conversion rate with a documented denominator, current estimated pipeline and won value, time from submission to first staff contact activity, and last meaningful portal activity. Use historical transition timestamps and distinguish submission cohorts from current-stage counts. Keep commercial values admin-facing unless explicitly shared.

## Decisions and working assumptions

The plan can proceed with these defaults; settle them before dependent implementation:

1. Portal is invitation-only; representatives have no automatic access to internal tools or branch data.
2. LV organization owner/admin administers the portal; other internal staff require assigned-work access. Confirm whether representatives belong to branches and who may see across branches.
3. After submission, representatives may add shared notes/follow-ups and permitted contact corrections, while staff controls pipeline and internal values.
4. Personal notes remain author-only, including against admins; audit metadata remains available. Knowledge audience does not grant access to private conversations.
5. An LV knowledge owner must supply/approve source content before advisor launch. Existing website and prompt statements are draft candidates.
6. Transcript retention duration, expected representative volume, concurrent voice usage and monthly AI/speech budget need business input before voice launch.
7. Keep the exact requested English closing line in both languages. Conversational mode begins after push-to-talk; decide explicitly whether its transcripts auto-submit.

Next implementation unit: milestone 0 and the security-tested data foundation, followed by one complete create → submit → assign → shared-update journey. Calendar estimates should follow schema reconciliation and agreement on pilot size, content readiness and voice scope.
