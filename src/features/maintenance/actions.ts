"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { householdAction } from "@/lib/server/action";
import { completeTaskSchema, id, recordEventSchema, taskSchema } from "@/lib/validation/schemas";
import { completeTask, createTask, deleteTask, recordEvent, updateTask } from "./server";

const actor = (ctx: { household: { id: string; currency: string }; user: { id: string } }) => ({
  householdId: ctx.household.id,
  userId: ctx.user.id,
  currency: ctx.household.currency,
});

export const createTaskAction = householdAction(taskSchema, async ({ input, tx, ctx }) => {
  const taskId = await createTask(tx, actor(ctx), input);
  refresh();
  return { id: taskId };
}, "task.create");

export const createTasksAction = householdAction(z.object({ tasks: z.array(taskSchema).min(1).max(12) }), async ({ input, tx, ctx }) => {
  for (const t of input.tasks) await createTask(tx, actor(ctx), t);
  refresh();
  return { count: input.tasks.length };
}, "task.create-many");

export const updateTaskAction = householdAction(z.object({ id, data: taskSchema }), async ({ input, tx, ctx }) => {
  await updateTask(tx, actor(ctx), input.id, input.data);
  refresh();
}, "task.update");

export const completeTaskAction = householdAction(completeTaskSchema, async ({ input, tx, ctx }) => {
  const result = await completeTask(tx, actor(ctx), input);
  refresh();
  return result;
}, "task.complete");

export const deleteTaskAction = householdAction(z.object({ id }), async ({ input, tx, ctx }) => {
  await deleteTask(tx, actor(ctx), input.id);
  refresh();
}, "task.delete");

export const recordEventAction = householdAction(recordEventSchema, async ({ input, tx, ctx }) => {
  const eventId = await recordEvent(tx, actor(ctx), input);
  refresh();
  return { id: eventId };
}, "event.record");
