# Status, verification and known limitations

_Last updated: November 2026._

## Verified
- `npm run typecheck`, `npm run lint`: clean.
- Unit tests: 81 passing (dates, money, warranty/task state, recurrence, geometry, undo/redo, every starter template's validity, schemas, category reference data, AI extraction normalisation rules).
- DB tests: 37 passing — including AI extraction lifecycle, Ask Habitat tools (exact totals, RLS confinement, link and proposal rules) with a stubbed provider, and notification generation. Earlier: — tenant isolation across 13 tables, unauthenticated access, composite-FK protection, column privileges, member vs owner permissions, invitation email binding/expiry/revocation/single use, last-owner protection, orphan cleanup, recurrence, floor-plan save + conflict detection, retention policy, demo seeder under RLS.
- Playwright (production build): critical journeys 1–14, demo mode, no horizontal overflow on 8 pages at 390/768/1024/1440/1920 px, no serious/critical axe violations (WCAG 2.2 AA rule set) on primary and public pages.
- Manual browser runs: drag a marker with the mouse into another room → save → reload → room reassigned; view mode never moves items; spoofed uploads rejected; tampered signed URLs rejected.

## Drafting (CAD) — verified
- Geometry unit tests (lengths, polygons, walls, openings, snapping, rooms→walls, DXF) and Playwright `drafting.spec.ts`: draw a 4 m × 3 m room from scratch with typed lengths, add a door and window, outline the room, add a dimension, save, reload, open 3D, export DXF.

## Drafting — known limitations
- Straight walls only (no curved walls); rooms are outlined manually (no automatic detection from closed walls yet).
- Single-leaf doors only (no sliding/double symbols yet); no DWG import or scaled PDF printing; DXF is export only.
- 3D is a viewer (editing happens in 2D); precise drafting is best with mouse and keyboard.

## Not built yet
- **Email delivery** for invitations and reminders (links are shown to the owner to share; reminders appear in the in-app bell).
- **Scheduled notification generation** — reminders are generated when a person opens the app, not by a background job.
- Evaluation of AI prompts against real receipts (no live model calls were made in development).
- Additional currencies/locales in the UI (stored, not selectable).

## Known limitations
- Supabase Auth/Storage adapters are implemented but untested against a live project.
- Rooms are rectangles; no polygon rooms, doors or windows. Furniture rotates in 90° steps.
- Adding/removing floors is only via templates (landed template has two levels).
- Rate limiting is in-memory per instance.
- The 3D view is a preview (no editing, low cutaway walls).
- On phones, the plan editor is usable (drag, nudge pad, numeric inputs) but best on larger screens.

## Roadmap
1. Build an eval set of real (consented) receipts and tune the extraction prompt; measure field accuracy per status.
2. Scheduled reminders (cron) and email delivery for invites and reminders.
3. Streaming answers in Ask Habitat; optional saved conversations with retention controls.
4. Floor management, polygon rooms, doors/windows; measured-dimension workflow.
5. Multi-property households, localisation, shared rate limiting.
