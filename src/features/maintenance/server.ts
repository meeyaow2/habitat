import "server-only";
import type { Tx } from "@/lib/db";
import { logActivity } from "@/lib/server/activity";
import { UserFacingError } from "@/lib/server/errors";
import { nextDueDate } from "@/lib/domain/status";
import type { IntervalUnit } from "@/lib/domain/dates";
import type { z } from "zod";
import type { completeTaskSchema, recordEventSchema, taskSchema } from "@/lib/validation/schemas";

type Actor = { householdId: string; userId: string; currency: string };
type TaskInput = z.infer<typeof taskSchema>;

async function assertAsset(tx: Tx, householdId: string, assetId: string | null) {
  if (!assetId) return null;
  const [a] = await tx<{ name: string }[]>`select name from assets where id = ${assetId} and household_id = ${householdId}`;
  if (!a) throw new UserFacingError("That item no longer exists.", "assetId");
  return a.name;
}

async function assertMember(tx: Tx, householdId: string, userId: string | null) {
  if (!userId) return;
  const [m] = await tx`select 1 from household_members where household_id = ${householdId} and user_id = ${userId}`;
  if (!m) throw new UserFacingError("Tasks can only be assigned to household members.", "assignedTo");
}

async function notifyAssignee(tx: Tx, a: Actor, taskId: string, title: string, assignee: string | null) {
  if (!assignee || assignee === a.userId) return;
  await tx`
    insert into notifications (household_id, user_id, kind, title, body, link_path, entity_type, entity_id, dedupe_key)
    values (${a.householdId}, ${assignee}, 'task_assigned', ${`New task: ${title}`}, 'A household member assigned this to you.',
            ${`/maintenance?task=${taskId}`}, 'maintenance_task', ${taskId}, ${`assigned:${taskId}:${assignee}`})
    on conflict (user_id, dedupe_key) do nothing
  `;
}

export async function createTask(tx: Tx, a: Actor, input: TaskInput): Promise<string> {
  await assertAsset(tx, a.householdId, input.assetId);
  await assertMember(tx, a.householdId, input.assignedTo);
  const [t] = await tx<{ id: string }[]>`
    insert into maintenance_tasks (household_id, asset_id, title, description, assigned_to, due_on, priority,
                                   recurrence_interval, recurrence_unit, source, created_by)
    values (${a.householdId}, ${input.assetId}, ${input.title}, ${input.description}, ${input.assignedTo},
            ${input.dueOn}, ${input.priority}, ${input.recurrenceInterval}, ${input.recurrenceUnit}, ${input.source}, ${a.userId})
    returning id
  `;
  await notifyAssignee(tx, a, t.id, input.title, input.assignedTo);
  await logActivity(tx, {
    householdId: a.householdId,
    actorId: a.userId,
    action: "task.created",
    entityType: "maintenance_task",
    entityId: t.id,
    summary: `scheduled “${input.title}”`,
  });
  return t.id;
}

export async function updateTask(tx: Tx, a: Actor, id: string, input: TaskInput) {
  await assertAsset(tx, a.householdId, input.assetId);
  await assertMember(tx, a.householdId, input.assignedTo);
  const [before] = await tx<{ assigned_to: string | null }[]>`select assigned_to from maintenance_tasks where id = ${id}`;
  const res = await tx`
    update maintenance_tasks set
      asset_id = ${input.assetId}, title = ${input.title}, description = ${input.description},
      assigned_to = ${input.assignedTo}, due_on = ${input.dueOn}, priority = ${input.priority},
      recurrence_interval = ${input.recurrenceInterval}, recurrence_unit = ${input.recurrenceUnit}
    where id = ${id} and household_id = ${a.householdId}
  `;
  if (res.count === 0) {
    throw new UserFacingError("You can edit tasks you created or that are assigned to you. Ask an owner to change this one.");
  }
  if (before?.assigned_to !== input.assignedTo) await notifyAssignee(tx, a, id, input.title, input.assignedTo);
  await logActivity(tx, {
    householdId: a.householdId,
    actorId: a.userId,
    action: "task.updated",
    entityType: "maintenance_task",
    entityId: id,
    summary: `updated “${input.title}”`,
  });
}

/**
 * Complete a task: records history, optionally the cost as an expense, and
 * either rolls a recurring task forward or closes a one-off task.
 */
