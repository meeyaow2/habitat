import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { as, createUser, rejects, seedHousehold, sql } from "./helpers";

const newToken = () => {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: createHash("sha256").update(token).digest("hex") };
};

describe("household roles and invitations (journey 13)", () => {
  let owner: { id: string; email: string }, member: { id: string; email: string }, stranger: { id: string; email: string };
  let H: Awaited<ReturnType<typeof seedHousehold>>;

  const invite = async (email: string, opts: { expired?: boolean; role?: string } = {}) => {
    const t = newToken();
    await as(owner.id, (tx) => tx`
      insert into household_invitations (household_id, email, role, token_hash, invited_by, expires_at)
      values (${H.hid}, ${email}, ${opts.role ?? "member"}, ${t.hash}, ${owner.id}, ${opts.expired ? sql`now() - interval '1 minute'` : sql`now() + interval '7 days'`})`);
    return t;
  };

  beforeAll(async () => {
    owner = await createUser("Owner");
    member = await createUser("Member");
    stranger = await createUser("Stranger");
    H = await seedHousehold(owner.id);
  });
  afterAll(() => sql.end());

  it("rejects an invitation accepted by a different email address", async () => {
    const t = await invite(member.email);
    const err = await rejects(as(stranger.id, (tx) => tx`select public.accept_invitation(${t.hash})`));
    expect(err.hint).toBe("invitation_email_mismatch");
    // Accept properly so later tests have a member; then it cannot be reused.
    await as(member.id, (tx) => tx`select public.accept_invitation(${t.hash})`);
    const reuse = await rejects(as(member.id, (tx) => tx`select public.accept_invitation(${t.hash})`));
    expect(reuse.hint).toBe("invitation_used");
  });

  it("rejects expired and revoked invitations, and unknown tokens", async () => {
    const expired = await invite(stranger.email, { expired: true });
    expect((await rejects(as(stranger.id, (tx) => tx`select public.accept_invitation(${expired.hash})`))).hint).toBe("invitation_expired");
    await as(owner.id, (tx) => tx`update household_invitations set revoked_at = now() where token_hash = ${expired.hash}`);
    const revoked = await invite(stranger.email);
    await as(owner.id, (tx) => tx`update household_invitations set revoked_at = now() where token_hash = ${revoked.hash}`);
    expect((await rejects(as(stranger.id, (tx) => tx`select public.accept_invitation(${revoked.hash})`))).hint).toBe("invitation_revoked");
    expect((await rejects(as(stranger.id, (tx) => tx`select public.accept_invitation(${"f".repeat(64)})`))).hint).toBe("invitation_not_found");
  });

  it("members read shared records but not invitations", async () => {
    await as(member.id, async (tx) => {
      expect(await tx`select id from assets where id = ${H.assetId}`).toHaveLength(1);
      expect(await tx`select id from documents where id = ${H.documentId}`).toHaveLength(1);
      expect(await tx`select id from household_invitations`).toHaveLength(0);
    });
  });

  it("members can add and edit items and the floor plan", async () => {
    await as(member.id, async (tx) => {
      const [a] = await tx`insert into assets (household_id, category_id, name, created_by) values (${H.hid}, 'fan', 'Fan', ${member.id}) returning id`;
      expect((await tx`update assets set name = 'Washer (LG)' where id = ${H.assetId}`).count).toBe(1);
      expect((await tx`update rooms set width = 320 where id = ${H.roomId}`).count).toBe(1);
      // Delete: own items yes, other people's items no.
      expect((await tx`delete from assets where id = ${H.assetId}`).count).toBe(0);
      expect((await tx`delete from assets where id = ${a.id}`).count).toBe(1);
    });
  });

  it("members cannot manage the household, property, members or invitations", async () => {
    await as(member.id, async (tx) => {
      expect((await tx`update households set name = 'Mine now' where id = ${H.hid}`).count).toBe(0);
      expect((await tx`update properties set name = 'x' where id = ${H.propertyId}`).count).toBe(0);
      expect((await tx`update household_members set role = 'owner' where user_id = ${member.id}`).count).toBe(0);
      expect((await tx`delete from household_members where user_id = ${owner.id}`).count).toBe(0);
    });
    const err = await rejects(as(member.id, (tx) => tx`insert into household_invitations (household_id, email, token_hash, invited_by, expires_at) values (${H.hid}, 'friend@x.co', ${"b".repeat(64)}, ${member.id}, now() + interval '1 day')`));
    expect(err.message).toMatch(/row-level security/);
  });

  it("members update tasks they own or are assigned, not others", async () => {
    await as(member.id, async (tx) => {
      expect((await tx`update maintenance_tasks set title = 'x' where id = ${H.taskId}`).count).toBe(0);
    });
    await as(owner.id, (tx) => tx`update maintenance_tasks set assigned_to = ${member.id} where id = ${H.taskId}`);
    await as(member.id, async (tx) => {
      expect((await tx`update maintenance_tasks set title = 'Clean filter (done by M)' where id = ${H.taskId}`).count).toBe(1);
    });
  });

  it("tasks can only be assigned to household members", async () => {
    const err = await rejects(as(owner.id, (tx) => tx`update maintenance_tasks set assigned_to = ${stranger.id} where id = ${H.taskId}`));
    expect(err.code).toBe("23503");
  });

  it("protects the last owner and allows transfer", async () => {
    const err = await rejects(as(owner.id, (tx) => tx`update household_members set role = 'member' where user_id = ${owner.id} and household_id = ${H.hid}`));
    expect(err.hint).toBe("last_owner");
    await as(owner.id, (tx) => tx`update household_members set role = 'owner' where user_id = ${member.id} and household_id = ${H.hid}`);
    await as(owner.id, (tx) => tx`update household_members set role = 'member' where user_id = ${owner.id} and household_id = ${H.hid}`);
    const [r] = await sql`select role from household_members where user_id = ${owner.id} and household_id = ${H.hid}`;
    expect(r.role).toBe("member");
  });

  it("deletes a household automatically when its last member leaves", async () => {
    const solo = await createUser("Solo");
    const S = await seedHousehold(solo.id, "Solo home");
    await as(solo.id, (tx) => tx`delete from household_members where user_id = ${solo.id}`);
    expect(await sql`select 1 from households where id = ${S.hid}`).toHaveLength(0);
    expect(await sql`select 1 from assets where household_id = ${S.hid}`).toHaveLength(0);
  });
});
