import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { runReminderJob } from "@/features/notifications/job";
import type { Email } from "@/lib/email";
import { as, createUser, seedHousehold, sql } from "./helpers";

describe("daily reminder job", () => {
  let owner: { id: string; email: string }, member: { id: string; email: string };
  let H: Awaited<ReturnType<typeof seedHousehold>>;
  const sent: Email[] = [];
  const run = (deliver = true) =>
    runReminderJob({ admin: sql, runAs: (u, fn) => as(u, fn), send: async (e) => (sent.push(e), deliver), appUrl: "https://habitat.test", now: new Date("2026-11-06T04:00:00Z") });

  beforeAll(async () => {
    owner = await createUser("Owner");
    member = await createUser("Member");
    H = await seedHousehold(owner.id);
    await sql`insert into household_members (household_id, user_id, role) values (${H.hid}, ${member.id}, 'member')`;
    await sql`update profiles set email_reminders = false where id = ${member.id}`;
    await as(owner.id, (tx) => tx`insert into maintenance_tasks (household_id, title, due_on, created_by) values (${H.hid}, 'Unassigned overdue', '2026-11-01', ${owner.id})`);
  });
  afterAll(() => sql.end());

  it("creates reminders for every member and emails only opted-in people, once", async () => {
    const first = await run();
    expect(first.generated).toBeGreaterThanOrEqual(4); // overdue + warranty, for both people (plus other test households)
    const mine = sent.filter((e) => e.to === owner.email);
    expect(mine).toHaveLength(1);
    expect(mine[0].text).toContain("Overdue: Unassigned overdue");
    expect(mine[0].text).toContain("Warranty ending: Washer");
    expect(mine[0].html).toContain("https://habitat.test/maintenance?task=");
    expect(sent.some((e) => e.to === member.email)).toBe(false);
    expect((await sql`select count(*)::int as n from notifications where user_id = ${member.id}`)[0].n).toBe(2);

    sent.length = 0;
    const second = await run();
    expect(second.generated).toBe(0);
    expect(sent.filter((e) => e.to === owner.email)).toHaveLength(0);
  });

  it("does not mark reminders emailed when delivery fails", async () => {
    await as(owner.id, (tx) => tx`insert into maintenance_tasks (household_id, title, due_on, created_by) values (${H.hid}, 'Another overdue', '2026-10-20', ${owner.id})`);
    await run(false);
    const [n] = await sql`select emailed_at from notifications where user_id = ${owner.id} and title = 'Overdue: Another overdue'`;
    expect(n.emailed_at).toBeNull();
  });
});
