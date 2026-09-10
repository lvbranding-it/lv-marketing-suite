# LV Creative Canvas™

LV Creative Canvas is LV Branding's authenticated creative-direction workspace. It keeps strategy, brand context, references, copy, imagery, decisions, generation records, and exports together in the existing project and organization boundary.

Product statement: **From strategic direction to finished creative, in one intelligent workspace.**

## Canvas foundation and license record

Verified from the packages installed in `node_modules` on 2026-09-10:

| Package | Installed version | License | Source repository |
| --- | --- | --- | --- |
| `@xyflow/react` | `12.11.6` | MIT | `https://github.com/xyflow/xyflow` (`packages/react`) |
| `html-to-image` | `1.11.13` | MIT | `https://github.com/bubkoo/html-to-image` |

The bundled `@xyflow/react/LICENSE` identifies the copyright holder as webkid GmbH and contains the standard MIT grant and notice-retention condition. The package's default “React Flow” attribution remains visible in the workspace; no CSS or runtime option hides it. Preserve the package license files and notices in source and redistributed dependency bundles. Direct-dependency notices are copied into [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).

Only React Flow Community APIs are used. There are no Pro packages, paid templates, paid examples, or recurring-license canvas dependencies. If a future requirement exceeds Community capabilities, implement it in LV-owned code or review a permissively licensed supporting library; a commercial canvas SDK requires explicit approval.

### Renderer-independent scene contract

`src/lib/creative-canvas/scene.ts` owns the persisted `CreativeSceneDocument`: semantic nodes, edges, parent grouping, dimensions, ordering, and viewport. It imports no renderer types. `react-flow-adapter.ts` is the only persistence boundary that converts that document to and from React Flow nodes and edges. Signed asset URLs are hydrated at runtime and stripped during serialization. This keeps saved client work portable if the renderer changes later.

The MVP is intentionally a spatial creative-direction workspace. Movable rich-content nodes, selection-based AI work, frames, grouping, history, persistence, and export take priority over freehand drawing or vector-illustration tooling.

## Architecture

The feature follows the current React/Vite/Supabase architecture:

- `/dashboard/creative-canvas` lists Canvas-enabled projects and creates an existing `projects` row plus its first `creative_canvases` row.
- `/dashboard/creative-canvas/:canvasId` loads the React Flow Community workspace. The scene is a versioned, normalized LV JSON document, not a flattened image or a serialized SDK store.
- `projects`, `organizations`, `team_members`, Supabase Auth, and the current app shell are reused. No duplicate client, user, team, or organization tables were introduced.
- `creative-canvas-assets` is private. Object paths are `organization-id/project-id/category/random-file`; RLS validates both path scopes. The browser displays one-hour signed URLs.
- `creative-canvas-generate` is the only provider gateway. Keys remain in Supabase Edge Function secrets. It authenticates the bearer token, verifies project and organization membership, enforces idempotency/concurrency/rate/budget checks, assembles minimal context, selects a capable provider, records the lifecycle, stores image results privately, and writes usage.
- Pure provider, routing, pricing, and context modules live under `supabase/functions/_shared/creative-canvas`. Model IDs and pricing estimates are centralized.

### Data flow

1. The editor selects semantic Canvas shapes.
2. The client sends only selected shape summaries, explicit references, the current instruction, brand context, operation, provider preference, and a unique idempotency key.
3. LV Intelligence excludes objects whose `includeInAiContext` flag is false, caps context size, preserves the original instruction, and records a context manifest.
4. Deterministic routing chooses an enabled provider that declares the required capability. An explicit unsupported provider request fails visibly.
5. A generation moves from queued to processing to completed, failed, or cancelled. Failed records are retained.
6. Text results become editable text objects. Image results are stored in the private bucket, registered as assets and versions, signed, then placed on the canvas.

No provider is asked for or returns hidden chain-of-thought. Logs contain request IDs, statuses, codes, and duration, not full client prompts or image payloads.

## Database and security

The candidate migration is:

`supabase/creative-canvas-migrations/202609100001_creative_canvas_foundation.sql`

It adds:

