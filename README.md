# Habitat

Habitat is a personal floor-plan and furniture planner for people who want to try different arrangements at home. Pick a layout that looks familiar, move the furniture around, and adjust the rooms until the plan feels closer to your own place.

Created in 2026, Habitat is designed to be useful without an account: the core planner opens directly from the homepage and saves guest work in the browser.

## Start planning

Open the homepage at [http://localhost:3000](http://localhost:3000) and choose a starting layout. Each card is generated from the same structured plan data that opens in the editor, so the thumbnail and editable copy match.

Current homepage choices:

- HDB 2-room Flexi — 1 bedroom
- HDB 3-room — 2 bedrooms
- HDB 4-room — 3 bedrooms
- HDB 5-room — 3 bedrooms plus a connected study
- Condo — 2 bedrooms
- Condo — 3 bedrooms
- Start from scratch — an empty drawing

Selecting a card immediately creates an editable guest home named **My home**. You can rename it in the editor.

Use **Try a furnished sample** to open the bundled, editable 4-room HDB sample. It includes furniture and sample appliance markers for an air conditioner, washing machine, and refrigerator. Appliance markers open sample warranty, maintenance, service, and document details. **Reset sample** restores the bundled layout and appliances without changing the personal guest home.

### Guest saving

No sign-in, database, or external service is needed for the homepage planner.

- Habitat keeps one personal guest home and one separate furnished sample in `localStorage`.
- Layout, furniture, appliance, dimension, and name edits survive a refresh in the same browser.
- Opening another starter card creates a fresh personal guest home from that template.
- Guest data is not synced between browsers or devices and is removed if the browser's site data is cleared.
- The bundled sample does not expire after 24 hours.

## The editor

The guest editor has a **View** mode for opening appliance details and an **Edit layout** mode for changing the plan. Starter layouts use centimetres internally so rooms, openings, and furniture share one real-world scale.

### Furniture

- Add a sofa, armchair, coffee table, dining table, queen bed, single bed, wardrobe, or desk.
- Drag furniture freely between rooms, rotate it in 90° steps, resize it with handles or exact width/depth values, duplicate it, or remove it.
- Furniture keeps its physical size when a room or the whole flat is resized.
- Gentle placement hints identify overlaps, room-edge crossings, and door-swing conflicts without preventing experimentation.
- Wall snapping is intentionally light; hold Alt/Option while dragging to ignore it.
- Undo and redo are available for layout and furniture changes.

### Rooms and measurements

- Add a room or balcony, rename spaces, and change their room type.
- Enter approximate width and depth for a selected room, or reshape it with its corner handles.
- Set a known overall flat width or depth to preview a proportional plan adjustment.
- Show measurements on demand; room labels and approximate areas update with the geometry.
- Shared boundaries resize both adjoining rooms. Household shelter walls remain fixed in the furnished starter plans.

### Walls, doors, and windows

- Select a wall to reveal a highlighted boundary, a centre drag handle, endpoint handles, and exact length and thickness fields.
- Dragging a wall moves the connected corners and updates the wall, adjoining room polygons, coloured floor fills, labels, and areas as one undoable edit.
- Room resize handles use the same boundary geometry, so room fills stay inside their walls.
- Doors and windows remain attached to a moved wall and keep their widths. If a wall would become too short, Habitat explains the conflict instead of silently shrinking the opening.
- Add doors and windows directly to walls, reposition them along the wall, and edit their dimensions. Doors support single, double, sliding, and pocket styles.
- Furniture is not scaled by a wall edit; it receives a placement hint if the new boundary crosses it.

Each completed resize is stored as one history entry, so undo restores the wall, rooms, and openings together. Guest edits are then saved back to browser storage.

## About the starter plans

Starter plans are practical approximations, not construction drawings. They are meant to give someone a believable place to begin and can be adjusted to match known measurements.

The HDB 2-room Flexi, 3-room, 4-room, and 5-room templates use the published areas and room relationships in the [HDB Bangkit Breeze sales brochure](https://assets.hdb.gov.sg/residential/buying-a-flat/finding-a-flat/sales-brochure/25JULBTO_pdf_selection/bangkit_breeze.pdf). Published internal floor area and separately listed air-con ledges remain distinct; individual room dimensions inferred from the plans are approximate. The condo layouts are illustrative and consistently scaled.

## Account-backed features

The guest planner is the primary public experience. The repository also contains a separate account-backed household application for teams that configure PostgreSQL and authentication. Implemented areas include:

- local or Supabase authentication;
- household roles and invitations;
- appliance, warranty, maintenance, document, expense, and notification records;
- multiple floor levels and a basic 3D preview generated from the 2D geometry;
- PNG and DXF export from the account-backed plan editor;
- optional AI receipt extraction and Ask Habitat tools;
- optional email delivery and scheduled reminder jobs.

These server-backed features are not required for guest planning and do not change where guest plans are stored.

## Developer setup

### Requirements

- Node.js 20.11 or newer
- npm
- PostgreSQL 15 or newer only for accounts, server-backed records, database tests, and end-to-end tests (PostgreSQL 16 is used in the example below)

### Run the guest planner

No environment file or database is required for the homepage, starter templates, furnished sample, or guest editor.

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

For a production build:

```bash
npm run build
npm run start
```

### Run the full local application

Start PostgreSQL with a `habitat` database, for example:

```bash
docker run -d --name habitat-pg \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=habitat \
  -p 54322:5432 postgres:16
```

Then copy the environment template, replace `SESSION_SECRET`, and prepare the database:

```bash
cp .env.example .env.local
node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"
npm run db:migrate
npm run db:seed
npm run dev
```

The optional seed creates this development account:

```text
dev@habitat.local
habitat-dev-password
```

`db:migrate` applies `db/local-compat.sql` and the migrations in `supabase/migrations`. `db:reset` drops and recreates local application schemas and refuses non-local database hosts by default.

### Environment variables

`.env.example` is the reference configuration.

| Variable | Required? | Purpose |
| --- | --- | --- |
| `DATABASE_URL` | Full local app and database commands | PostgreSQL connection. Use the Supabase transaction pooler for serverless deployments. Not used by a signed-out guest planner session. |
| `SESSION_SECRET` | Local authentication and local document storage | Signs session cookies and local file URLs. It must be at least 32 characters in production. |
| `APP_URL` | Optional | Base URL for invitation and reminder links. Defaults to `http://localhost:3000`. |
| `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Optional pair | When both are set, authentication uses Supabase instead of the local adapter. |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional, server-only | Enables Supabase document storage and administrative account deletion. Never expose it to the browser. |
| `LOCAL_STORAGE_DIR` | Optional | Server-side document upload directory when Supabase Storage is not configured. Defaults to `.data/uploads`; this is unrelated to guest `localStorage`. |
| `AI_PROVIDER` + `ANTHROPIC_API_KEY` | Optional | Set `AI_PROVIDER=anthropic` to enable the AI features. Users must also opt in from Settings. |
| `AI_MODEL` | Optional | Overrides the AI model; the current default is `claude-opus-5-5`. |
| `DEMO_MAX_AGE_HOURS` | Optional | Session-cookie lifetime for the legacy local anonymous-demo flow. It does not expire or delete the bundled browser sample. Defaults to `24`. |
| `EMAIL_PROVIDER` | Optional | `outbox` writes messages to `.data/outbox`; `resend` uses Resend; unset disables delivery and leaves shareable invitation links in the UI. |
| `RESEND_API_KEY` + `EMAIL_FROM` | Required only for Resend | Credentials and sender for `EMAIL_PROVIDER=resend`. |
| `CRON_SECRET` | Required only for the reminder HTTP endpoint | Protects `/api/cron/reminders`; it must be at least 16 characters. |

For Supabase, apply `supabase/migrations` with the Supabase CLI (`supabase link`, then `supabase db push`). The adapters are implemented, but a live Supabase Auth/Storage deployment has not been verified in this repository.

## Commands and tests

The commands below match `package.json`.

| Command | What it does |
| --- | --- |
| `npm run dev` | Starts the Next.js development server. |
| `npm run build` | Creates an optimized production build. |
| `npm run start` | Runs the production build. |
| `npm run typecheck` | Runs TypeScript without emitting files. |
| `npm run lint` | Runs ESLint. |
| `npm run test:unit` | Runs the database-free Vitest unit project. |
| `npm run test:db` | Runs the Vitest database project against an isolated test database. |
| `npm test` | Runs all configured Vitest projects, including database tests. |
| `npm run test:e2e` | Builds and runs Playwright against an isolated `habitat_e2e` database on port 3100. |
| `npm run check` | Runs typecheck, lint, and `npm test`; PostgreSQL is therefore required. |
| `npm run db:migrate` | Applies pending local migrations. |
| `npm run db:reset` | Recreates local application schemas and reapplies migrations. |
| `npm run db:seed` | Creates the local development account and sample household. |
| `npm run db:cleanup-demo` | Removes expired database-backed demo accounts. |
| `npm run jobs:reminders` | Runs the reminder job directly. |

Database tests default to `habitat_test`; Playwright defaults to `habitat_e2e`. Override them with `TEST_DATABASE_URL` and `E2E_DATABASE_URL`. Their database names must end in `_test` and `_e2e` respectively.

## Current limitations and unfinished work

- Guest plans live in one browser only; account sync, collaboration, and server exports are separate from the guest workflow.
- Walls are straight; curved walls, DWG/DXF import, and scaled PDF printing are not implemented. DXF is export-only in the account-backed editor.
- Furniture rotation uses 90° steps.
- The 3D view is a basic, read-only preview; editing happens in 2D.
- The editor supports touch, but precise drafting remains easier with a larger screen, mouse, and keyboard.
- Supabase Auth/Storage adapters have not been exercised against a live Supabase project here.
- AI provider integration is implemented and stub-tested, but prompt quality has not been evaluated against a real receipt set.
- Resend delivery and the hosted reminder cron have not been verified against live services.
- Rate limiting is in memory per application instance.

## Project layout

```text
src/app                 Next.js routes and API endpoints
src/features/guest      browser-saved homepage, sample, and guest editor
src/features/home       shared plan model, templates, renderer, editor, and 3D preview
src/features/*          account-backed household feature modules
src/lib                 database, auth, storage, domain, and validation code
src/components          shared interface primitives and branding
supabase/migrations     schema, RLS policies, reference data, and storage policies
db/local-compat.sql     local Supabase auth compatibility layer for PostgreSQL
scripts                 database, seed, and reminder tooling
tests                   unit, database, and Playwright projects
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for deeper implementation notes.
