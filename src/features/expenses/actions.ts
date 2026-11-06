"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { householdAction } from "@/lib/server/action";
import { logActivity } from "@/lib/server/activity";
import { UserFacingError } from "@/lib/server/errors";
import { formatMoney } from "@/lib/domain/money";
import { expenseSchema, id } from "@/lib/validation/schemas";

async function assetName(tx: Parameters<Parameters<typeof householdAction>[1]>[0]["tx"], householdId: string, assetId: string | null) {
  if (!assetId) return null;
  const [a] = await tx<{ name: string }[]>`select name from assets where id = ${assetId} and household_id = ${householdId}`;
  if (!a) throw new UserFacingError("That item no longer exists.", "assetId");
  return a.name;
}

export const createExpenseAction = householdAction(expenseSchema, async ({ input, tx, ctx }) => {
  const name = await assetName(tx, ctx.household.id, input.assetId);
  const [row] = await tx<{ id: string }[]>`
    insert into expenses (household_id, asset_id, asset_name_snapshot, category, description, amount_cents, currency, incurred_on, vendor, created_by)
    values (${ctx.household.id}, ${input.assetId}, ${name}, ${input.category}, ${input.description}, ${input.amount!}, ${ctx.household.currency},
            ${input.incurredOn}, ${input.vendor}, ${ctx.user.id})
    returning id
  `;
  await logActivity(tx, { householdId: ctx.household.id, actorId: ctx.user.id, action: "expense.created", entityType: "expense", entityId: row.id, summary: `recorded ${formatMoney(input.amount!, ctx.household.currency)} — ${input.description}` });
  refresh();
  return { id: row.id };
}, "expense.create");

export const updateExpenseAction = householdAction(z.object({ id, data: expenseSchema }), async ({ input, tx, ctx }) => {
  const name = await assetName(tx, ctx.household.id, input.data.assetId);
  const d = input.data;
  const res = await tx`
    update expenses set asset_id = ${d.assetId}, asset_name_snapshot = ${name}, category = ${d.category}, description = ${d.description},
           amount_cents = ${d.amount!}, incurred_on = ${d.incurredOn}, vendor = ${d.vendor}
    where id = ${input.id} and household_id = ${ctx.household.id}
  `;
  if (res.count === 0) throw new UserFacingError("You can edit expenses you recorded. Ask an owner to change this one.");
  refresh();
}, "expense.update");

export const deleteExpenseAction = householdAction(z.object({ id }), async ({ input, tx, ctx }) => {
  const [row] = await tx<{ description: string }[]>`delete from expenses where id = ${input.id} and household_id = ${ctx.household.id} returning description`;
  if (!row) throw new UserFacingError("You can delete expenses you recorded. Ask an owner to remove this one.");
  await logActivity(tx, { householdId: ctx.household.id, actorId: ctx.user.id, action: "expense.deleted", entityType: "expense", entityId: null, summary: `deleted an expense — ${row.description}` });
  refresh();
}, "expense.delete");
