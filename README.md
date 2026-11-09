# Habitat

**Your home, organised and understood.** Habitat lets you draw your own home like a CAD program — walls, doors, windows, rooms and dimensions in 2D, with a live 3D view — and connects that drawing to your appliances, warranties, maintenance, documents and expenses. One coherent data model, private to your household.

Built for Singapore first (HDB flats, condominiums, landed homes; SGD; `en-SG` dates) with an architecture that works anywhere.

## What works today

| Area | Status |
| --- | --- |
| Sign up / sign in (local auth, or Supabase Auth when configured) | ✅ |
| Guided onboarding (home → layout template → first appliance → explore), progress persisted | ✅ |
| Overview dashboard from real records, every metric links to a filtered view | ✅ |
| **CAD-style drafting**: wall tool with typed lengths (3.2, 320cm, 3m20), object snaps (endpoint, midpoint, on-wall, tracking), ortho (F8), grid (F7), snap (F3), joined corners, T-junctions, doors (single, double, sliding, pocket — new doors swing into the room)/windows/openings in walls, polygon rooms with live area, fill room (click inside closed walls to create the room), dimensions, text, measure, command line + X/Y readout, layers | ✅ |
| Live 3D view from the same drawing (real door/window openings, cutaway), side-by-side with 2D | ✅ |
| Multiple levels; export DXF (AutoCAD, mm) and PNG | ✅ |
| Metric HDB 2-room Flexi, 3-room, 4-room and 5-room starter plans referenced to HDB's Bangkit Breeze sales brochure; optional room/flat dimension adjustment; "Draw it yourself" remains available | ✅ |
| Appliance drawer on the plan backed by the live asset record | ✅ |
| Appliances & assets: CRUD, search, filters, sort, grid/list, archive, delete with retention policy | ✅ |
| Warranties: expiry tracking, configurable reminder window, receipts linked as proof | ✅ |
| Maintenance: recurring tasks, assignment, completion with cost, history, calendar, labelled general-guidance suggestions | ✅ |
| Documents: private uploads (PDF/images, magic-byte validated), preview, metadata, linking, signed URLs | ✅ |
| Expenses: ledger, filters, analytics, CSV export (formula-injection safe) | ✅ |
| Household: roles, email-bound invitations (hashed, expiring, revocable), shared activity | ✅ |
| Settings: profile, reminder window, AI consent, JSON data export, account deletion | ✅ |
| Demo mode (isolated, anonymous, auto-expiring sample household) | ✅ |
| 3D preview generated from the 2D plan | ✅ (basic) |
| AI receipt reading: consent-gated, field-level status (extracted / inferred / missing / uncertain) with evidence quotes, review before saving | ✅ (provider stubbed in tests — see below) |
| Ask Habitat: answers from RLS-scoped records with links, exact SQL totals, suggested tasks need confirmation | ✅ (provider stubbed in tests — see below) |
| Notifications: overdue tasks and expiring warranties, bell inbox linking to the record | ✅ |

See [docs/STATUS.md](docs/STATUS.md) for verified behaviour and known limitations, and [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for design decisions.

## Quick start (local, no external services)

Requirements: Node 20.11+, PostgreSQL 15+ (16 tested).

```bash
npm install
cp .env.example .env.local        # set DATABASE_URL and a random SESSION_SECRET
npm run db:migrate                # applies db/local-compat.sql + supabase/migrations
npm run db:seed                   # optional: dev@habitat.local / habitat-dev-password
npm run dev
```

Open http://localhost:3000. **Explore a sample home** loads a bundled, editable 4-room HDB in guest mode; no database or sign-in is required, and edits stay in browser storage.

The HDB starter areas and room relationships use the official [Bangkit Breeze sales brochure](https://assets.hdb.gov.sg/residential/buying-a-flat/finding-a-flat/sales-brochure/25JULBTO_pdf_selection/bangkit_breeze.pdf). Published total/internal areas are kept separately from the air-con ledge; individual room measurements inferred from the plan scale are shown as approximate.

A quick local Postgres with Docker:

```bash
docker run -d --name habitat-pg -e POSTGRES_PASSWORD=postgres -p 54322:5432 postgres:16
```

## Using Supabase

1. Create a project. Apply the migrations with the Supabase CLI (`supabase link` then `supabase db push`). These are the same files the local runner uses; the auth shim is never applied to Supabase.
2. Set `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (server-only), and `DATABASE_URL` (use the **transaction pooler** string for Vercel).
3. The storage migration creates a private `household-documents` bucket with member-only policies. The public sample and guest setup do not use Supabase Auth or Storage.

> The Supabase adapters are implemented but were **not exercised against a live Supabase project** in development (the build environment could not reach Supabase). The local mode, which shares the same migrations and RLS, is fully tested.

## AI features (optional)

Set `AI_PROVIDER=anthropic` and `ANTHROPIC_API_KEY` (server-only); `AI_MODEL` defaults to `claude-opus-5-5`. Each person must then opt in under **Settings → AI features** before anything is sent.

- **Read with AI** (Documents → open a PDF/JPG/PNG/WebP): returns each field with a status and the verbatim text it came from. The server rejects values without evidence, invalid dates and prices, and calculates warranty expiry itself. Nothing is saved until the person reviews the form.
- **Ask Habitat** (sidebar, or Ctrl/⌘ J): read-only tools over the household's records, run under RLS for the signed-in person. Totals come from SQL. Links are only attached for records the tools returned. Suggested tasks are created only when the person confirms. Document contents are never sent; conversations aren't stored, and the tool loop runs without server-side message threads.
- Refusals are handled, and server-side refusal fallbacks are enabled.

> These were tested with a stubbed provider (DB integration tests) and against the real API with an invalid key (error path). **No live model calls were made during development**, so prompt quality has not been evaluated against real documents yet.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run dev` / `build` / `start` | Next.js |
| `npm run typecheck` / `lint` | TypeScript and ESLint |
| `npm run test:unit` | Business-logic unit tests (Vitest) |
| `npm run test:db` | RLS and service integration tests against `habitat_test` |
| `npm run test:e2e` | Playwright journeys against a production build and `habitat_e2e` |
| `npm run db:migrate` / `db:reset` / `db:seed` / `db:cleanup-demo` | Database tooling (`reset` refuses non-local hosts) |

`TEST_DATABASE_URL` and `E2E_DATABASE_URL` override the default test databases (names must end in `_test` / `_e2e`).

## Deployment (Vercel + Supabase)

Set the environment variables above in Vercel and deploy. Guest homes and the bundled sample live only in each visitor's browser; signed-in household data continues to use Supabase. The in-memory rate limiter is per instance; use a shared store (e.g. Upstash) for multi-instance deployments.

## Project layout

```
supabase/migrations   schema, RLS policies, RPCs, reference data, storage policies
db/local-compat.sql   minimal Supabase auth shim for plain Postgres
scripts/              migration runner and dev seed
src/app               routes (marketing, auth, onboarding, (app)/*, api/*)
src/features/*        feature modules: queries, server services, actions, UI
src/lib               db (RLS transactions), auth adapters, storage, domain logic, validation
src/components        design-system primitives and the app shell
tests/                unit, db (RLS), e2e (Playwright)
```