- `creative_project_members`: optional project overrides for owner/admin, creative director, collaborator, and viewer.
- `creative_canvases`: versioned, normalized LV scene documents.
- `brand_contexts`: one versioned structured source of truth per project.
- `creative_assets` and `asset_versions`: private media metadata and non-destructive lineage.
- `creative_directions`: normalized direction metadata for future reporting.
- `ai_generations`: provider/model/operation/status, original instruction, prepared context, manifest, request, outputs, cost, provider request ID, error, and idempotency.
- `creative_decisions`: append-only creative decisions with actor and timestamp.
- `creative_comments`: future-ready basic collaboration records; real-time collaboration is not enabled.
- `ai_usage_ledger`: server-owned estimated usage entries.

Every table has RLS. A `creative_project_members` override always wins, including the read-only Viewer. Otherwise the org role decides, but only for members granted Creative Canvas in team setup (`team_members.feature_access.creativeCanvas`): owners and admins bypass that grant as they bypass every feature flag, manager → Creative Director, member → Collaborator, and anyone without the grant gets no role at all. Because `creative_project_role` enforces it, hiding the navigation entry is not the gate — a member without the grant is refused by the database and by the Edge Function, which evaluates `can_edit_creative_project` as the calling user.

Every Canvas table carries a denormalized `org_id` that drives the usage ledger and the monthly budget query, so each insert **and update** policy re-checks it against the owning project through `creative_org_matches_project`. Storage path segments pass through `creative_path_uuid`, which returns null for a malformed path so the policy denies cleanly instead of raising a cast error.

The Edge Function repeats authorization before provider usage. Browser grants cannot update provider results or write the usage ledger.

The repository has documented local/remote migration-history divergence. Do **not** run a blanket `supabase db push --include-all` against production. Rehearse this exact additive migration on a reconciled staging baseline, record it in the canonical migration history, verify RLS with two organizations, and only then promote it.

For an isolated/staging database using the project CLI, apply the reviewed SQL through the team's migration runner or:

```bash
supabase db query --local --file supabase/creative-canvas-migrations/202609100001_creative_canvas_foundation.sql
```

The optional fictional demo is `supabase/seed_creative_canvas.sql`. Apply it only after an organization and team member exist. The UI creates the demo's two directions, reference placeholders, palettes, notes, and copy on first open, then autosaves the structured scene.

## Storage

The migration creates the private `creative-canvas-assets` bucket with PNG, JPEG, and WebP allowlisting and a 25 MB database-side limit. The client also validates exact MIME/extension pairs, positive size, and raster dimensions. Original uploads are never overwritten. Removing a shape does not remove its asset; metadata supports a future trash/retention job through `deleted_at`.

SVG and PDF uploads are intentionally excluded until a server-side sanitization/rasterization pipeline is approved.

## Provider and model configuration

Set Edge Function secrets, never `VITE_` browser variables:

**No new credentials are required.** `CLAUDE_API_KEY` (already set for `skill-run` and `agent-run`) covers Anthropic, and `OPENAI_API_KEY` (already set for `advisor-speak`) covers OpenAI. Edge secrets are project-wide, so both providers are live on deploy. Between them they satisfy every declared capability: text, vision, image generation and image edit.

Google is supported but deliberately not configured. Without `GOOGLE_GENERATIVE_AI_API_KEY` the provider reports itself disabled and the router never selects it; no code change is needed to leave it off, and none to turn it on later.

Optional overrides:

```bash
supabase secrets set OPENAI_TEXT_MODEL=...
supabase secrets set OPENAI_IMAGE_MODEL=...
supabase secrets set ANTHROPIC_TEXT_MODEL=...
supabase secrets set CREATIVE_CANVAS_DEFAULT_TEXT_PROVIDER=anthropic
supabase secrets set CREATIVE_CANVAS_DEFAULT_IMAGE_PROVIDER=openai
```

Claude reuses the existing `CLAUDE_API_KEY` when `ANTHROPIC_API_KEY` is absent. The defaults in the registry are fallbacks, not model identifiers scattered through workflow code. Override them for the models approved in the target environment.

Operations are routed deterministically:

- Images and edits: configured default image provider, then OpenAI or Google. With Google unconfigured this resolves to OpenAI.
- Brand strategy, long synthesis, and copy: configured default text provider, then Anthropic, OpenAI, or Google.
- Visual critique: an enabled vision-capable provider.
- Explicit provider without the required capability: `PROVIDER_UNAVAILABLE`; no silent fallback.

Provider adapters normalize text, images, request IDs, token use, durations, and errors. Calls use a configurable timeout. Automatic retry is intentionally disabled to avoid duplicate billable work; user retry receives a new idempotency key. The function returns signed asset metadata, never raw provider image payloads.

