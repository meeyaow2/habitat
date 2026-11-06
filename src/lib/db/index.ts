import "server-only";
import postgres from "postgres";
import { env } from "@/lib/env";
import { pgTypes } from "./types";

export { pgTypes };

export type Sql = postgres.Sql;
export type Tx = postgres.TransactionSql;

declare global {
  var __habitatSql: Sql | undefined;
}

/**
 * Privileged connection pool. NEVER run user-facing reads or writes on this
 * directly — use `withUser` so Row Level Security applies. Direct use is
 * reserved for auth bootstrap (creating users) and system jobs.
 */
export function adminSql(): Sql {
  if (!globalThis.__habitatSql) {
    globalThis.__habitatSql = postgres(env.databaseUrl, {
      max: Number(process.env.DATABASE_POOL_MAX ?? 10),
      idle_timeout: 20,
      // Required for Supabase's transaction pooler (pgbouncer / supavisor).
      prepare: false,
      onnotice: () => {},
      types: pgTypes,
    });
  }
  return globalThis.__habitatSql;
}

/**
 * Run `fn` inside a transaction as the `authenticated` role with the given
 * user's JWT claims. Every policy in supabase/migrations applies, exactly as it
 * would for a PostgREST request on Supabase.
 */
export async function withUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  const claims = JSON.stringify({ sub: userId, role: "authenticated" });
  const result = await adminSql().begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${claims}, true), set_config('role', 'authenticated', true)`;
    return fn(tx);
  });
  return result as T;
}
