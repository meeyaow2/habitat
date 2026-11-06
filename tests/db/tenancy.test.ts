import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createUser, rejects, seedHousehold, sql } from "./helpers";

const TABLES = ["households", "household_members", "properties", "floors", "rooms", "assets", "warranties", "documents", "maintenance_tasks", "maintenance_events", "expenses", "floor_plan_objects", "activity_logs"];

describe("tenant isolation (journey 14)", () => {
  let alice: { id: string }, bob: { id: string };
  let A: Awaited<ReturnType<typeof seedHousehold>>, B: Awaited<ReturnType<typeof seedHousehold>>;

  beforeAll(async () => {
    alice = await createUser("Alice");
    bob = await createUser("Bob");
    A = await seedHousehold(alice.id, "Alice home");
    B = await seedHousehold(bob.id, "Bob home");
  });
  afterAll(() => sql.end());

  it("each user sees only their own household’s rows, in every table", async () => {
    for (const table of TABLES) {
      const column = table === "households" ? "id" : "household_id";
      const [{ n }] = await as(bob.id, (tx) => tx<{ n: number }[]>`select count(*)::int as n from ${tx(table)} where ${tx(column)} = ${A.hid}`);
      expect(n, table).toBe(0);
    }
    const [{ n }] = await as(alice.id, (tx) => tx<{ n: number }[]>`select count(*)::int as n from assets`);
    expect(n).toBe(1);
  });

  it("an unauthenticated session sees nothing", async () => {
    for (const table of TABLES) {
      const [{ n }] = await as(null, (tx) => tx<{ n: number }[]>`select count(*)::int as n from ${tx(table)}`);
      expect(n, table).toBe(0);
    }
  });

  it("cannot insert records into another household", async () => {
    const err = await rejects(as(bob.id, (tx) => tx`insert into assets (household_id, category_id, name, created_by) values (${A.hid}, 'other', 'x', ${bob.id})`));
    expect(err.message).toMatch(/row-level security/);
  });

  it("cannot impersonate another creator", async () => {
    const err = await rejects(as(bob.id, (tx) => tx`insert into assets (household_id, category_id, name, created_by) values (${B.hid}, 'other', 'x', ${alice.id})`));
    expect(err.message).toMatch(/row-level security/);
  });

  it("cannot reference another household’s room, asset or floor (composite FKs)", async () => {
    let err = await rejects(as(bob.id, (tx) => tx`insert into assets (household_id, room_id, category_id, name, created_by) values (${B.hid}, ${A.roomId}, 'other', 'x', ${bob.id})`));
    expect(err.code).toBe("23503");
    err = await rejects(as(bob.id, (tx) => tx`insert into floor_plan_objects (household_id, floor_id, kind, asset_id, x, y, width, height) values (${B.hid}, ${B.floorId}, 'asset', ${A.assetId}, 0, 0, 44, 44)`));
    expect(err.code).toBe("23503");
    err = await rejects(as(bob.id, (tx) => tx`insert into maintenance_tasks (household_id, asset_id, title, due_on, created_by) values (${B.hid}, ${A.assetId}, 't', '2026-12-01', ${bob.id})`));
    expect(err.code).toBe("23503");
    err = await rejects(as(bob.id, (tx) => tx`update assets set room_id = ${A.roomId} where id = ${B.assetId}`));
    expect(err.code).toBe("23503");
  });

  it("cannot update, delete or re-home another household’s records", async () => {
    await as(bob.id, async (tx) => {
      expect((await tx`update assets set name = 'pwned' where id = ${A.assetId}`).count).toBe(0);
      expect((await tx`delete from assets where id = ${A.assetId}`).count).toBe(0);
      expect((await tx`delete from households where id = ${A.hid}`).count).toBe(0);
      expect((await tx`update documents set title = 'x' where id = ${A.documentId}`).count).toBe(0);
    });
    const err = await rejects(as(bob.id, (tx) => tx`update assets set household_id = ${A.hid} where id = ${B.assetId}`));
    expect(err.message).toMatch(/row-level security|permission/);
    const [row] = await sql`select name from assets where id = ${A.assetId}`;
    expect(row.name).toBe("Washer");
  });

  it("cannot add themselves to another household", async () => {
    const err = await rejects(as(bob.id, (tx) => tx`insert into household_members (household_id, user_id, role) values (${A.hid}, ${bob.id}, 'owner')`));
    expect(err.message).toMatch(/row-level security/);
  });

  it("cannot read another user’s notifications or create invitations for others", async () => {
    await sql`insert into notifications (household_id, user_id, kind, title) values (${A.hid}, ${alice.id}, 'system', 'hello')`;
    const rows = await as(bob.id, (tx) => tx`select * from notifications`);
    expect(rows).toHaveLength(0);
    const err = await rejects(as(bob.id, (tx) => tx`insert into household_invitations (household_id, email, token_hash, invited_by, expires_at) values (${A.hid}, 'x@y.co', ${"a".repeat(64)}, ${bob.id}, now() + interval '1 day')`));
    expect(err.message).toMatch(/row-level security/);
  });

  it("cannot change system-managed columns", async () => {
    const err = await rejects(as(bob.id, (tx) => tx`update profiles set is_demo = true where id = ${bob.id}`));
    expect(err.code).toBe("42501");
    const err2 = await rejects(as(bob.id, (tx) => tx`update households set is_demo = true where id = ${B.hid}`));
    expect(err2.code).toBe("42501");
  });
});
