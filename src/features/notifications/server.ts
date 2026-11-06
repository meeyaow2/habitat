import "server-only";
import type { Tx } from "@/lib/db";
import { addDays, type ISODate } from "@/lib/domain/dates";

export type NotificationRow = { id: string; kind: string; title: string; body: string | null; link_path: string | null; read_at: string | null; created_at: string };

/**
 * Create reminders for the signed-in person (idempotent via dedupe keys):
 *  - overdue tasks assigned to them, or to nobody
 *  - warranties ending within the household's reminder window
 * A rescheduled task or renewed warranty produces a new key, so it notifies again.
 */
export async function syncNotifications(tx: Tx, a: { householdId: string; userId: string; today: ISODate; reminderDays: number }) {
  await tx`
    insert into notifications (household_id, user_id, kind, title, body, link_path, entity_type, entity_id, dedupe_key)
    select t.household_id, ${a.userId}, 'task_overdue', 'Overdue: ' || t.title,
           coalesce(a.name || ' · ', '') || 'was due ' || to_char(t.due_on, 'FMDD Mon YYYY'),
           '/maintenance?task=' || t.id, 'maintenance_task', t.id, 'overdue:' || t.id || ':' || t.due_on
    from maintenance_tasks t left join assets a on a.id = t.asset_id
    where t.household_id = ${a.householdId} and t.status = 'open' and t.due_on < ${a.today}
      and (t.assigned_to is null or t.assigned_to = ${a.userId}) and (a.id is null or a.archived_at is null)
    on conflict (user_id, dedupe_key) do nothing
  `;
  await tx`
    insert into notifications (household_id, user_id, kind, title, body, link_path, entity_type, entity_id, dedupe_key)
    select a.household_id, ${a.userId}, 'warranty_expiring', 'Warranty ending: ' || a.name,
           'Ends ' || to_char(w.expires_on, 'FMDD Mon YYYY') || coalesce(' · ' || w.provider, ''),
           '/assets/' || a.id, 'asset', a.id, 'warranty:' || w.id || ':' || w.expires_on
    from warranties w join assets a on a.id = w.asset_id
    where w.household_id = ${a.householdId} and a.archived_at is null
      and w.expires_on between ${a.today} and ${addDays(a.today, a.reminderDays)}
    on conflict (user_id, dedupe_key) do nothing
  `;
}

export async function listNotifications(tx: Tx, userId: string, householdId: string) {
  const rows = await tx<NotificationRow[]>`
    select id, kind, title, body, link_path, read_at::text, created_at::text from notifications
    where user_id = ${userId} and household_id = ${householdId}
    order by (read_at is null) desc, created_at desc limit 20
  `;
  const [{ unread }] = await tx<{ unread: number }[]>`
    select count(*)::int as unread from notifications where user_id = ${userId} and household_id = ${householdId} and read_at is null`;
  return { items: [...rows], unread };
}

