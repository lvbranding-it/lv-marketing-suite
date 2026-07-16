# LV Branding — Creative Collaboration Standard (CCS)

A guided client onboarding + acknowledgment module built into the LV Marketing Suite.
It lets LV Branding create a project-specific "Creative Collaboration Standard," send a
client a secure link, guide them through a 9-step acknowledgment wizard (revisions,
AI/external input, confidentiality, IP, timelines, deliverables), capture an electronic
signature, and preserve an immutable, timestamped record.

The tone is warm, strategic, and pro-technology — it welcomes AI use while protecting scope,
confidentiality, and creative direction.

## Architecture

- **Stack:** Vite + React 19 + React Router, TanStack Query, Tailwind + shadcn/Radix, Supabase.
- **Tenancy:** every table is org-scoped (`organizations` / `team_members`) via the existing
  `is_org_member()` / `org_role()` RLS helpers. All module tables are prefixed `ccs_`.
- **Client I/O boundary:** clients never touch the database directly. The public wizard talks
  only to the `ccs-client` edge function, which validates the secure token (by SHA-256 hash)
  and reads/writes with the service role. Tokens are never stored in plaintext.

### Routes

Admin (authenticated):
- `/ccs` — dashboard (metrics + recent activity)
- `/ccs/clients`, `/ccs/clients/:clientId`
- `/ccs/projects`, `/ccs/projects/:projectId`
- `/ccs/requests/new` — 6-step request builder
- `/ccs/requests/:requestId` — submission review view
- `/ccs/requests/:requestId/document` — printable acknowledgment

Client (public, token-gated):
- `/review/:token` — 9-step wizard (+ optional prior-use step)
- `/review/:token/document` — printable acknowledgment (after signing)

### CRM & project-context links

- `ccs_clients.contact_id` → `contacts(id)` — a CCS client can be brought in directly from the
  CRM ("Import from CRM" on the Clients page); the source contact is remembered.
- `ccs_projects.linked_project_id` → `projects(id)` — a CCS project can be linked to a marketing
  project so its AI marketing context (nature/strategy) is on file and shown in the review.
- Clients can be deleted from the Clients page (cascades to their projects, requests, and records).
- `ccs_projects.service_types` (ordered `jsonb` array) captures a phased service bundle
  (e.g. Consulting → Creativity → Photography → Website); `project_type` holds a readable summary.
- `ccs_projects.project_number` is assigned automatically (`LV-YYYY-NNN`, per org, per year) by a
  BEFORE INSERT trigger — the field is read-only in the UI.

### Data model (migrations `036`–`039`)

`ccs_clients`, `ccs_projects`, `ccs_templates`, `ccs_requests`, `ccs_responses`,
`ccs_intended_external_input`, `ccs_prior_use_disclosures`, `ccs_signatures`,
`ccs_snapshots`, `ccs_uploaded_references`, `ccs_participant_correction_requests`,
`ccs_admin_notes`, `ccs_audit_logs`. Storage bucket: `ccs-references` (private).

- **Editable wording:** all educational + legal language lives in `ccs_templates.content_json`.
  Nothing legal is hard-coded in components. Fees are data (`NUMERIC` + `ccs_fee_type`), never hard-coded.
- **Immutability:** at signing, `ccs_snapshots.full_snapshot_json` freezes the exact template
  wording, project terms, responses, and signature. Later template/fee edits never alter a signed snapshot.

### Edge functions

- `ccs-client` (`verify_jwt = false`) — token-validated client wizard I/O:
  `load`, `save`, `save_intended`, `save_prior_use`, `correction`, `submit`, `sign`, `document`.
  Sends best-effort completion emails on sign.
- `ccs-send-invite` (`verify_jwt = true`) — admin-authenticated branded invitation email (SendGrid).

## Security

- Org-member RLS on all tables; `ccs_admin_notes` has no client path.
- Secure tokens: 32 random bytes; only the SHA-256 hash (`secure_token_hash`) is stored.
- Expiring + revocable links; optional email-verification and IP-capture toggles (IP off by default).
- Reference uploads restricted to PDF/JPG/PNG/WEBP; private bucket.
- Emails via SendGrid from `admin@lvbranding.com` (server-side; API key is a Supabase secret).

## Admin workflow

1. Create/select a client and project.
2. `/ccs/requests/new`: confirm participants → revision terms → collaboration terms →
   IP terms → review. Generate a secure link, or **Send invitation** (emails the client).
3. Track status on the dashboard; open a request to review responses, disclosures, flags,
   signature, and audit trail; add private notes; **Accept**; print/save the document.

## Client workflow

Open the emailed link → 9 guided steps (welcome, decision-makers, feedback, AI/external input
with conditional questions, optional prior-use disclosure, confidentiality, revisions,
consolidated feedback, ownership) → review + 8 final confirmations → type or draw a signature →
receive a confirmation number and emailed copy. Progress autosaves; the client can leave and return.

## Environment

- `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` (client).
- Supabase secrets: `SENDGRID_API_KEY` (used by `ccs-client` completion emails and `ccs-send-invite`).

## Deployment

- DB: `036_collaboration_standard.sql`, `037_ccs_request_config.sql`,
  `038_ccs_client_contact_link.sql`, `039_ccs_services_and_autonumber.sql` applied via migrations.
  Seed default template + example data with `supabase/seed_ccs.sql`.
- Functions: `supabase functions deploy ccs-client` and `ccs-send-invite`
  (`ccs-client` is registered `verify_jwt = false` in `config.toml`).

## Not yet built / future extensions

- Reference file upload UI (bucket + restrictions are provisioned; needs a signed-URL upload action).
- Email OTP enforcement (toggle + column exist; sending path is stubbed).
- Resend/revoke/extend actions surfaced in the admin UI (data + statuses support them).
- Reminder emails, PDF generation service, change-order generation, revision-allowance tracking,
  LV ReviewFlow integration, English/Spanish wizard content, e-signature provider integration.

> This application documents project expectations and workflow decisions. It supplements but does
> not replace a signed proposal, statement of work, or master service agreement. **Have qualified
> legal counsel review the acknowledgment wording before client use.**
