# Status, verification and known limitations

_Last updated: November 2026._

## Verified
- `npm run typecheck`, `npm run lint`: clean.
- Unit tests: 73 passing (dates, money, warranty/task state, recurrence, geometry, undo/redo, every starter template's validity, schemas, category reference data).
- DB tests: 26 passing — tenant isolation across 13 tables, unauthenticated access, composite-FK protection, column privileges, member vs owner permissions, invitation email binding/expiry/revocation/single use, last-owner protection, orphan cleanup, recurrence, floor-plan save + conflict detection, retention policy, demo seeder under RLS.
- Playwright (production build): critical journeys 1–14, demo mode, no horizontal overflow on 8 pages at 390/768/1024/1440/1920 px, no serious/critical axe violations (WCAG 2.2 AA rule set) on primary and public pages.
- Manual browser runs: drag a marker with the mouse into another room → save → reload → room reassigned; view mode never moves items; spoofed uploads rejected; tampered signed URLs rejected.

## Not built yet
- **AI document extraction** (schema `document_extractions` and consent setting exist; no provider integration).
- **Ask Habitat assistant.**
- **Notifications UI / email delivery.** Invitation links are shown to the owner to share manually; the `notifications` table is written for task assignment but there is no inbox UI yet.
- Additional currencies/locales in the UI (stored, not selectable).

## Known limitations
- Supabase Auth/Storage adapters are implemented but untested against a live project.
- Rooms are rectangles; no polygon rooms, doors or windows. Furniture rotates in 90° steps.
- Adding/removing floors is only via templates (landed template has two levels).
- Rate limiting is in-memory per instance.
- The 3D view is a preview (no editing, low cutaway walls).
- On phones, the plan editor is usable (drag, nudge pad, numeric inputs) but best on larger screens.

## Roadmap
1. AI extraction with consent, schema-validated output, extracted/inferred/missing/uncertain labelling and a review form; prompt-injection isolation of document text.
2. Ask Habitat: tool-calling over RLS-scoped queries with record links; confirmation before writes.
3. Notifications inbox, scheduled reminders and email delivery for invites/reminders.
4. Floor management, polygon rooms, doors/windows; measured-dimension workflow.
5. Multi-property households, localisation, shared rate limiting.
