/**
 * Habitat database CLI.
 *
 *   npm run db:migrate          apply pending migrations
 *   npm run db:reset            drop app data + reapply everything (local only)
 *   npm run db:seed             create the local development account with sample data
 *   npm run db:cleanup-demo     remove demo accounts older than 24h
 *
 * Uses DATABASE_URL. Against plain Postgres it first applies db/local-compat.sql
 * (the Supabase auth shim). Against Supabase the shim is skipped automatically;
 * for hosted projects prefer `supabase db push`, which applies the same files.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";

const root = path.resolve(import.meta.dirname, "..");
const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set. Copy .env.example to .env.local first.");
  process.exit(1);
}

const sql = postgres(url, { max: 1, onnotice: () => {}, prepare: false });

async function hasSchema(name: string) {
  const rows = await sql`select 1 from pg_namespace where nspname = ${name}`;
  return rows.length > 0;
}

async function migrate() {
  if (!(await hasSchema("auth"))) {
    console.log("• No auth schema found — applying local Supabase compatibility shim");
    await sql.unsafe(readFileSync(path.join(root, "db/local-compat.sql"), "utf8"));
  }
  await sql`create schema if not exists habitat_meta`;
  await sql`create table if not exists habitat_meta.migrations (name text primary key, applied_at timestamptz not null default now())`;

  const dir = path.join(root, "supabase/migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const applied = new Set((await sql`select name from habitat_meta.migrations`).map((r) => r.name as string));

  for (const file of files) {
    if (applied.has(file)) continue;
    const body = readFileSync(path.join(dir, file), "utf8");
    await sql.begin(async (tx) => {
      await tx.unsafe(body);
      await tx`insert into habitat_meta.migrations (name) values (${file})`;
    });
    console.log(`✓ ${file}`);
  }
  console.log("Migrations up to date.");
}

async function reset() {
  const host = new URL(url!).hostname;
  if (!["127.0.0.1", "localhost"].includes(host) && process.env.HABITAT_ALLOW_REMOTE_RESET !== "1") {
    throw new Error(`Refusing to reset non-local database host "${host}".`);
  }
  if (await hasSchema("storage")) {
    throw new Error("This looks like a Supabase database. Use `supabase db reset` instead.");
  }
  await sql.unsafe(`
    drop schema if exists public cascade;
    drop schema if exists habitat_meta cascade;
    drop schema if exists auth cascade;
    create schema public;
    grant usage on schema public to public;
  `);
  console.log("• Dropped public, auth and habitat_meta schemas");
  await migrate();
}

async function cleanupDemo() {
  const [row] = await sql`select public.cleanup_expired_demo_accounts(interval '24 hours') as removed`;
  console.log(`Removed ${row.removed} expired demo account(s).`);
}

async function seed() {
  const { seedDevelopmentAccount } = await import("./seed-dev");
  await seedDevelopmentAccount(sql);
}

const command = process.argv[2];
const commands: Record<string, () => Promise<void>> = { migrate, reset, seed, "cleanup-demo": cleanupDemo };

if (!command || !commands[command]) {
  console.error(`Usage: tsx scripts/db.ts <${Object.keys(commands).join("|")}>`);
  process.exit(1);
}

commands[command]()
  .then(() => sql.end())
  .catch(async (err) => {
    console.error(err instanceof Error ? err.message : err);
    await sql.end();
    process.exit(1);
  });
