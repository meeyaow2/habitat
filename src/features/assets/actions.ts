"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { householdAction } from "@/lib/server/action";
import { assetSchema, id } from "@/lib/validation/schemas";
import { createAsset, deleteAsset, setArchived, updateAsset } from "./server";

const actor = (ctx: { household: { id: string; currency: string }; user: { id: string } }) => ({
  householdId: ctx.household.id,
  userId: ctx.user.id,
  currency: ctx.household.currency,
});

export const createAssetAction = householdAction(assetSchema, async ({ input, tx, ctx }) => {
  const assetId = await createAsset(tx, actor(ctx), input);
  refresh();
  return { id: assetId };
}, "asset.create");

export const updateAssetAction = householdAction(z.object({ id, data: assetSchema }), async ({ input, tx, ctx }) => {
  await updateAsset(tx, actor(ctx), input.id, input.data);
  refresh();
  return { id: input.id };
}, "asset.update");

export const archiveAssetAction = householdAction(z.object({ id, archived: z.boolean() }), async ({ input, tx, ctx }) => {
  await setArchived(tx, actor(ctx), input.id, input.archived);
  refresh();
}, "asset.archive");

export const deleteAssetAction = householdAction(z.object({ id }), async ({ input, tx, ctx }) => {
  await deleteAsset(tx, actor(ctx), input.id);
}, "asset.delete");

export const setAssetStatusAction = householdAction(
  z.object({ id, status: z.enum(["active", "needs_attention", "in_repair", "retired"]) }),
  async ({ input, tx, ctx }) => {
    const [row] = await tx<{ name: string }[]>`
      update assets set status = ${input.status} where id = ${input.id} and household_id = ${ctx.household.id} returning name
    `;
    if (row) {
      await tx`insert into activity_logs (household_id, actor_id, action, entity_type, entity_id, summary)
               values (${ctx.household.id}, ${ctx.user.id}, 'asset.status', 'asset', ${input.id},
                       ${`marked ${row.name} as ${input.status.replace("_", " ")}`})`;
    }
    refresh();
  },
  "asset.status",
);
