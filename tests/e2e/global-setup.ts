import { execSync } from "node:child_process";
import { rmSync } from "node:fs";
import path from "node:path";
import postgres from "postgres";
import { E2E_DATABASE_URL } from "../../playwright.config";

export default async function globalSetup() {
  const url = new URL(E2E_DATABASE_URL);
  const name = url.pathname.slice(1);
  if (!/_e2e$/.test(name)) throw new Error(`Refusing to reset "${name}" for e2e (name must end in _e2e).`);
  const admin = new URL(E2E_DATABASE_URL);
  admin.pathname = "/postgres";
  const sql = postgres(admin.toString(), { max: 1, onnotice: () => {} });
  const [exists] = await sql`select 1 from pg_database where datname = ${name}`;
  if (!exists) await sql.unsafe(`create database "${name}"`);
  await sql.end();
  execSync(`npx tsx ${path.resolve(__dirname, "../../scripts/db.ts")} reset`, { env: { ...process.env, DATABASE_URL: E2E_DATABASE_URL }, stdio: "pipe" });
  rmSync(path.resolve(__dirname, "../../.data/e2e-uploads"), { recursive: true, force: true });
}
