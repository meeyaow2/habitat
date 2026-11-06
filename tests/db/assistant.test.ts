import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { answerQuestion, selectReferences } from "@/features/ai/assistant";
import { buildAssistantTools, newCollector, type ToolContext } from "@/features/ai/assistant-tools";
import { listNotifications, syncNotifications } from "@/features/notifications/server";
import type { AiProvider } from "@/lib/ai/provider";
import { as, createUser, seedHousehold, sql } from "./helpers";

const TODAY = "2026-11-06";

describe("Ask Habitat tools and orchestration (provider stubbed)", () => {
  let owner: { id: string }, outsider: { id: string };
  let H: Awaited<ReturnType<typeof seedHousehold>>;
  const ctxFor = (userId: string, householdId = H.hid): ToolContext & { householdName: string } => ({
    householdId,
    householdName: "Test home",
    today: TODAY,
    currency: "SGD",
    reminderDays: 60,
    run: (fn) => as(userId, fn),
  });
  const tool = (userId: string, name: string, householdId?: string) => {
    const c = newCollector();
    const t = buildAssistantTools(ctxFor(userId, householdId), c).find((x) => x.name === name)!;
    return { run: async (input: unknown) => JSON.parse(await t.run(t.schema.parse(input))), c };
  };

  beforeAll(async () => {
    owner = await createUser("Owner");
    outsider = await createUser("Outsider");
    H = await seedHousehold(owner.id);
    await as(owner.id, (tx) => tx`
      insert into expenses (household_id, asset_id, category, description, amount_cents, incurred_on, created_by)
      values (${H.hid}, ${H.assetId}, 'servicing', 'Service', 4550, '2026-03-15', ${owner.id}),
             (${H.hid}, ${H.assetId}, 'servicing', 'Service', 4550, '2025-12-31', ${owner.id})`);
  });
  afterAll(() => sql.end());

  it("spending totals are computed by the database, exactly, for the requested period", async () => {
    const { run } = tool(owner.id, "spending");
    const year = await run({ from: "2026-01-01", to: "2026-12-31" });
    expect(year.total).toBe("$165.50"); // 120.00 repair + 45.50 servicing; the 31 Dec 2025 service is excluded
  });

  it("filters by item category and expense category", async () => {
    const { run } = tool(owner.id, "spending");
    const r = await run({ from: "2025-01-01", to: "2026-12-31", expense_category: "servicing", item_category: "washing_machine" });
    expect(r).toMatchObject({ total: "$91.00", number_of_expenses: 2 });
  });

  it("tools only see the caller’s household (RLS), even if asked for another", async () => {
    const items = await tool(outsider.id, "search_items", H.hid).run({});
    expect(items.count).toBe(0);
    const spend = await tool(outsider.id, "spending", H.hid).run({ from: "2000-01-01", to: "2100-01-01" });
    expect(spend.total).toBe("$0.00");
    const detail = await tool(outsider.id, "item_details", H.hid).run({ item_id: H.assetId });
    expect(detail.error).toMatch(/No item/);
  });

  it("links only records the tools returned and named in the answer; proposals create nothing", async () => {
    const provider: AiProvider = {
      name: "stub",
      extract: async () => { throw new Error("unused"); },
      async converse({ tools }) {
        const find = (n: string) => tools.find((t) => t.name === n)!;
        const items = JSON.parse(await find("search_items").run({ query: "washer" }));
        await find("propose_task").run({ title: "Clean filter", item_id: items.items[0].item_id, due_on: "2026-12-01", repeat_every: 1, repeat_unit: "month" });
        return { text: "Your Washer is due on 1 Dec. I also checked the Phantom Fridge, see /assets/not-real.", refused: false };
      },
    };
    const before = (await sql`select count(*)::int as n from maintenance_tasks where household_id = ${H.hid}`)[0].n;
    const answer = await answerQuestion({ provider, history: [{ role: "user", content: "When is the washer due?" }], ctx: ctxFor(owner.id) });
    expect(answer.references).toEqual([{ label: "Washer", href: `/assets/${H.assetId}`, kind: "item" }]);
    expect(answer.proposals).toEqual([{ title: "Clean filter", assetId: H.assetId, assetName: "Washer", dueOn: "2026-12-01", recurrenceInterval: 1, recurrenceUnit: "month" }]);
    expect((await sql`select count(*)::int as n from maintenance_tasks where household_id = ${H.hid}`)[0].n).toBe(before);
  });

  it("passes refusals through without text or links", async () => {
    const provider: AiProvider = { name: "stub", extract: async () => { throw new Error(); }, converse: async () => ({ text: "", refused: true }) };
    const a = await answerQuestion({ provider, history: [{ role: "user", content: "x" }], ctx: ctxFor(owner.id) });
    expect(a).toEqual({ text: "", references: [], proposals: [], refused: true });
  });

  it("selectReferences orders by mention and ignores unmentioned records", () => {
    const refs = [
      { label: "Fridge", href: "/assets/1", kind: "item" as const },
      { label: "Aircon", href: "/assets/2", kind: "item" as const },
      { label: "Expenses", href: "/expenses?x", kind: "expenses" as const },
    ];
    expect(selectReferences("The aircon and the fridge", refs).map((r) => r.href)).toEqual(["/assets/2", "/assets/1", "/expenses?x"]);
  });

  it("notifications are generated once per occurrence and only for the right person", async () => {
    const member = await createUser("Member");
    await sql`insert into household_members (household_id, user_id, role) values (${H.hid}, ${member.id}, 'member')`;
    await as(owner.id, (tx) => tx`
      insert into maintenance_tasks (household_id, title, due_on, created_by, assigned_to)
      values (${H.hid}, 'Assigned to member', '2026-10-01', ${owner.id}, ${member.id})`);
    // Seeded task "Clean filter" is due 2026-12-01 (not overdue); add an unassigned overdue one.
    await as(owner.id, (tx) => tx`insert into maintenance_tasks (household_id, title, due_on, created_by) values (${H.hid}, 'Unassigned overdue', '2026-11-01', ${owner.id})`);
    // Seeded warranty ends 2027-01-01 — within 60 days of TODAY.
    const args = { householdId: H.hid, userId: owner.id, today: TODAY, reminderDays: 60 };
    await as(owner.id, (tx) => syncNotifications(tx, args));
    await as(owner.id, (tx) => syncNotifications(tx, args));
    const mine = await as(owner.id, (tx) => listNotifications(tx, owner.id, H.hid));
    expect(mine.items.map((n) => n.title).sort()).toEqual(["Overdue: Unassigned overdue", "Warranty ending: Washer"]);
    expect(mine.unread).toBe(2);
    expect(mine.items.find((n) => n.kind === "warranty_expiring")?.link_path).toBe(`/assets/${H.assetId}`);
    // Members can't read someone else's notifications.
    expect(await as(member.id, (tx) => tx`select * from notifications where user_id = ${owner.id}`)).toHaveLength(0);
  });
});
