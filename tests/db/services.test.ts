import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { deleteAsset } from "@/features/assets/server";
import { seedDemoHousehold } from "@/features/demo/seed";
import { applyTemplate, getFloors, loadFloorDoc, saveFloorDoc } from "@/features/home/server";
import { completeTask, createTask, recordEvent } from "@/features/maintenance/server";
import { UserFacingError } from "@/lib/server/errors";
import { as, createUser, rejects, seedHousehold, sql } from "./helpers";

describe("domain services under RLS", () => {
  let owner: { id: string };
  let H: Awaited<ReturnType<typeof seedHousehold>>;
  const actor = () => ({ householdId: H.hid, userId: owner.id, currency: "SGD" });

  beforeAll(async () => {
    owner = await createUser("Owner");
    H = await seedHousehold(owner.id);
  });
  afterAll(() => sql.end());

  it("completing a recurring task rolls it forward from the completion date and records cost as an expense (journeys 9–12)", async () => {
    const taskId = await as(owner.id, (tx) =>
      createTask(tx, actor(), { title: "Service washer", description: null, assetId: H.assetId, assignedTo: null, dueOn: "2026-11-01", priority: "normal", recurrenceInterval: 3, recurrenceUnit: "month", source: "user" }),
    );
    const res = await as(owner.id, (tx) => completeTask(tx, actor(), { taskId, performedOn: "2026-11-10", notes: null, vendor: "Tech Co", cost: 8000 }));
    expect(res.nextDueOn).toBe("2027-02-10");
    const [task] = await sql`select status, due_on, last_completed_on from maintenance_tasks where id = ${taskId}`;
    expect(task).toMatchObject({ status: "open", due_on: "2027-02-10", last_completed_on: "2026-11-10" });
    const [event] = await sql`select kind, cost_cents, asset_id from maintenance_events where task_id = ${taskId}`;
    expect(event).toMatchObject({ kind: "completed", cost_cents: 8000, asset_id: H.assetId });
    const [expense] = await sql`select category, amount_cents, incurred_on from expenses where description = 'Service washer'`;
    expect(expense).toMatchObject({ category: "servicing", amount_cents: 8000, incurred_on: "2026-11-10" });
  });

  it("a one-off task closes on completion and cannot be completed twice", async () => {
    const taskId = await as(owner.id, (tx) => createTask(tx, actor(), { title: "Fix tap", description: null, assetId: null, assignedTo: null, dueOn: "2026-11-01", priority: "high", recurrenceInterval: null, recurrenceUnit: null, source: "user" }));
    await as(owner.id, (tx) => completeTask(tx, actor(), { taskId, performedOn: "2026-11-02", notes: null, vendor: null, cost: null }));
    expect((await sql`select status from maintenance_tasks where id = ${taskId}`)[0].status).toBe("completed");
    const err = await rejects(as(owner.id, (tx) => completeTask(tx, actor(), { taskId, performedOn: "2026-11-02", notes: null, vendor: null, cost: null })));
    expect(err).toBeInstanceOf(UserFacingError);
  });

  it("a recorded repair clears the needs-attention flag and adds a repair expense", async () => {
    await sql`update assets set status = 'needs_attention' where id = ${H.assetId}`;
    await as(owner.id, (tx) => recordEvent(tx, actor(), { assetId: H.assetId, kind: "repair", title: "New drain pump", performedOn: "2026-11-03", vendor: null, cost: 15000, notes: null }));
    expect((await sql`select status from assets where id = ${H.assetId}`)[0].status).toBe("active");
    expect(await sql`select 1 from expenses where description = 'New drain pump' and category = 'repair' and amount_cents = 15000`).toHaveLength(1);
  });

  it("saving a floor plan persists positions, derives the asset’s room, and detects concurrent edits (journeys 5–6)", async () => {
    const [floor] = await sql<{ version: number }[]>`select version from floors where id = ${H.floorId}`;
    const doc = await as(owner.id, (tx) => loadFloorDoc(tx, H.floorId));
    // Place the washer in the Yard (room 2 spans x 300–500).
    const placed = { ...doc, objects: [{ id: randomUUID(), kind: "asset" as const, assetId: H.assetId, furnitureType: null, label: null, x: 380, y: 120, width: 44, height: 44, rotation: 0 }] };
    const res = await as(owner.id, (tx) => saveFloorDoc(tx, H.hid, H.floorId, floor.version, placed));
    expect(res).toEqual({ version: floor.version + 1, reassigned: 1 });
    expect((await sql`select room_id from assets where id = ${H.assetId}`)[0].room_id).toBe(H.room2Id);
    const reloaded = await as(owner.id, (tx) => loadFloorDoc(tx, H.floorId));
    expect(reloaded.objects[0]).toMatchObject({ assetId: H.assetId, x: 380, y: 120 });

    // A stale editor (old version) must not overwrite newer work.
    const stale = await rejects(as(owner.id, (tx) => saveFloorDoc(tx, H.hid, H.floorId, floor.version, doc)));
    expect(stale.message).toMatch(/Someone else saved/);
  });

  it("refuses to place another household’s asset", async () => {
    const other = await createUser("Other");
    const O = await seedHousehold(other.id);
    const [floor] = await sql<{ version: number }[]>`select version from floors where id = ${H.floorId}`;
    const doc = await as(owner.id, (tx) => loadFloorDoc(tx, H.floorId));
    const bad = { ...doc, objects: [...doc.objects, { id: randomUUID(), kind: "asset" as const, assetId: O.assetId, furnitureType: null, label: null, x: 10, y: 10, width: 44, height: 44, rotation: 0 }] };
    const err = await rejects(as(owner.id, (tx) => saveFloorDoc(tx, H.hid, H.floorId, floor.version, bad)));
    expect(err.message).toMatch(/no longer exists/);
  });

  it("applying a template replaces rooms but keeps assets (unplaced)", async () => {
    await as(owner.id, (tx) => applyTemplate(tx, H.hid, H.propertyId, "hdb_3_room"));
    const floors = await as(owner.id, (tx) => getFloors(tx, H.propertyId));
    expect(floors).toHaveLength(1);
    const doc = await as(owner.id, (tx) => loadFloorDoc(tx, floors[0].id));
    expect(doc.rooms.length).toBeGreaterThan(5);
    expect(doc.objects.filter((o) => o.kind === "asset")).toHaveLength(0);
    expect((await sql`select room_id from assets where id = ${H.assetId}`)[0].room_id).toBeNull();
  });

  it("deleting an asset follows the retention policy", async () => {
    await as(owner.id, (tx) => deleteAsset(tx, actor(), H.assetId));
    expect(await sql`select 1 from assets where id = ${H.assetId}`).toHaveLength(0);
    expect(await sql`select 1 from warranties where asset_id = ${H.assetId}`).toHaveLength(0);
    expect(await sql`select 1 from maintenance_tasks where asset_id = ${H.assetId}`).toHaveLength(0);
    // Financial and service history kept, with the asset's name.
    const expenses = await sql`select asset_id, asset_name_snapshot from expenses where household_id = ${H.hid} and asset_name_snapshot is not null`;
    expect(expenses.length).toBeGreaterThan(0);
    expect(expenses.every((e) => e.asset_id === null)).toBe(true);
    // Documents unlinked but kept.
    const [doc] = await sql`select asset_id from documents where id = ${H.documentId}`;
    expect(doc.asset_id).toBeNull();
  });

  it("the demo seeder runs end-to-end through RLS", async () => {
    const visitor = await createUser("Visitor");
    const hid = await as(visitor.id, (tx) => seedDemoHousehold(tx, visitor.id));
    const [counts] = await sql`select (select count(*)::int from assets where household_id = ${hid}) assets,
                                      (select count(*)::int from floor_plan_objects where household_id = ${hid} and kind = 'asset') placed,
                                      (select count(*)::int from maintenance_tasks where household_id = ${hid}) tasks`;
    expect(counts).toMatchObject({ assets: 8, placed: 6, tasks: 7 });
  });
});
