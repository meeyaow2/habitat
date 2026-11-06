/**
 * Scheduled jobs for self-hosting (cron, systemd timer, etc.):
 *   npm run jobs:reminders
 * Hosted on Vercel, the same job runs via vercel.json → /api/cron/reminders.
 */
import { adminSql, withUser } from "../src/lib/db";
import { env } from "../src/lib/env";
import { sendEmail } from "../src/lib/email";
import { runReminderJob } from "../src/features/notifications/job";

const job = process.argv[2];
if (job !== "reminders") {
  console.error("Usage: tsx scripts/jobs.ts reminders");
  process.exit(1);
}
runReminderJob({ admin: adminSql(), runAs: withUser, send: sendEmail, appUrl: env.appUrl })
  .then(async (s) => {
    console.log(`Reminders: ${s.memberships} memberships, ${s.generated} new notifications, ${s.emailsSent} digest email(s) covering ${s.emailed} reminder(s).`);
    await adminSql().end();
  })
  .catch(async (e) => {
    console.error((e as Error).message);
    await adminSql().end();
    process.exit(1);
  });
