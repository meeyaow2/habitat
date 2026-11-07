# Status, verification and known limitations

_Last updated: November 2026._

## Verified
- `npm run typecheck`, `npm run lint`: clean.
- Unit tests: 110 passing (dates, money, warranty/task state, recurrence, geometry, undo/redo, every starter template's validity, schemas, category reference data, AI extraction normalisation rules, email templates, CAD engine).
- DB tests: 39 passing — including AI extraction lifecycle, Ask Habitat tools (exact totals, RLS confinement, link and proposal rules) with a stubbed provider, notification generation and the scheduled reminder job. Also: tenant isolation across 13 tables, unauthenticated access, composite-FK protection, column privileges, member vs owner permissions, invitation email binding/expiry/revocation/single use, last-owner protection, orphan cleanup, recurrence, floor-plan save + conflict detection, retention policy, demo seeder under RLS.
- Playwright (production build): critical journeys 1–14, demo mode, no horizontal overflow on 8 pages at 390/768/1024/1440/1920 px, no serious/critical axe violations (WCAG 2.2 AA rule set) on primary and public pages.
- Manual browser runs: drag a marker with the mouse into another room → save → reload → room reassigned; view mode never moves items; spoofed uploads rejected; tampered signed URLs rejected.

## Drafting (CAD) — verified
- Geometry unit tests (lengths, polygons, walls, openings, snapping, rooms→walls, room detection from closed walls including T-junctions, crossings, stubs and L-shapes, DXF) and Playwright `drafting.spec.ts`: draw a 4 m × 3 m room from scratch with typed lengths, add a door and window, click inside the walls to create the room (and get a clear message when clicking outside a closed boundary), add a dimension, save, reload, open 3D, export DXF.

## Drafting — known limitations
- Straight walls only (no curved walls). Fill room (F) follows wall centrelines, so a room's area includes half the surrounding wall thickness, as in the starter templates. A small gap between walls (more than half a wall's thickness) counts as open.
- Single-leaf doors only (no sliding/double symbols yet); no DWG import or scaled PDF printing; DXF is export only.
- 3D is a viewer (editing happens in 2D); precise drafting is best with mouse and keyboard.

## Not built yet
- Evaluation of AI prompts against real receipts (no live model calls were made in development).
- Additional currencies/locales in the UI (stored, not selectable).

## Known limitations
- Supabase Auth/Storage adapters are implemented but untested against a live project.
- Furniture rotates in 90° steps.
- Email delivery (Resend) and the reminder cron are implemented but untested against a live Resend account; locally they use the dev outbox.
- Rate limiting is in-memory per instance.
- The 3D view is a preview (no editing, low cutaway walls).
- On phones, the plan editor is usable (drag, nudge pad, numeric inputs) but best on larger screens.

## Roadmap
1. Build an eval set of real (consented) receipts and tune the extraction prompt; measure field accuracy per status.
2. Streaming answers in Ask Habitat; optional saved conversations with retention controls.
3. Drafting: curved walls, sliding/double doors, scaled PDF printing, DXF import; measured-dimension workflow.
4. Multi-property households, localisation, shared rate limiting.
