import "server-only";
import type { Tx } from "@/lib/db";
import { UserFacingError } from "@/lib/server/errors";
import { centre, objectBounds, roomAt, validateDoc, type FloorDoc, type PlanObject, type RoomShape } from "./model";
import { floorExtent, getTemplate, instantiateFloor, type TemplateKey } from "./templates";

export type FloorRow = { id: string; name: string; level: number; version: number; width_cm: number; depth_cm: number };

export type PropertyRow = {
  id: string;
  name: string;
  property_type: string;
  hdb_flat_type: string | null;
  template_key: string | null;
  layout_accuracy: "illustrative" | "measured";
};

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------
export async function createProperty(
  tx: Tx,
  householdId: string,
  p: { name: string; propertyType: string; hdbFlatType: string | null },
): Promise<string> {
  const [row] = await tx<{ id: string }[]>`
    insert into properties (household_id, name, property_type, hdb_flat_type)
    values (${householdId}, ${p.name}, ${p.propertyType}, ${p.hdbFlatType})
    returning id
  `;
  return row.id;
}

/**
 * Replace a property's floors with a template's floors. Existing floors (and
 * their rooms and furniture) are removed; assets are kept but become unplaced.
 */
export async function applyTemplate(tx: Tx, householdId: string, propertyId: string, key: TemplateKey) {
  const template = getTemplate(key);
  if (!template) throw new UserFacingError("That layout template doesn’t exist.");

  await tx`delete from floors where property_id = ${propertyId} and household_id = ${householdId}`;
  for (const floor of template.floors) {
    const extent = floorExtent(floor);
    const [f] = await tx<{ id: string }[]>`
      insert into floors (household_id, property_id, name, level, width_cm, depth_cm)
      values (${householdId}, ${propertyId}, ${floor.name}, ${floor.level}, ${extent.widthCm}, ${extent.depthCm})
      returning id
    `;
    await writeDoc(tx, householdId, f.id, instantiateFloor(floor));
  }
  await tx`update properties set template_key = ${key}, layout_accuracy = 'illustrative' where id = ${propertyId}`;
}

async function writeDoc(tx: Tx, householdId: string, floorId: string, doc: FloorDoc) {
  if (doc.rooms.length) {
    await tx`
      insert into rooms ${tx(
        doc.rooms.map((r) => ({
          id: r.id,
          household_id: householdId,
          floor_id: floorId,
          name: r.name,
          room_type: r.roomType,
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          sort_order: r.sortOrder,
        })),
      )}
    `;
  }
  if (doc.objects.length) {
    await tx`
      insert into floor_plan_objects ${tx(
        doc.objects.map((o) => ({
          id: o.id,
          household_id: householdId,
          floor_id: floorId,
          kind: o.kind,
          asset_id: o.assetId,
          furniture_type: o.furnitureType,
          label: o.label,
          x: o.x,
          y: o.y,
          width: o.width,
          height: o.height,
          rotation: o.rotation,
        })),
      )}
    `;
  }
}

// ---------------------------------------------------------------------------
// Read
// ---------------------------------------------------------------------------
export async function getPrimaryProperty(tx: Tx, householdId: string): Promise<PropertyRow | null> {
  const [p] = await tx<PropertyRow[]>`
    select id, name, property_type, hdb_flat_type, template_key, layout_accuracy
    from properties where household_id = ${householdId}
    order by created_at limit 1
  `;
  return p ?? null;
}

export async function getFloors(tx: Tx, propertyId: string): Promise<FloorRow[]> {
  return [...(await tx<FloorRow[]>`
    select id, name, level, version, width_cm, depth_cm from floors
    where property_id = ${propertyId} order by level
  `)];
}

export async function loadFloorDoc(tx: Tx, floorId: string): Promise<FloorDoc> {
  const rooms = await tx<RoomShape[]>`
    select id, name, room_type as "roomType", x, y, width, height, sort_order as "sortOrder"
    from rooms where floor_id = ${floorId} order by sort_order, created_at
  `;
  const objects = await tx<PlanObject[]>`
    select id, kind, asset_id as "assetId", furniture_type as "furnitureType", label, x, y, width, height, rotation
    from floor_plan_objects where floor_id = ${floorId} order by created_at
  `;
  return { rooms: [...rooms], objects: [...objects] };
}

