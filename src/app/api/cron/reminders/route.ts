import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { adminSql, withUser } from "@/lib/db";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email";
import { runReminderJob } from "@/features/notifications/job";

/**
 * Daily reminder job. Vercel Cron calls this with `Authorization: Bearer $CRON_SECRET`
 * (see vercel.json); self-hosters can run `npm run jobs:reminders` instead.
 */
export const maxDuration = 300;

function authorised(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 16) return false;
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  return got.length === want.length && timingSafeEqual(got, want);
}

export async function GET(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const summary = await runReminderJob({ admin: adminSql(), runAs: withUser, send: sendEmail, appUrl: env.appUrl });
  return NextResponse.json(summary);
}
