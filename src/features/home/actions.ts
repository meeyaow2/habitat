"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { assertOwner, householdAction } from "@/lib/server/action";
import { logActivity } from "@/lib/server/activity";
import { UserFacingError } from "@/lib/server/errors";
import { id } from "@/lib/validation/schemas";
import { getAsset } from "@/features/assets/queries";
import { applyTemplate, getPrimaryProperty, saveFloorDoc } from "./server";
import { getTemplate, type TemplateKey } from "./templates";

const coord = z.number().finite().min(-50_000).max(50_000);
const size = (min: number, max: number) => z.number().finite().min(min).max(max);

const roomSchema = z.object({
  id,
  name: z.string().trim().min(1, { error: "Every room needs a name." }).max(60),
  roomType: z.enum(["living", "dining", "kitchen", "bedroom", "bathroom", "balcony", "utility", "study", "storage", "corridor", "household_shelter", "garden", "garage", "other"]),
  x: coord,
  y: coord,
  width: size(50, 20_000),
  height: size(50, 20_000),
  sortOrder: z.number().int(),
  polygon: z.array(z.object({ x: coord, y: coord })).min(3).max(200).nullable().optional(),
});

const objectSchema = z.object({
  id,
  kind: z.enum(["asset", "furniture", "fixture"]),
  assetId: id.nullable(),
  furnitureType: z.string().max(40).nullable(),
  label: z.string().max(60).nullable(),
  x: coord,
  y: coord,
  width: size(10, 5000),
  height: size(10, 5000),
  rotation: z.number().refine((r) => r % 90 === 0, { error: "Rotation must be in 90° steps." }),
});

const pt = z.object({ x: coord, y: coord });
const geometrySchema = z.object({
  walls: z.array(z.object({ id, a: pt, b: pt, thickness: size(2, 100) })).max(2000),
  openings: z
    .array(
      z.object({
        id,
        wallId: id,
        kind: z.enum(["door", "window", "opening"]),
        offset: z.number().finite().min(0).max(50_000),
        width: size(30, 1000),
        flip: z.boolean(),
        hingeEnd: z.boolean(),
        height: size(30, 600),
        sill: z.number().finite().min(0).max(500),
      }),
    )
    .max(1000),
  dimensions: z.array(z.object({ id, a: pt, b: pt, offset: z.number().finite().min(-2000).max(2000) })).max(1000),
  labels: z.array(z.object({ id, at: pt, text: z.string().trim().min(1).max(80), size: size(6, 200) })).max(500),
});

const saveSchema = z.object({
  floorId: id,
  baseVersion: z.number().int().min(1),
  doc: z.object({ rooms: z.array(roomSchema).max(200), objects: z.array(objectSchema).max(1000), geometry: geometrySchema }),
});

export const saveFloorAction = householdAction(saveSchema, async ({ input, tx, ctx }) => {
  const result = await saveFloorDoc(tx, ctx.household.id, input.floorId, input.baseVersion, input.doc);
  await logActivity(tx, {
    householdId: ctx.household.id,
    actorId: ctx.user.id,
    action: "layout.saved",
    entityType: "floor",
    entityId: input.floorId,
    summary: `updated the floor plan (${input.doc.geometry.walls.length} walls, ${input.doc.rooms.length} rooms, ${input.doc.objects.filter((o) => o.kind === "asset").length} items placed)`,
  });
  refresh();
  return result;
}, "layout.save");

export const resetLayoutAction = householdAction(z.object({ templateKey: z.string().max(40) }), async ({ input, tx, ctx }) => {
  assertOwner(ctx);
  if (!getTemplate(input.templateKey)) throw new UserFacingError("Choose a layout.");
  const property = await getPrimaryProperty(tx, ctx.household.id);
  if (!property) throw new UserFacingError("Set up your home first.");
  await applyTemplate(tx, ctx.household.id, property.id, input.templateKey as TemplateKey);
  await logActivity(tx, {
    householdId: ctx.household.id,
    actorId: ctx.user.id,
    action: "layout.reset",
    entityType: "property",
    entityId: property.id,
    summary: `reset the floor plan to the ${getTemplate(input.templateKey)!.label} layout`,
  });
  refresh();
}, "layout.reset");

export const setLayoutAccuracyAction = householdAction(z.object({ accuracy: z.enum(["illustrative", "measured"]) }), async ({ input, tx, ctx }) => {
  assertOwner(ctx);
  await tx`update properties set layout_accuracy = ${input.accuracy} where household_id = ${ctx.household.id}`;
  refresh();
}, "layout.accuracy");

/** Read-only: everything the contextual drawer shows for one asset. */
export const getAssetPanelAction = householdAction(z.object({ id }), async ({ input, tx, ctx }) => {
  const detail = await getAsset(tx, ctx.household.id, input.id, ctx.today);
  if (!detail) throw new UserFacingError("This item no longer exists.");
  return {
    asset: detail.asset,
    warranties: detail.warranties,
    tasks: detail.tasks.filter((t) => t.status === "open").slice(0, 3),
    events: detail.events.slice(0, 3),
    documents: detail.documents.slice(0, 4),
    today: ctx.today,
    reminderDays: ctx.household.warranty_reminder_days,
    currency: ctx.household.currency,
  };
}, "asset.panel");
