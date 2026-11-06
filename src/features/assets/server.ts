import "server-only";
import type { Tx } from "@/lib/db";
import { logActivity } from "@/lib/server/activity";
import { UserFacingError } from "@/lib/server/errors";
import { category } from "@/lib/domain/categories";
import type { AssetInput } from "@/lib/validation/schemas";

type Actor = { householdId: string; userId: string; currency: string };

async function assertRoomInHousehold(tx: Tx, householdId: string, roomId: string | null) {
  if (!roomId) return;
  const [r] = await tx`select 1 from rooms where id = ${roomId} and household_id = ${householdId}`;
  if (!r) throw new UserFacingError("That room no longer exists.", "roomId");
}

export async function createAsset(tx: Tx, a: Actor, input: AssetInput): Promise<string> {
  await assertRoomInHousehold(tx, a.householdId, input.roomId);
  const [property] = await tx<{ id: string }[]>`
    select id from properties where household_id = ${a.householdId} order by created_at limit 1
  `;
  const [asset] = await tx<{ id: string }[]>`
    insert into assets (household_id, property_id, room_id, category_id, name, brand, model, serial_number,
                        purchase_date, purchase_price_cents, currency, vendor, status, notes, created_by)
    values (${a.householdId}, ${property?.id ?? null}, ${input.roomId}, ${input.categoryId}, ${input.name},
            ${input.brand}, ${input.model}, ${input.serialNumber}, ${input.purchaseDate}, ${input.purchasePrice},
            ${a.currency}, ${input.vendor}, ${input.status}, ${input.notes}, ${a.userId})
    returning id
  `;
  await syncPrimaryWarranty(tx, a.householdId, asset.id, input);

  if (input.recordPurchaseExpense && input.purchasePrice) {
    await tx`
      insert into expenses (household_id, asset_id, asset_name_snapshot, category, description, amount_cents,
                            currency, incurred_on, vendor, created_by)
      values (${a.householdId}, ${asset.id}, ${input.name}, 'appliance_purchase', ${`Purchase: ${input.name}`},
              ${input.purchasePrice}, ${a.currency}, ${input.purchaseDate ?? new Date().toISOString().slice(0, 10)},
              ${input.vendor}, ${a.userId})
    `;
  }

  await logActivity(tx, {
    householdId: a.householdId,
    actorId: a.userId,
    action: "asset.created",
    entityType: "asset",
    entityId: asset.id,
    summary: `added ${input.name} (${category(input.categoryId).label.toLowerCase()})`,
  });
  return asset.id;
}

export async function updateAsset(tx: Tx, a: Actor, id: string, input: AssetInput) {
  await assertRoomInHousehold(tx, a.householdId, input.roomId);
  const res = await tx`
    update assets set
      room_id = ${input.roomId}, category_id = ${input.categoryId}, name = ${input.name}, brand = ${input.brand},
      model = ${input.model}, serial_number = ${input.serialNumber}, purchase_date = ${input.purchaseDate},
      purchase_price_cents = ${input.purchasePrice}, vendor = ${input.vendor}, status = ${input.status},
      notes = ${input.notes}
    where id = ${id} and household_id = ${a.householdId}
  `;
  if (res.count === 0) throw new UserFacingError("This item no longer exists or you can’t edit it.");
  await syncPrimaryWarranty(tx, a.householdId, id, input);
  await logActivity(tx, {
    householdId: a.householdId,
    actorId: a.userId,
    action: "asset.updated",
    entityType: "asset",
    entityId: id,
    summary: `updated ${input.name}`,
  });
}

/** The form edits a single "primary" warranty; extra warranties are kept as-is. */
async function syncPrimaryWarranty(tx: Tx, householdId: string, assetId: string, input: AssetInput) {
  const [existing] = await tx<{ id: string }[]>`
    select id from warranties where asset_id = ${assetId} order by created_at limit 1
  `;
  if (!input.warrantyExpiresOn) {
    if (existing) await tx`delete from warranties where id = ${existing.id}`;
    return;
  }
  if (existing) {
    await tx`
      update warranties set kind = ${input.warrantyKind}, provider = ${input.warrantyProvider},
        starts_on = ${input.warrantyStartsOn}, expires_on = ${input.warrantyExpiresOn}, terms = ${input.warrantyTerms}
      where id = ${existing.id}
    `;
  } else {
    await tx`
      insert into warranties (household_id, asset_id, kind, provider, starts_on, expires_on, terms)
      values (${householdId}, ${assetId}, ${input.warrantyKind}, ${input.warrantyProvider},
              ${input.warrantyStartsOn}, ${input.warrantyExpiresOn}, ${input.warrantyTerms})
    `;
  }
}

export async function setArchived(tx: Tx, a: Actor, id: string, archived: boolean) {
  const [row] = await tx<{ name: string }[]>`
    update assets set archived_at = ${archived ? tx`now()` : null}
    where id = ${id} and household_id = ${a.householdId}
    returning name
  `;
  if (!row) throw new UserFacingError("This item no longer exists.");
  if (archived) {
    // Archived items leave the floor plan and stop generating reminders.
    await tx`delete from floor_plan_objects where asset_id = ${id}`;
  }
  await logActivity(tx, {
    householdId: a.householdId,
    actorId: a.userId,
    action: archived ? "asset.archived" : "asset.restored",
    entityType: "asset",
    entityId: id,
    summary: `${archived ? "archived" : "restored"} ${row.name}`,
  });
}

/**
 * Permanent deletion. Retention policy (also shown in the confirmation):
 *  - removed: the asset, its floor-plan marker, warranties and maintenance tasks
 *  - kept:    expenses and service history (asset name kept as a snapshot),
 *             documents (unlinked, stay in the library)
 */
export async function deleteAsset(tx: Tx, a: Actor, id: string) {
  const [asset] = await tx<{ name: string }[]>`select name from assets where id = ${id} and household_id = ${a.householdId}`;
  if (!asset) throw new UserFacingError("This item no longer exists.");
  await tx`update expenses set asset_name_snapshot = coalesce(asset_name_snapshot, ${asset.name}) where asset_id = ${id}`;
  await tx`update maintenance_events set asset_name_snapshot = coalesce(asset_name_snapshot, ${asset.name}) where asset_id = ${id}`;
  const res = await tx`delete from assets where id = ${id} and household_id = ${a.householdId}`;
  if (res.count === 0) throw new UserFacingError("Only the person who added this item or a household owner can delete it.");
  await logActivity(tx, {
    householdId: a.householdId,
    actorId: a.userId,
    action: "asset.deleted",
    entityType: "asset",
    entityId: null,
    summary: `deleted ${asset.name}`,
  });
}
