import "server-only";
import { headers } from "next/headers";
import { UserFacingError } from "./errors";

/**
 * Fixed-window in-memory rate limiter. Per server instance only — on a
 * multi-instance deployment back this with Redis/Upstash (see docs/ARCHITECTURE.md).
 */
const buckets = new Map<string, { count: number; resetAt: number }>();

export async function clientKey(): Promise<string> {
  const h = await headers();
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "local";
}

export function rateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    if (buckets.size > 10_000) {
      for (const [k, v] of buckets) if (v.resetAt < now) buckets.delete(k);
    }
    return;
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    const seconds = Math.ceil((bucket.resetAt - now) / 1000);
    throw new UserFacingError(`Too many attempts. Please wait ${seconds} seconds and try again.`);
  }
}
