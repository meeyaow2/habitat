import "server-only";
import type { Sql, Tx } from "@/lib/db";
import { todayIn } from "@/lib/domain/dates";
import { reminderDigestEmail, type Email } from "@/lib/email";
import { syncNotifications } from "./server";

export type JobDeps = {
  /** System connection — used only to list memberships (there is no signed-in user in a scheduled job). */
  admin: Sql;
  /** Runs `fn` as that user under RLS, exactly like a request. */
  runAs: <T>(userId: string, fn: (tx: Tx) => Promise<T>) => Promise<T>;
  send: (email: Email) => Promise<boolean>;
  appUrl: string;
  now?: Date;
};

export type JobSummary = { memberships: number; generated: number; emailed: number; emailsSent: number };

/**
 * Daily reminders: create overdue-task and expiring-warranty notifications for
 * every member of every household, then email each opted-in person a digest of
 * unread reminders they haven't been emailed about yet. Safe to run repeatedly.
 */
export async function runReminderJob(deps: JobDeps): Promise<JobSummary> {
  const members = await deps.admin<{
    user_id: string; household_id: string; household: string; reminder_days: number; timezone: string;
    name: string; email_reminders: boolean; is_demo: boolean; email: string | null;
  }[]>`
    select m.user_id, m.household_id, h.name as household, h.warranty_reminder_days as reminder_days,
           p.timezone, p.display_name as name, p.email_reminders, p.is_demo, u.email
    from household_members m
    join households h on h.id = m.household_id
    join profiles p on p.id = m.user_id
    join auth.users u on u.id = m.user_id
    order by m.household_id, m.user_id
  `;
  const summary: JobSummary = { memberships: members.length, generated: 0, emailed: 0, emailsSent: 0 };

  for (const m of members) {
    const today = todayIn(m.timezone, deps.now);
    const generated = await deps.runAs(m.user_id, async (tx) => {
      const [{ before }] = await tx<{ before: number }[]>`select count(*)::int as before from notifications where user_id = ${m.user_id} and household_id = ${m.household_id}`;
      await syncNotifications(tx, { householdId: m.household_id, userId: m.user_id, today, reminderDays: m.reminder_days });
      const [{ after }] = await tx<{ after: number }[]>`select count(*)::int as after from notifications where user_id = ${m.user_id} and household_id = ${m.household_id}`;
      return after - before;
    });
    summary.generated += generated;

    if (!m.email_reminders || m.is_demo || !m.email) continue;
    const pending = await deps.runAs(m.user_id, (tx) => tx<{ id: string; title: string; body: string | null; link_path: string | null }[]>`
      select id, title, body, link_path from notifications
      where user_id = ${m.user_id} and household_id = ${m.household_id}
        and read_at is null and emailed_at is null and kind in ('task_overdue', 'warranty_expiring', 'task_assigned')
        and created_at > now() - interval '14 days'
      order by created_at limit 20
    `);
    if (pending.length === 0) continue;
    const sent = await deps.send(
      reminderDigestEmail({ to: m.email, name: m.name, household: m.household, appUrl: deps.appUrl, items: pending.map((p) => ({ title: p.title, body: p.body, link: p.link_path })) }),
    );
    if (!sent) continue;
    summary.emailsSent += 1;
    const ids = pending.map((p) => p.id);
    await deps.runAs(m.user_id, (tx) => tx`update notifications set emailed_at = now() where id in ${tx(ids)} and user_id = ${m.user_id}`);
    summary.emailed += ids.length;
  }
  return summary;
}
