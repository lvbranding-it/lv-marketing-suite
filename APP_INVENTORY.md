# LV Marketing Suite: Application Inventory Developed by Luis Velasquez

Everything currently built, counted from the codebase and the live database.
Regenerate the counts with the commands in [Keeping this current](#keeping-this-current).

| | |
|---|---|
| Modules | 16 |
| Routes | 69 |
| Edge functions | 28 |
| Database tables | 53 (row-level security on all) |
| AI skills | 33 |
| AI agents | 9 |

**Stack.** React 19 · TypeScript (strict, ES2020 target) · Vite · Tailwind + shadcn/Radix ·
react-router v6 · TanStack Query · Supabase (Postgres, Auth, Storage, Edge Functions on Deno) ·
SendGrid. Tests run on vitest (`npm test`).

---

## The AI layer

Two distinct systems, often confused. **Skills** are single-shot specialists invoked for one job.
**Agents** hold a brief and produce a structured deliverable, carrying a brand snapshot between runs.

| | Skills | Agents |
|---|---|---|
| Count | 33 | 9 |
| Defined in | `src/data/skills/*.md` | `supabase/functions/agent-run/index.ts` |
| Routes | `/skills`, `/skills/:skillId` | `/agents`, `/agents/:projectId` |
| Function | `skill-run` | `agent-run` |
| Data | `skill_outputs` | `agent_runs` (213 runs) |

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

Both functions share an `AGENCY_CONTEXT` / `AGENT OS Rules` preamble, which is where house
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
like with like. Data: `av_leads`, `lead_form_views`.

### Email Campaigns · `/campaigns`
Compose from reusable blocks, send to a segment, track delivery. 8 campaigns, 421 recipients,
16 suppressed. Unsubscribes and bounces feed the suppression list automatically via
`email-webhook` and `email-unsubscribe`.

### Intake · `/intake`, `/intake/:orgId`
Structured client onboarding questionnaires, sent by link. 11 submissions.
Functions: `intake-notify`, `send-intake-invite`.

---

## Delivering the work

### Collaboration / CCS · `/ccs`
The **Creative Collaboration Standard**: acknowledgment requests sent to contributors, capturing
signatures, AI-input disclosures and prior-use disclosures, with participant correction requests
and a full audit trail. Participants sign at `/review/:token` without an account.

Thirteen tables (`ccs_clients`, `ccs_projects`, `ccs_templates`, `ccs_requests`, `ccs_responses`,
`ccs_intended_external_input`, `ccs_prior_use_disclosures`, `ccs_signatures`, `ccs_snapshots`,
`ccs_uploaded_references`, `ccs_participant_correction_requests`, `ccs_admin_notes`,
`ccs_audit_logs`). This is the most substantial subsystem in the app relative to how little
surface area it takes in the sidebar.

### Photo Sessions · `/photo-sessions`
Client proofing galleries with per-photo comments and selections, then published deliverables.
197 photos. Sessions can be invoiced, including top-ups.
Functions: `get-photo-urls`, `get-deliverable-urls`, `publish-deliverables`, `finalize-session`,
`client-upload`, plus four invoicing functions.

### Event Experiences · `/event-experiences`
Live event photo capture. Guests upload from `/event/:slug/upload`; `/event/:slug/live-screen`
displays the stream in the room. 156 photos.

### File Drop · `/files`
Request files from a client by link (`/upload/:token`), share finished files back
(`/download/:token`, `/share/:shareToken`). 135 submissions across 8 requests.

### Projects · `/projects`
The unit of work everything attaches to: agent runs, skill outputs and collaboration records all
hang off a project. 19 active.

### Workspace · `/workspace`
Block-based page tree for notes, drafts and operating docs, with page-scoped uploads.
9 pages, 55 blocks, 3 assets.

---

## Free public tools

No account required. They exist to earn attention and, for the calculator, to convert it.

| Tool | Route |
|---|---|
| Campaign Investment Calculator | `/campaign-investment-calculator` · `/es/calculadora-de-inversion-en-campanas` |
| QR Generator | `/qr-generator` |
| Image Studio | `/image-studio` |
| Email Signature Generator | `/email-signature-generator` |

The calculator is documented separately in [CAMPAIGN_CALCULATOR.md](CAMPAIGN_CALCULATOR.md).

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

## Audience engagement

### Contests · `/contests`
Multi-round public voting with verification. 602 votes, 1,028 verifications.
Public routes: `/vote/:slug`, `/vote/:slug/verify`, `/embed/:slug` for embedding elsewhere.
Functions: `contest-vote`, `contest-verify`, `advance-round`.

### History · `/history`, `/outputs/:outputId`
Every skill and agent output, kept, searchable, printable and shareable.

---

## Accounts, teams and branches

Everything is scoped to an organization; every table has row-level security enabled.
Branches sit underneath an organization with their own members, budgets and usage tracking.

| Concern | Where | Data |
|---|---|---|
| Sign in | `/auth` | `profiles` (5) |
| Organization | `/settings` | `organizations` (2) |
| Team and roles | `/settings` | `team_members` (5) |
| Invitations | `/accept-invite` | `invitations` (11) |
| Branches | `/settings` | `org_branches`, `branch_team_members`, `branch_invitations`, `branch_usage_events` (28) |
| Activity | across the app | `activity_log` |

Branch infrastructure is fully built but barely exercised: one branch against 28 usage events.
Either dormant capacity or an unfinished direction.

---

## Edge functions

Work that cannot happen in the browser: anything needing a secret, a third party, or the authority
to bypass row-level security.

| Purpose | Functions |
|---|---|
| AI execution | `skill-run`, `agent-run` |
| Leads and enrichment | `submit-av-lead`, `intake-notify`, `send-intake-invite`, `contact-verify`, `apollo-proxy`, `vibe-proxy` |
| Photo and file delivery | `get-photo-urls`, `get-deliverable-urls`, `publish-deliverables`, `finalize-session`, `client-upload` |
| Invoicing | `create-session-invoice`, `send-session-invoice`, `create-topup-invoice`, `send-topup-invoice` |
| Email | `send-campaign`, `email-webhook`, `email-unsubscribe` |
| Team access | `accept-invitation`, `invite-member`, `invite-branch-member` |
| Contests | `contest-vote`, `contest-verify`, `advance-round` |
| Collaboration | `ccs-client`, `ccs-send-invite` |

**`submit-av-lead` is the shared lead backend for all eight public funnels.** It inserts to
`av_leads`, upserts the CRM contact by email, emails the team, and sends the prospect a branded
auto-reply, with the CRM sync and both emails best-effort, so a SendGrid or CRM failure never
loses the lead or blocks the visitor's confirmation. Adding a funnel means adding a `FORM_CONFIGS`
entry, not a new function. An unknown `source` falls back to `av-landing`, which is how a
correctly-saved lead can still arrive mislabelled if the function has not been redeployed.

---

## Keeping this current

```bash
# Routes
grep -c 'path="' src/App.tsx

# Edge functions
ls supabase/functions | wc -l

# Skills
ls src/data/skills/*.md | wc -l

# Agents
grep -cE "^  [a-z_0-9]+_v[0-9]+: \{" supabase/functions/agent-run/index.ts
```

Table counts come from the Supabase dashboard or `list_tables`.
