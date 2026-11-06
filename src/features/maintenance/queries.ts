import "server-only";
import type { Tx } from "@/lib/db";
import type { ISODate } from "@/lib/domain/dates";
import type { EventRow, TaskRow } from "@/features/assets/queries";

export async function listOpenTasks(tx: Tx, householdId: string, opts: { assignee?: string; limit?: number } = {}) {
  return [...(await tx<TaskRow[]>`
    select t.id, t.title, t.description, t.due_on, t.status, t.priority, t.recurrence_interval, t.recurrence_unit, t.source,
           t.asset_id, a.name as asset_name, t.assigned_to, p.display_name as assignee_name, p.avatar_color as assignee_colour,
           t.last_completed_on, t.created_by
    from maintenance_tasks t
    left join assets a on a.id = t.asset_id
    left join profiles p on p.id = t.assigned_to
    where t.household_id = ${householdId} and t.status = 'open'
      and (a.id is null or a.archived_at is null)
      ${opts.assignee ? tx`and t.assigned_to = ${opts.assignee}` : tx``}
    order by t.due_on, t.priority = 'high' desc, t.title
    ${opts.limit ? tx`limit ${opts.limit}` : tx``}
  `)];
}

export async function listHistory(tx: Tx, householdId: string, limit = 100) {
  return [...(await tx<EventRow[]>`
    select e.id, e.kind, e.title, e.performed_on, e.vendor, e.cost_cents, e.notes, e.asset_id,
           coalesce(a.name, e.asset_name_snapshot) as asset_name, p.display_name as performed_by_name, e.task_id
    from maintenance_events e
    left join assets a on a.id = e.asset_id
    left join profiles p on p.id = e.performed_by
    where e.household_id = ${householdId}
    order by e.performed_on desc, e.created_at desc
    limit ${limit}
  `)];
}

export async function tasksInRange(tx: Tx, householdId: string, from: ISODate, to: ISODate) {
  return [...(await tx<TaskRow[]>`
    select t.id, t.title, t.description, t.due_on, t.status, t.priority, t.recurrence_interval, t.recurrence_unit, t.source,
           t.asset_id, a.name as asset_name, t.assigned_to, p.display_name as assignee_name, p.avatar_color as assignee_colour,
           t.last_completed_on, t.created_by
    from maintenance_tasks t left join assets a on a.id = t.asset_id left join profiles p on p.id = t.assigned_to
    where t.household_id = ${householdId} and t.status = 'open' and t.due_on between ${from} and ${to}
    order by t.due_on
  `)];
}

export async function listMembers(tx: Tx, householdId: string) {
  return [...(await tx<{ user_id: string; display_name: string; avatar_color: string; role: "owner" | "member"; joined_at: string; is_demo: boolean }[]>`
    select m.user_id, p.display_name, p.avatar_color, m.role, m.joined_at, p.is_demo
    from household_members m join profiles p on p.id = m.user_id
    where m.household_id = ${householdId}
    order by m.role = 'owner' desc, m.joined_at
  `)];
}
