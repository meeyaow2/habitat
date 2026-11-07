# Architecture

## Principles
- **One household data model.** The floor plan, dashboard, documents, maintenance and expenses all read the same tables. A placed appliance is a `floor_plan_objects` row that *references* an `assets` row; its room assignment is derived from its position when the plan is saved.
- **Security in the database.** Every table has Row Level Security. The server runs each request inside a transaction that does `set_config('role','authenticated')` and sets `request.jwt.claims` to the verified user — exactly how PostgREST works on Supabase — so policies apply to every query. Hiding buttons is only a UX layer.
- **Composite foreign keys** on `(household_id, id)` stop cross-tenant references (FK checks bypass RLS, so RLS alone would not).
- **Deterministic money.** Integer cents, SQL aggregation, no AI-generated totals.

## Stack
Next.js 16 (App Router, server actions; `cacheComponents` off because every page is per-user dynamic), React 19, TypeScript, Tailwind v4 with semantic tokens, Radix primitives (shadcn-style, hand-written), Lucide, react-konva for the 2D plan, React Three Fiber for the 3D preview, `postgres` driver, Zod 4, Vitest, Playwright.

## Adapters
| Concern | Production | Local fallback |
| --- | --- | --- |
| Auth | Supabase Auth via `@supabase/ssr` | scrypt passwords in `auth.users`, signed HTTP-only session cookie |
| Storage | Supabase Storage, private bucket, signed URLs | filesystem under `LOCAL_STORAGE_DIR`, HMAC-signed 5-minute URLs |
| Database | Supabase Postgres | any Postgres 15+ plus `db/local-compat.sql` |

## Data model
`profiles, households, household_members, household_invitations, properties, floors, rooms, floor_plan_objects, asset_categories, assets, warranties, documents, document_extractions, maintenance_tasks, maintenance_events, expenses, notifications, activity_logs`. See `supabase/migrations/20261106000100_core_schema.sql` (commented).

Key behaviours:
- Recurring tasks stay open; completing one logs a `maintenance_event`, optionally an expense, and rolls `due_on` forward from the completion date.
- Floor saves send the whole document; the server diffs it in one transaction and checks `floors.version` (optimistic concurrency).
- Deleting an asset removes its marker, warranties and tasks; expenses and service history keep an `asset_name_snapshot`; documents are unlinked, not deleted.
- The last owner of a household with other members cannot be removed or demoted; a household with no members is deleted automatically.
- Invitations store only a SHA-256 of the token, are bound to the invited email, expire after 7 days and are single-use (`accept_invitation` RPC).

## Drafting model
`floors.geometry` (JSONB, Zod-validated, size-limited) holds walls, openings, dimensions and text, saved atomically with the floor's optimistic `version`. Rooms stay relational with an optional `polygon`. `features/home/cad.ts` is the pure geometry engine (snapping, wall edits, rooms→walls, room detection by planar-face traversal of the wall graph, DXF); `canvas.tsx` renders tools; `home-twin.tsx` is the workspace; `viewer-3d.tsx` builds 3D from the same document.

## AI
`src/lib/ai/provider.ts` defines the seam; `anthropic.ts` is the only file importing the SDK. Both features require `AI_PROVIDER` + key **and** per-person consent (`profiles.ai_consent_at`).
- **Extraction** (`lib/ai/extraction.ts`): structured output (`betaZodOutputFormat`) where every field carries `status` + verbatim `evidence`; `normaliseExtraction` enforces deterministic rules server-side; results are stored in `document_extractions` and applied only through the normal asset services after review. The document is treated as untrusted data in the system prompt; output can only populate a review form.
- **Ask Habitat** (`features/ai/assistant-tools.ts`): tool runner with read-only tools executed via `withUser` (RLS). Money comes from SQL. References are chosen deterministically from tool results; `propose_task` only records a suggestion. Document contents are not exposed to the assistant, which limits prompt-injection reach. `thread: false` avoids server-side conversation retention.
- Refusal fallbacks (`fallbacks: "default"`) are enabled and `stop_reason: "refusal"` is handled.

## Risky areas & mitigations
- **Floor-plan editing**: pure geometry/history modules with unit tests; Konva only renders. Keyboard and list-based alternatives for every canvas action.
- **Asset relationships**: single source of truth for placement (`unique(asset_id)`), room derived server-side.
- **Multi-tenancy**: RLS + composite FKs + column-level update grants; covered by `tests/db`.
