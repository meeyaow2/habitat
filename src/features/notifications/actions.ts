"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { householdAction } from "@/lib/server/action";
import { id } from "@/lib/validation/schemas";

export const markNotificationReadAction = householdAction(z.object({ id }), async ({ input, tx, ctx }) => {
  await tx`update notifications set read_at = coalesce(read_at, now()) where id = ${input.id} and user_id = ${ctx.user.id}`;
  refresh();
}, "notifications.read");

export const markAllNotificationsReadAction = householdAction(z.object({}), async ({ tx, ctx }) => {
  await tx`update notifications set read_at = now() where user_id = ${ctx.user.id} and household_id = ${ctx.household.id} and read_at is null`;
  refresh();
}, "notifications.read-all");
