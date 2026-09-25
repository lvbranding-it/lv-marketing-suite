# LV Marketing Suite: Application Inventory Developed by Luis Velasquez

Everything currently built, counted from the codebase and the live database.
Regenerate the counts with the commands in [Keeping this current](#keeping-this-current).

For a plain-language index aimed at anyone who is not maintaining the code, see
[FEATURES.md](FEATURES.md). This document is the technical companion to it.

*Counts verified 25 September 2026.*

| | |
|---|---|
| Modules in the sidebar | 20, plus Settings |
| Routes | 94 (including two development-only previews) |
| Edge functions | 39 (excluding `_shared`) |
| Database tables | 108 (row-level security on all) |
| Migrations | 50 |
| AI skills | 33 |
| AI agents | 9 |
| Creative Canvas commands | 141 defined, 82 live |

**Stack.** React 19 · TypeScript (strict, ES2020 target) · Vite · Tailwind + shadcn/Radix ·
react-router v6 · TanStack Query · Supabase (Postgres, Auth, Storage, Edge Functions on Deno) ·
SendGrid. Tests run on vitest (`npm test`; 738 passing).

---

## The AI layer

Three distinct systems, often confused. **Skills** are single-shot specialists invoked for one job.
**Agents** hold a brief and produce a structured deliverable, carrying a brand snapshot between runs.
**Commands** act on the cards already in front of you inside the Creative Canvas.

| | Skills | Agents | Commands |
|---|---|---|---|
| Count | 33 | 9 | 141 (82 live) |
| Defined in | `src/data/skills/*.md` | `supabase/functions/agent-run/index.ts` | `src/lib/creative-canvas/commands/` |
| Routes | `/skills`, `/skills/:skillId` | `/agents`, `/agents/:projectId` | inside `/dashboard/creative-canvas` |
| Function | `skill-run` | `agent-run` | `creative-canvas-generate` |
| Data | `skill_outputs` (20) | `agent_runs` (218) | `creative_canvases` (2) |

Skills are Markdown with front-matter, so adding one is a writing task, not a coding task.

**The nine agents:** lead intel · brief→strategy & deliverables · offer builder ·
proposal/scope/pricing · content system · production coordinator · website audit/rewrite/SEO ·
client comms · project manager.

**The 33 skills**, by area:

- *Search:* seo-audit, ai-seo, programmatic-seo, schema-markup, site-architecture
- *Conversion:* page-cro, form-cro, popup-cro, signup-flow-cro, onboarding-cro, paywall-upgrade-cro
- *Measurement:* ab-test-setup, analytics-tracking
- *Creative:* copywriting, copy-editing, ad-creative, social-content, content-strategy
- *Acquisition:* paid-ads, cold-email, email-sequence, lead-magnets, free-tool-strategy, referral-program
- *Positioning:* launch-strategy, pricing-strategy, product-marketing-context,
  competitor-alternatives, marketing-psychology, marketing-ideas
- *Revenue:* sales-enablement, revops, churn-prevention

**The 141 commands**, by category: ugc 35 · people 25 · photography 22 · copy 20 · product 17 ·
brand 17 · canvas 5. A command is only marked `live` once its whole workflow is built and tested;
the remaining 59 are registered as roadmap and cannot be selected. Commands carry a safety
classification (`standard`, `person_likeness`, `synthetic_person`, `attested_claim`) which decides
what has to be attested before anything billable runs, and every result records its command,
provider, model, parameters, source assets, parent version, user, timestamp, status and estimated cost.

Both AI functions share an `AGENCY_CONTEXT` / `AGENT OS Rules` preamble, which is where house
writing rules live (including the no-em-dash rule).

---

## Getting and keeping clients

### Contacts · `/contacts`
The CRM. 96 records. Tags, pipeline stages, follow-up dates, deal values, and a research queue.

Sorted by **most recent activity** (`updated_at`, falling back to `created_at`), not by name and
not by creation date. This matters: the lead endpoint upserts by email, so a returning prospect
updates an existing contact and keeps its original `created_at`. Sorting by creation would hide
exactly the submissions the page exists to surface. Contacts touched in the last 48 hours are
flagged.

The desktop table's column widths live in a single `GRID_COLS` constant shared by the header and
the rows, and the header sits *inside* the scroll container. Both were misalignment bugs:
duplicated track lists drift, and a header outside the scroll box does not lose the scrollbar's
width the way the rows do. The class must stay one unbroken string literal or Tailwind's scanner
will not generate it.

Related: `contact_activities`, `contact_tag_definitions`.
Functions: `contact-verify`, `apollo-proxy`, `vibe-proxy`.

### Lead Forms · `/lead-forms`
Shareable public links with view counts, lead counts, conversion rate and last-lead time per form.
Eight funnels: seven service intake wizards plus the Campaign Calculator, each with an English and
a Spanish link. Spanish slugs are derived as `/es` + the English path, except the calculator, which
overrides via `esPath` to keep a Spanish keyword slug.

Views are recorded once per browser session, matching `ServiceLeadWizard`, so conversion compares
like with like. Data: `av_leads` (6), `lead_form_views`.

### Website Opportunity Audit · `/en/tools/website-opportunity-audit`
A public self-serve audit: a visitor submits a site, the `website-audit` function crawls and scores
it, and the report is delivered back. 15 audits run. English and Spanish, each with landing,
context, analyzing and results phases; the results pages are served from static HTML via
`vercel.json` rewrites rather than the SPA.

Six tables: `website_audits`, `website_audit_pages`, `website_audit_answers`,
`website_audit_findings`, `website_audit_leads`, `website_audit_events`, `website_audit_report_sends`.

**This module owns both scheduled jobs in the database** — see [Scheduled work](#scheduled-work).

### Email Campaigns · `/campaigns`
Compose from reusable blocks, send to a segment, track delivery. 12 campaigns, 639 recipients,
33 suppressed. Unsubscribes and bounces feed the suppression list automatically via
`email-webhook` and `email-unsubscribe`.

Failures are classified rather than treated alike (`_shared/email/bounce.ts`): a hard bounce
suppresses the address permanently, while a block, defer or drop is recorded as a failure for that
send and left in the list until it has failed `REPEAT_FAILURE_LIMIT` times. A recipient skipped for
being suppressed is recorded as `failed`, not `unsubscribed`, so the two numbers a sender most
needs to read honestly stay separate.

Composer and send function share `src/lib/campaigns/email-layout.ts` so the preview and the sent
mail cannot drift apart on padding, which is what a full-bleed image's negative margin has to cancel.

### Intake · `/intake`, `/intake/:orgId`
Structured client onboarding questionnaires, sent by link. 13 submissions.
Functions: `intake-notify`, `send-intake-invite`.

---

## Delivering the work

### LV Creative Canvas™ · `/dashboard/creative-canvas`
An authenticated React Flow creative-direction workspace connected to the existing project and
organization model. A normalized, vendor-independent LV scene keeps rich-content nodes, groups,
frames, private references and generated images, brand context, provider-neutral AI generation,
decisions, lineage, usage estimates, and PNG/PDF export in one project context. Deployed; schema
and `creative-canvas-generate` are live. See `docs/creative-canvas/`.

Arrows carry meaning: an **association** arrow passes context from one card to the next, a
**sequence** arrow means "this comes after that" and deliberately does not. Batch export reads a
sequence chain to number a series; without one it falls back to reading order. Note that
`GraphEdge` expects `edge.kind` while React Flow stores `edge.data.kind` — the two are structurally
compatible, so a missing conversion type-checks and passes tests while doing nothing. There is a
regression test asserting the unconverted form fails.

### Collaboration / CCS · `/ccs`
The **Creative Collaboration Standard**: acknowledgment requests sent to contributors, capturing
signatures, AI-input disclosures and prior-use disclosures, with participant correction requests
and a full audit trail. Participants sign at `/review/:token` without an account. 3 requests.

Thirteen tables (`ccs_clients`, `ccs_projects`, `ccs_templates`, `ccs_requests`, `ccs_responses`,
`ccs_intended_external_input`, `ccs_prior_use_disclosures`, `ccs_signatures`, `ccs_snapshots`,
`ccs_uploaded_references`, `ccs_participant_correction_requests`, `ccs_admin_notes`,
`ccs_audit_logs`). This is the most substantial subsystem in the app relative to how little
surface area it takes in the sidebar.

### Photo Sessions · `/photo-sessions`
Client proofing galleries with per-photo comments and selections, then published deliverables.
1 session, 8 photos currently. Sessions can be invoiced, including top-ups.
Functions: `get-photo-urls`, `get-deliverable-urls`, `publish-deliverables`, `finalize-session`,
`client-upload`, plus four invoicing functions.

> The September edition of this document recorded 197 photos. The table now holds 8. Either the
> earlier figure counted something else or the data was cleared; it has not been investigated.

### Event Experiences · `/event-experiences`
Live event photo capture. Guests upload from `/event/:slug/upload`; `/event/:slug/live-screen`
displays the stream in the room. 156 photos, 129 approved.

The live screen is built to be a source into a video switcher, so it must never need reloading
mid-show. It subscribes to `postgres_changes` on `event_photos` and refetches on approval; the
slideshow timer itself is client-side and makes no Supabase requests. `event_photos` was only added
to the `supabase_realtime` publication on 25 September — before that the subscription reported
SUBSCRIBED and received nothing, and the screen was being kept current by React Query's
`refetchOnReconnect` and `refetchOnWindowFocus` instead. It therefore worked at most events and
would have failed on any night the network held and nobody touched the machine.

An active event with no page open consumes nothing; an open live screen holds one Realtime
connection and receives one small message per approval.

### File Drop · `/files`
Request files from a client by link (`/upload/:token`), share finished files back
(`/download/:token`, `/share/:shareToken`). 134 submissions across 8 requests, 5 shares.

### Projects · `/projects`
The unit of work everything attaches to: agent runs, skill outputs and collaboration records all
hang off a project. 20 active. A project's marketing context is what makes Skills and Agents write
about a specific business rather than generically.

### Workspace · `/workspace`
Block-based page tree for notes, drafts and operating docs, with page-scoped uploads.
14 pages, 147 blocks.

---

## Publishing and audience

### Social Publisher · `/social-publisher`
Plan a message once, adapt it per network, publish with control. Posts carry per-network variants,
assets and an approval step; publishing runs through jobs with recorded attempts rather than a
fire-and-forget call. No accounts connected and no posts yet.

Twelve tables (`social_posts`, `social_post_variants`, `social_post_assets`, `social_campaigns`,
`social_approvals`, `social_accounts`, `social_account_credentials`, `social_connections`,
`social_oauth_states`, `social_publish_jobs`, `social_publish_attempts`, `social_activity_log`,
`social_publisher_settings`).
Functions: `social-publish`, `social-meta-oauth`.

### Contests · `/contests`
Multi-round public voting with verification. 1 contest, 10 contestants, 602 votes,
1,028 verifications. Public routes: `/vote/:slug`, `/vote/:slug/verify`, `/embed/:slug` for
embedding elsewhere.
Functions: `contest-vote`, `contest-verify`, `advance-round`.

### History · `/history`, `/outputs`, `/outputs/:outputId`
Every skill and agent output, kept, searchable, printable and shareable. Agent transcripts and the
brand context sheet export to PDF or Word through `src/lib/agents/document-export.ts`, which renders
on the LV letterhead and prints via the browser's own pipeline so the PDF keeps real text and
pagination rather than being a rasterised canvas.

---

## Scheduling

### Event Scheduling · `/events/admin`
Create events, share booking links, manage guest check-in. Public at `/events`, `/events/:eventId`.
No events created yet.
Tables: `event_schedule_events`, `event_schedule_bookings`, `event_schedule_blocked_slots`.
Function: `event-schedule-confirmation`.

### Appointment Calendar · `/appointments`
Schedule prospects, route them to the right host, keep calendars in sync through connected
providers. Public booking at `/book`, `/book/:slug` and the Spanish equivalents. 1 host, 1 booking.

Seven tables (`appointment_booking_pages`, `appointment_bookings`, `appointment_hosts`,
`appointment_host_availability`, `appointment_busy_blocks`, `appointment_calendar_connections`,
`appointment_oauth_states`).
Functions: `appointment-availability`, `appointment-booking`, `appointment-management`,
`appointment-calendar-oauth`.

---

## Ambassador Portal · `/portal`

A separate, role-isolated surface for ambassadors and business developers. They see their own
leads, follow-ups, notes and commissions and none of the agency's internal data; role isolation is
enforced in the database, not the UI. 4 memberships, 1 lead.

Invitations are issued at `/portal-invite#invite=<token>`, claimable only by the invited address
and only with a confirmed email. The token is held in `localStorage`, not `sessionStorage`: the
sign-in link arrives by email and a mail client opens it in a new tab, so a token scoped to one tab
was lost exactly when it was needed. Click tracking is disabled on these sends, because a sign-in
link should never travel through a third-party redirector.

**BOSS** is the AI advisor inside the portal, and the name representatives use to address it. Its
identity lives in `ADVISOR_RULES` (`supabase/functions/_shared/portal-advisor.ts`), which states
explicitly that the name confers neither authority over the user nor personhood. Voice input uses
continuous recognition with live interim results and a 45-second silence limit; replies can be read
aloud through `advisor-speak`, falling back silently to the browser's own voice when the branded
one is unavailable.

Fourteen `portal_*` tables. Functions: `portal-send-invitation`, `advisor-speak`.

---

## Free public tools

No account required. They exist to earn attention and, for the calculator, to convert it.

| Tool | Route |
|---|---|
| Campaign Investment Calculator | `/campaign-investment-calculator` · `/es/calculadora-de-inversion-en-campanas` |
| Website Opportunity Audit | `/en/tools/website-opportunity-audit` · `/es/tools/auditoria-de-oportunidades-web` |
| QR Generator | `/qr-generator` |
| Image Studio | `/image-studio` |
| Motion Palette | `/motion-palette` |
| Email Signature Generator | `/email-signature-generator` |

The calculator is documented separately in [CAMPAIGN_CALCULATOR.md](CAMPAIGN_CALCULATOR.md).
Motion Palette loads a Lottie animation, lists every colour and gradient ramp it uses, and
recolours it to a brand palette.

---

## Public service pages

Seven services, each a landing page with its own multi-step intake wizard, in English and Spanish.
All post to `submit-av-lead` and arrive in Contacts tagged by service.

| Service | Route | CRM tag |
|---|---|---|
| AV & Event Production | `/av-event-production-houston` | AV Production Lead |
| Industry Web Solutions | `/industry-web-solutions-web-app-development` | Web Solutions Lead |
| UX/UI Web Design | `/ux-ui-web-design-user-experiences-web-development` | UX/UI Design Lead |
| Creative Strategy & Content | `/creative-strategy-content-design-houston` | Creative Content Lead |
| Photography & Video | `/commercial-photography-video-production-houston` | Photo & Video Lead |
| Brand Strategy & Identity | `/brand-strategy-identity-houston` | Brand Strategy Lead |
| Digital Marketing & Paid Media | `/digital-marketing-paid-media-houston` | Digital Marketing Lead |

Spanish versions live at `/es/` + the same slug. Spanish submissions carry `lang: "es"`, which
switches the auto-reply to Spanish and adds the `Español` CRM tag.

---

## Accounts, teams and branches

Everything is scoped to an organization; every table has row-level security enabled.
Branches sit underneath an organization with their own members, budgets and usage tracking.

| Concern | Where | Data |
|---|---|---|
| Sign in | `/auth` | `profiles` (7) |
| Organization | `/settings` | `organizations` (4) |
| Team and roles | `/settings` | `team_members` (5) |
| Invitations | `/accept-invite` | `invitations` (11) |
| Branches | `/settings` | `org_branches` (1), `branch_team_members`, `branch_invitations`, `branch_usage_events` (36) |
| Activity | across the app | `activity_log` |

Branch infrastructure is fully built but barely exercised: one branch against 36 usage events.
Either dormant capacity or an unfinished direction.

---

## Edge functions

Work that cannot happen in the browser: anything needing a secret, a third party, or the authority
to bypass row-level security. 39 in total.

| Purpose | Functions |
|---|---|
| AI execution | `skill-run`, `agent-run`, `creative-canvas-generate`, `advisor-speak` |
| Leads and enrichment | `submit-av-lead`, `intake-notify`, `send-intake-invite`, `contact-verify`, `apollo-proxy`, `vibe-proxy` |
| Website audit | `website-audit` |
| Photo and file delivery | `get-photo-urls`, `get-deliverable-urls`, `publish-deliverables`, `finalize-session`, `client-upload` |
| Invoicing | `create-session-invoice`, `send-session-invoice`, `create-topup-invoice`, `send-topup-invoice` |
| Email | `send-campaign`, `email-webhook`, `email-unsubscribe` |
| Team access | `accept-invitation`, `invite-member`, `invite-branch-member` |
| Ambassador portal | `portal-send-invitation` |
| Contests | `contest-vote`, `contest-verify`, `advance-round` |
| Collaboration | `ccs-client`, `ccs-send-invite` |
| Social publishing | `social-publish`, `social-meta-oauth` |
| Scheduling | `appointment-availability`, `appointment-booking`, `appointment-management`, `appointment-calendar-oauth`, `event-schedule-confirmation` |

**`submit-av-lead` is the shared lead backend for all eight public funnels.** It inserts to
`av_leads`, upserts the CRM contact by email, emails the team, and sends the prospect a branded
auto-reply, with the CRM sync and both emails best-effort, so a SendGrid or CRM failure never
loses the lead or blocks the visitor's confirmation. Adding a funnel means adding a `FORM_CONFIGS`
entry, not a new function. An unknown `source` falls back to `av-landing`, which is how a
correctly-saved lead can still arrive mislabelled if the function has not been redeployed.

---

## Scheduled work

Two `pg_cron` jobs, both belonging to the Website Opportunity Audit:

| Schedule | Job |
|---|---|
| `17 3 * * *` | `purge_expired_website_audits()` |
| `* * * * *` | `POST /functions/v1/website-audit` with `{"action":"drain"}` |

The drain runs **every minute, continuously** — roughly 43,000 function invocations a month whether
or not an audit is waiting. It is by some distance the largest standing consumer of Supabase
resources in the system, and worth revisiting if invocation volume ever matters.

## Realtime

Four tables are published to `supabase_realtime`, and only these four receive
`postgres_changes`: `event_photos`, `event_schedule_events`, `event_schedule_bookings`,
`event_schedule_blocked_slots`. A subscription to any other table will report SUBSCRIBED and then
stay silent, which is a failure mode that looks like working software — add the table to the
publication in a migration at the same time as writing the subscription.

---

## Keeping this current

```bash
# Routes
grep -c 'path="' src/App.tsx

# Edge functions (excluding _shared)
ls supabase/functions | grep -v '^_' | wc -l

# Skills
ls src/data/skills/*.md | wc -l

# Agents
grep -cE "^  [a-z_0-9]+_v[0-9]+: \{" supabase/functions/agent-run/index.ts

# Migrations
ls supabase/migrations/*.sql | wc -l

# Sidebar modules (Settings is rendered separately and not in this array)
grep -c 'labelKey: "nav\.' src/components/layout/AppShell.tsx
```

Creative Canvas command counts come from `COMMANDS` in
`src/lib/creative-canvas/commands/catalog.ts`. Table counts and row counts come from the Supabase
dashboard or `list_tables` / `execute_sql`.