// ---------------------------------------------------------------------------
// Save (diff + optimistic concurrency)
// ---------------------------------------------------------------------------
export type SaveResult = { version: number; reassigned: number };

export async function saveFloorDoc(
  tx: Tx,
  householdId: string,
  floorId: string,
  baseVersion: number,
  doc: FloorDoc,
): Promise<SaveResult> {
  const problems = validateDoc(doc);
  if (problems.length) throw new UserFacingError(problems[0]);

  // Lock the floor and check nobody saved in between.
  const [floor] = await tx<{ version: number }[]>`
    update floors set version = version + 1
    where id = ${floorId} and household_id = ${householdId} and version = ${baseVersion}
    returning version
  `;
  if (!floor) {
    const [exists] = await tx`select version from floors where id = ${floorId}`;
    if (!exists) throw new UserFacingError("This floor no longer exists.");
    throw new UserFacingError(
      "Someone else saved changes to this floor plan while you were editing. Reload to see their version — your edits are still on screen.",
    );
  }

  // Asset markers may only reference this household's assets (the composite FK
  // enforces it too). An asset placed here is moved off any other floor.
  const assetIds = doc.objects.filter((o) => o.assetId).map((o) => o.assetId!);
  if (assetIds.length) {
    const found = await tx`select id from assets where household_id = ${householdId} and id in ${tx(assetIds)}`;
    if (found.length !== new Set(assetIds).size) throw new UserFacingError("One of the placed items no longer exists.");
    await tx`delete from floor_plan_objects where asset_id in ${tx(assetIds)} and floor_id <> ${floorId}`;
  }

  // Rooms: delete removed, upsert the rest.
  const roomIds = doc.rooms.map((r) => r.id);
  if (roomIds.length) {
    await tx`delete from rooms where floor_id = ${floorId} and id not in ${tx(roomIds)}`;
    await tx`
      insert into rooms ${tx(
        doc.rooms.map((r, i) => ({
          id: r.id,
          household_id: householdId,
          floor_id: floorId,
          name: r.name.trim().slice(0, 60),
          room_type: r.roomType,
          x: r.x,
          y: r.y,
          width: r.width,
          height: r.height,
          sort_order: i,
        })),
      )}
      on conflict (id) do update set
        name = excluded.name, room_type = excluded.room_type, x = excluded.x, y = excluded.y,
        width = excluded.width, height = excluded.height, sort_order = excluded.sort_order
      where rooms.floor_id = excluded.floor_id
    `;
  } else {
    await tx`delete from rooms where floor_id = ${floorId}`;
  }

  // Objects
  const objectIds = doc.objects.map((o) => o.id);
  if (objectIds.length) {
    await tx`delete from floor_plan_objects where floor_id = ${floorId} and id not in ${tx(objectIds)}`;
    await tx`
      insert into floor_plan_objects ${tx(
        doc.objects.map((o) => ({
          id: o.id,
          household_id: householdId,
          floor_id: floorId,
          kind: o.kind,
          asset_id: o.assetId,
          furniture_type: o.furnitureType,
          label: o.label?.trim().slice(0, 60) || null,
          x: o.x,
          y: o.y,
          width: o.width,
          height: o.height,
          rotation: o.rotation,
        })),
      )}
      on conflict (id) do update set
        kind = excluded.kind, asset_id = excluded.asset_id, furniture_type = excluded.furniture_type,
        label = excluded.label, x = excluded.x, y = excluded.y, width = excluded.width,
        height = excluded.height, rotation = excluded.rotation
      where floor_plan_objects.floor_id = excluded.floor_id
    `;
  } else {
    await tx`delete from floor_plan_objects where floor_id = ${floorId}`;
  }

  // A placed asset's room is derived from where it sits: the position on the
  // plan is the single source of truth for its room assignment.
  let reassigned = 0;
  for (const o of doc.objects) {
    if (!o.assetId) continue;
    const r = roomAt(doc.rooms, centre(objectBounds(o)));
    if (!r) continue;
    const res = await tx`
      update assets set room_id = ${r.id}
      where id = ${o.assetId} and household_id = ${householdId} and room_id is distinct from ${r.id}
    `;
    reassigned += res.count;
  }

  return { version: floor.version, reassigned };
}
