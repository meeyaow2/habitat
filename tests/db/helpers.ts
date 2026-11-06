import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { pgTypes } from "@/lib/db/types";
import { TEST_DATABASE_URL } from "./global-setup";

export const sql = postgres(TEST_DATABASE_URL, { max: 4, onnotice: () => {}, prepare: false, types: pgTypes });
export type Tx = postgres.TransactionSql;

export async function createUser(name = "User"): Promise<{ id: string; email: string }> {
  const email = `${name.toLowerCase().replace(/\W+/g, "")}-${randomUUID().slice(0, 8)}@test.habitat`;
  const [u] = await sql<{ id: string }[]>`
    insert into auth.users (email, raw_user_meta_data) values (${email}, ${sql.json({ display_name: name })}) returning id`;
  return { id: u.id, email };
}

/** Run as the authenticated role with this user's JWT claims — exactly like the app. */
export async function as<T>(userId: string | null, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return (await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify(userId ? { sub: userId, role: "authenticated" } : { role: "anon" })}, true), set_config('role', 'authenticated', true)`;
    return fn(tx);
  })) as T;
}

/** Expect a database error; returns it for further assertions. */
export async function rejects(p: Promise<unknown>): Promise<{ code?: string; hint?: string; message: string }> {
  try {
    await p;
  } catch (e) {
    return e as { code?: string; hint?: string; message: string };
  }
  throw new Error("Expected the operation to fail, but it succeeded");
}

/** A household with property, floor, room, asset, task, expense and document row. */
export async function seedHousehold(ownerId: string, name = "Home") {
  return as(ownerId, async (tx) => {
    const [{ hid }] = await tx<{ hid: string }[]>`select public.create_household(${name}) as hid`;
    const [p] = await tx<{ id: string }[]>`insert into properties (household_id, name, property_type) values (${hid}, 'Flat', 'hdb') returning id`;
    const [f] = await tx<{ id: string }[]>`insert into floors (household_id, property_id, name) values (${hid}, ${p.id}, 'Main') returning id`;
    const [r] = await tx<{ id: string }[]>`insert into rooms (household_id, floor_id, name, x, y, width, height) values (${hid}, ${f.id}, 'Kitchen', 0, 0, 300, 300) returning id`;
    const [r2] = await tx<{ id: string }[]>`insert into rooms (household_id, floor_id, name, x, y, width, height) values (${hid}, ${f.id}, 'Yard', 300, 0, 200, 300) returning id`;
    const [a] = await tx<{ id: string }[]>`insert into assets (household_id, property_id, room_id, category_id, name, created_by) values (${hid}, ${p.id}, ${r.id}, 'washing_machine', 'Washer', ${ownerId}) returning id`;
    await tx`insert into warranties (household_id, asset_id, expires_on) values (${hid}, ${a.id}, '2027-01-01')`;
    const [t] = await tx<{ id: string }[]>`insert into maintenance_tasks (household_id, asset_id, title, due_on, created_by) values (${hid}, ${a.id}, 'Clean filter', '2026-12-01', ${ownerId}) returning id`;
    const [e] = await tx<{ id: string }[]>`insert into expenses (household_id, asset_id, category, description, amount_cents, incurred_on, created_by) values (${hid}, ${a.id}, 'repair', 'Pump', 12000, '2026-10-01', ${ownerId}) returning id`;
    const [d] = await tx<{ id: string }[]>`insert into documents (household_id, asset_id, kind, title, storage_path, mime_type, size_bytes, uploaded_by) values (${hid}, ${a.id}, 'receipt', 'Receipt', ${`${hid}/${randomUUID()}.pdf`}, 'application/pdf', 100, ${ownerId}) returning id`;
    return { hid, propertyId: p.id, floorId: f.id, roomId: r.id, room2Id: r2.id, assetId: a.id, taskId: t.id, expenseId: e.id, documentId: d.id };
  });
}