export async function completeTask(tx: Tx, a: Actor, input: z.infer<typeof completeTaskSchema>) {
  const [task] = await tx<{
    id: string; title: string; asset_id: string | null; status: string; due_on: string;
    recurrence_interval: number | null; recurrence_unit: IntervalUnit | null; asset_name: string | null;
  }[]>`
    select t.id, t.title, t.asset_id, t.status, t.due_on, t.recurrence_interval, t.recurrence_unit, a.name as asset_name
    from maintenance_tasks t left join assets a on a.id = t.asset_id
    where t.id = ${input.taskId} and t.household_id = ${a.householdId}
  `;
  if (!task) throw new UserFacingError("This task no longer exists.");
  if (task.status !== "open") throw new UserFacingError("This task is already completed.");

  const recurrence = task.recurrence_interval && task.recurrence_unit
    ? { interval: task.recurrence_interval, unit: task.recurrence_unit }
    : null;
  const next = nextDueDate(recurrence, input.performedOn);

  // Guarded update first: RLS limits it to owners, the creator or the assignee,
  // and the status/due_on guard stops two people completing the same occurrence.
  const res = next
    ? await tx`update maintenance_tasks set due_on = ${next}, last_completed_on = ${input.performedOn}
               where id = ${task.id} and status = 'open' and due_on = ${task.due_on}`
    : await tx`update maintenance_tasks set status = 'completed', completed_at = now(), last_completed_on = ${input.performedOn}
               where id = ${task.id} and status = 'open'`;
  if (res.count === 0) {
    throw new UserFacingError("You can complete tasks you created or that are assigned to you — or someone just completed this one.");
  }

  const [event] = await tx<{ id: string }[]>`
    insert into maintenance_events (household_id, task_id, asset_id, asset_name_snapshot, kind, title, performed_on,
                                    performed_by, vendor, cost_cents, notes, created_by)
    values (${a.householdId}, ${task.id}, ${task.asset_id}, ${task.asset_name}, 'completed', ${task.title},
            ${input.performedOn}, ${a.userId}, ${input.vendor}, ${input.cost}, ${input.notes}, ${a.userId})
    returning id
  `;

  if (input.cost) {
    await tx`
      insert into expenses (household_id, asset_id, asset_name_snapshot, maintenance_event_id, category, description,
                            amount_cents, currency, incurred_on, vendor, created_by)
      values (${a.householdId}, ${task.asset_id}, ${task.asset_name}, ${event.id}, 'servicing', ${task.title},
              ${input.cost}, ${a.currency}, ${input.performedOn}, ${input.vendor}, ${a.userId})
    `;
  }

  await logActivity(tx, {
    householdId: a.householdId,
    actorId: a.userId,
    action: "task.completed",
    entityType: "maintenance_task",
    entityId: task.id,
    summary: `completed “${task.title}”${next ? " — next one scheduled" : ""}`,
  });
  return { nextDueOn: next };
}

export async function recordEvent(tx: Tx, a: Actor, input: z.infer<typeof recordEventSchema>) {
  const assetName = await assertAsset(tx, a.householdId, input.assetId);
  const [event] = await tx<{ id: string }[]>`
    insert into maintenance_events (household_id, asset_id, asset_name_snapshot, kind, title, performed_on,
                                    performed_by, vendor, cost_cents, notes, created_by)
    values (${a.householdId}, ${input.assetId}, ${assetName}, ${input.kind}, ${input.title}, ${input.performedOn},
            ${a.userId}, ${input.vendor}, ${input.cost}, ${input.notes}, ${a.userId})
    returning id
  `;
  if (input.cost) {
    const expenseCategory = input.kind === "repair" ? "repair" : input.kind === "service" ? "servicing" : "other";
    await tx`
      insert into expenses (household_id, asset_id, asset_name_snapshot, maintenance_event_id, category, description,
                            amount_cents, currency, incurred_on, vendor, created_by)
      values (${a.householdId}, ${input.assetId}, ${assetName}, ${event.id}, ${expenseCategory}, ${input.title},
              ${input.cost}, ${a.currency}, ${input.performedOn}, ${input.vendor}, ${a.userId})
    `;
  }
  if (input.kind === "repair" && input.assetId) {
    // A recorded repair resolves "needs attention"/"in repair" states.
    await tx`update assets set status = 'active' where id = ${input.assetId} and status in ('needs_attention', 'in_repair')`;
  }
  await logActivity(tx, {
    householdId: a.householdId,
    actorId: a.userId,
    action: `event.${input.kind}`,
    entityType: "maintenance_event",
    entityId: event.id,
    summary: `recorded a ${input.kind}: ${input.title}${assetName ? ` (${assetName})` : ""}`,
  });
  return event.id;
}

export async function deleteTask(tx: Tx, a: Actor, id: string) {
  const [t] = await tx<{ title: string }[]>`
    delete from maintenance_tasks where id = ${id} and household_id = ${a.householdId} returning title
  `;
  if (!t) throw new UserFacingError("Only the person who created this task or an owner can delete it.");
  await logActivity(tx, {
    householdId: a.householdId,
    actorId: a.userId,
    action: "task.deleted",
    entityType: "maintenance_task",
    entityId: null,
    summary: `deleted “${t.title}”`,
  });
}
