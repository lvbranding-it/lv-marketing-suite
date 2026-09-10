# LV Creative Canvas manual QA

Use synthetic or approved test assets. Never place confidential client work in preview or provider test accounts.

## Access and responsive layout

- [ ] Owner/admin, manager, and member can open the listing and an allowed canvas.
- [ ] A Viewer override can read but cannot upload, edit, generate, decide, or save.
- [ ] A user from another organization receives no project, scene, asset metadata, signed URL, export source, or generation history.
- [ ] Signed URLs expire and cannot be created for another project's storage path.
- [ ] Review at 1440×900, 1280×800, 1024×768, and 768×1024. No critical control is unreachable.
- [ ] Keyboard focus is visible; every icon-only control has an accessible name.

## Canvas

- [ ] New project opens an empty canvas with brief, reference, direction, image, and copy entry points.
- [ ] Add every object type. Edit text directly and through the inspector.
- [ ] Pan, zoom, multi-select, move, resize, duplicate, copy/paste, delete, group/ungroup, reorder, undo, and redo.
- [ ] Fit selection and fit canvas work.
- [ ] Collapse and reopen both side panels.
- [ ] Autosave progresses unsaved → saving → saved. Refresh restores the scene exactly.
- [ ] Simulated offline mode displays offline, prevents generation, preserves edits locally in the mounted editor, and resumes save after reconnect.

## Assets and lineage

- [ ] Drag/drop and file-picker uploads accept PNG, JPEG, and WebP.
- [ ] Spoofed extension/MIME, SVG, PDF, empty, and over-25-MB files fail clearly.
- [ ] Uploaded dimensions, filename, owner, storage scope, version 1, and signed URL are correct.
- [ ] Deleting an image shape does not delete its stored asset.
- [ ] Generated, edited, and variation assets have a parent and generation where applicable; originals remain unchanged.
- [ ] Download retains source quality.

## AI and context

- [ ] Disabled providers are marked off. Explicit unavailable/capability-mismatched requests fail without fallback.
- [ ] Auto routes copy/strategy and image actions to appropriate enabled providers.
- [ ] Selecting text, image, reference, direction, and brand context includes only relevant content.
- [ ] Turning off “Include in AI context” excludes the object and records it in the manifest.
- [ ] English→Spanish and Spanish→English output preserves intent, voice, positioning, and market relevance.
- [ ] Double-submit creates only one billable request for the same idempotency key.
- [ ] Placeholder stays at the requested position through queued/processing/completed or failed states.
- [ ] Provider timeout/error preserves a failed record with retry-relevant details.
- [ ] Text output is placed as editable content. Image output is private, versioned, and placed without base64 in the database.
- [ ] Image edit and branched variation preserve the parent asset.

## Decisions, usage, and export

- [ ] Favorite, shortlisted, rejected, needs revision, client selected, and approved final record actor and timestamp.
- [ ] Generation history displays provider, model, instruction, status, duration/cost where available, and safe error details.
- [ ] Project usage totals match ledger entries and show the estimate disclaimer.
- [ ] Rate, concurrency, warning, and monthly soft-budget states are understandable.
- [ ] Export selected content at 2× as PNG and PDF. File dimensions/quality are visible in browser download metadata and source images are not silently recompressed before render.
- [ ] No selection, failed export, and unauthorized export show intentional error states.

## Demo

- [ ] Apply `supabase/seed_creative_canvas.sql` only in development/staging.
- [ ] Demo contains a fictional brief, brand context, two directions, reference placeholders, palettes, notes, and bilingual sample copy.
- [ ] Nothing claims real client work or performance results.