### Pricing and budgets

Estimated prices live in `config.ts` as one updateable table and are never used as final billing. Configure:

- `CREATIVE_CANVAS_MONTHLY_BUDGET_USD`: organization soft stop. Defaults to **100**, deliberately low; raise it from what the ledger actually shows rather than guessing upward.
- `CREATIVE_CANVAS_BUDGET_WARNING_PERCENT`: warning threshold.
- `CREATIVE_CANVAS_MAX_CONCURRENT`: simultaneous user requests.
- `CREATIVE_CANVAS_REQUESTS_PER_MINUTE`: basic per-user request limit.
- `CREATIVE_CANVAS_PROVIDER_TIMEOUT_MS`: provider timeout.
- `CREATIVE_CANVAS_MAX_UPLOAD_MB`: operational configuration; keep it aligned with the bucket migration.

## Local setup

1. Run `npm install`.
2. Configure existing `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` in `.env.local`.
3. Apply the Canvas migration to an isolated database.
4. Serve the Edge Function: `supabase functions serve creative-canvas-generate --env-file <server-env-file>`.
5. Run `npm run dev`, sign in with an authorized team account, and open `/dashboard/creative-canvas`.

To test a provider, enable only its credential/model settings, confirm the provider menu reports it available, run a low-cost text action, inspect the generation history, then test its supported image/vision path with non-confidential content. Local automated tests mock all provider calls and never consume credits. Live provider execution was not verified unless credentials were separately supplied in the deployment environment.

## Admin guide

- Disable providers with `CREATIVE_CANVAS_DISABLED_PROVIDERS=openai,google` or remove their credential. Redeploy the Edge Function; the UI marks them off.
- Change model identifiers through the model environment variables and redeploy. No workflow edit is required.
- Update estimated pricing in the single `PRICING_USD` registry after reviewing official provider pricing. Treat historical ledger entries as point-in-time estimates.
- Keep upload limits synchronized between the bucket migration and `CREATIVE_CANVAS_MAX_UPLOAD_MB`.
- Adjust budget and warning variables above. The limit is a soft operational guard, not provider billing enforcement.
- Investigate a failure by generation ID. Review `provider`, `model`, `operation`, `status`, `duration_ms`, `provider_request_id`, `error_code`, and the sanitized `error_message`; use `context_manifest` to confirm which objects were included. Do not copy full confidential prompts into logs or tickets.

## Testing and deployment

```bash
npm test
npm run build
npm run test:browser
```

The unit suite covers scene serialization/restoration, lifecycle transitions, upload validation, context inclusion/exclusion and caps, bilingual adaptation construction, provider-disabled routing, provider normalization/errors, cost estimates, RLS/storage scope, idempotency, lineage, and server-owned usage. Existing browser tests do not authenticate against a deployed Canvas database; complete the manual checklist in `MANUAL_QA.md` in staging.

Deploy in this order: reconciled/additive migration → bucket policies → Edge Function and secrets → frontend → optional demo seed. Verify cross-organization denial before real client work.

## Known MVP limitations

- Generation runs inside one Edge Function request. Records and UI states are durable, but there is no external queue worker; platform execution limits apply to long jobs.
- User cancellation is prepared in the lifecycle but not exposed because provider cancellation and a durable worker are not yet consistently available.
- Canvas autosave uses optimistic scene-version checks, not real-time multiplayer merge semantics.
- React Flow Community provides the viewport, selection, edges, resize handles, controls, and minimap. LV-owned code provides semantic nodes, grouping, ordering, duplicate/copy/paste/delete, undo/redo, persistence, and selection export.
- Export is client-side at visible 2× quality. PDF wraps the lossless PNG render; a server rendering service is future work.
- Structured decisions and version tables are implemented. The first UI surfaces generation lineage/usage but a full visual parent-comparison slider and restore UI remain phase two.
- No public client portal, video, masking, advanced vector editing, Figma/Adobe sync, autonomous agents, billing, marketplace, or mobile app is included.

## Recommended phase two

Add a durable job queue with cancellation/webhooks, signed-upload completion Edge Function with server raster inspection, server exports and direction-summary templates, full version compare/restore, trash/retention controls, granular member management UI, comments and presence, context summarization for very large projects, final provider billing reconciliation, administrative usage reporting, and authenticated Playwright coverage against staging.
