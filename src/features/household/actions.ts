"use server";

import { randomBytes } from "node:crypto";
import { hashToken, INVITE_DAYS } from "./tokens";
import { invitationEmail, sendEmail } from "@/lib/email";
import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { env } from "@/lib/env";
import { assertOwner, householdAction, type ActionResult } from "@/lib/server/action";
import { logActivity } from "@/lib/server/activity";
import { getAppContext } from "@/lib/server/context";
import { toUserMessage, UserFacingError } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/rate-limit";
import { householdSettingsSchema, id, inviteSchema, requiredText } from "@/lib/validation/schemas";


export const inviteMemberAction = householdAction(inviteSchema, async ({ input, tx, ctx }) => {
  assertOwner(ctx);
  if (ctx.profile.is_demo) throw new UserFacingError("Invitations are disabled in demo mode.");
  rateLimit(`invite:${ctx.user.id}`, 20, 60 * 60_000);
  // Replace any pending invite for the same address.
  await tx`update household_invitations set revoked_at = now()
           where household_id = ${ctx.household.id} and email = ${input.email} and accepted_at is null and revoked_at is null`;
  const token = randomBytes(32).toString("base64url");
  const [inv] = await tx<{ id: string; expires_at: Date }[]>`
    insert into household_invitations (household_id, email, role, token_hash, invited_by, expires_at)
    values (${ctx.household.id}, ${input.email}, ${input.role}, ${hashToken(token)}, ${ctx.user.id}, now() + ${`${INVITE_DAYS} days`}::interval)
    returning id, expires_at
  `;
  await logActivity(tx, { householdId: ctx.household.id, actorId: ctx.user.id, action: "member.invited", entityType: "invitation", entityId: inv.id, summary: `invited ${input.email} as ${input.role}` });
  const url = `${env.appUrl}/invite/${token}`;
  const emailed = await sendEmail(
    invitationEmail({ to: input.email, household: ctx.household.name, inviter: ctx.profile.display_name || "A household owner", url, days: INVITE_DAYS }),
  ).catch(() => false);
  refresh();
  // The raw token is shown once to the owner and never stored.
  return { url, email: input.email, emailed };
}, "member.invite");

export const revokeInvitationAction = householdAction(z.object({ id }), async ({ input, tx, ctx }) => {
  assertOwner(ctx);
  const [inv] = await tx<{ email: string }[]>`
    update household_invitations set revoked_at = now()
    where id = ${input.id} and household_id = ${ctx.household.id} and accepted_at is null and revoked_at is null
    returning email
  `;
  if (!inv) throw new UserFacingError("This invitation is no longer pending.");
  await logActivity(tx, { householdId: ctx.household.id, actorId: ctx.user.id, action: "member.invite_revoked", entityType: "invitation", entityId: input.id, summary: `revoked the invitation for ${inv.email}` });
  refresh();
}, "member.revoke");

export const changeRoleAction = householdAction(z.object({ userId: id, role: z.enum(["owner", "member"]) }), async ({ input, tx, ctx }) => {
  assertOwner(ctx);
  const [m] = await tx<{ display_name: string }[]>`
    update household_members set role = ${input.role}
    from profiles p
    where household_members.household_id = ${ctx.household.id} and household_members.user_id = ${input.userId} and p.id = household_members.user_id
    returning p.display_name
  `;
  if (!m) throw new UserFacingError("That person isn’t a member any more.");
  await logActivity(tx, { householdId: ctx.household.id, actorId: ctx.user.id, action: "member.role", entityType: "member", entityId: input.userId, summary: `made ${m.display_name || "a member"} ${input.role === "owner" ? "an owner" : "a member"}` });
  refresh();
}, "member.role");

export const removeMemberAction = householdAction(z.object({ userId: id }), async ({ input, tx, ctx }) => {
  assertOwner(ctx);
  if (input.userId === ctx.user.id) throw new UserFacingError("Use “Leave household” to remove yourself.");
  const [name] = await tx<{ display_name: string }[]>`select display_name from profiles where id = ${input.userId}`;
  const res = await tx`delete from household_members where household_id = ${ctx.household.id} and user_id = ${input.userId}`;
  if (res.count === 0) throw new UserFacingError("That person isn’t a member any more.");
  await logActivity(tx, { householdId: ctx.household.id, actorId: ctx.user.id, action: "member.removed", entityType: "member", entityId: input.userId, summary: `removed ${name?.display_name || "a member"} from the household` });
  refresh();
}, "member.remove");

export async function leaveHouseholdAction(): Promise<ActionResult> {
  const ctx = await getAppContext();
  if (!ctx?.household) return { ok: false, error: "No household to leave." };
  try {
    await withUser(ctx.user.id, async (tx) => {
      const [{ others }] = await tx<{ others: number }[]>`select count(*)::int as others from household_members where household_id = ${ctx.household!.id} and user_id <> ${ctx.user.id}`;
      if (others === 0) throw new UserFacingError("You’re the only member. Delete the household from Settings instead.");
      await logActivity(tx, { householdId: ctx.household!.id, actorId: ctx.user.id, action: "member.left", entityType: "member", entityId: ctx.user.id, summary: "left the household" });
      await tx`delete from household_members where household_id = ${ctx.household!.id} and user_id = ${ctx.user.id}`;
      await tx`update profiles set active_household_id = null where id = ${ctx.user.id}`;
    });
  } catch (err) {
    return { ok: false, error: toUserMessage(err, "member.leave") };
  }
  redirect("/overview");
}

export async function acceptInvitationAction(token: string): Promise<ActionResult> {
  const ctx = await getAppContext();
  if (!ctx) return { ok: false, error: "Please sign in first." };
  try {
    rateLimit(`accept:${ctx.user.id}`, 10, 10 * 60_000);
    await withUser(ctx.user.id, (tx) => tx`select public.accept_invitation(${hashToken(token)})`);
  } catch (err) {
    return { ok: false, error: toUserMessage(err, "member.accept") };
  }
  redirect("/overview");
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------
export const updateHouseholdAction = householdAction(householdSettingsSchema, async ({ input, tx, ctx }) => {
  assertOwner(ctx);
  await tx`update households set name = ${input.name}, warranty_reminder_days = ${input.warrantyReminderDays} where id = ${ctx.household.id}`;
  refresh();
}, "household.update");

export const updateProfileAction = householdAction(
  z.object({ displayName: requiredText(80, "Name"), avatarColor: z.enum(["sage", "slate", "clay", "sand", "teal", "plum"]) }),
  async ({ input, tx, ctx }) => {
    await tx`update profiles set display_name = ${input.displayName}, avatar_color = ${input.avatarColor} where id = ${ctx.user.id}`;
    refresh();
  },
  "profile.update",
);

export const setEmailRemindersAction = householdAction(z.object({ enabled: z.boolean() }), async ({ input, tx, ctx }) => {
  await tx`update profiles set email_reminders = ${input.enabled} where id = ${ctx.user.id}`;
  refresh();
}, "profile.email-reminders");

export const setAiConsentAction = householdAction(z.object({ consent: z.boolean() }), async ({ input, tx, ctx }) => {
  await tx`update profiles set ai_consent_at = ${input.consent ? tx`now()` : null} where id = ${ctx.user.id}`;
  refresh();
}, "profile.ai-consent");

export async function deleteAccountAction(confirmation: string): Promise<ActionResult> {
  const ctx = await getAppContext();
  if (!ctx) return { ok: false, error: "Please sign in again." };
  if (confirmation !== "DELETE") return { ok: false, error: "Type DELETE to confirm." };
  try {
    // Block if the user is the last owner of a household that still has other members.
    const blocking = await withUser(ctx.user.id, (tx) => tx<{ name: string }[]>`
      select h.name from households h join household_members me on me.household_id = h.id and me.user_id = ${ctx.user.id} and me.role = 'owner'
      where not exists (select 1 from household_members o where o.household_id = h.id and o.user_id <> ${ctx.user.id} and o.role = 'owner')
        and exists (select 1 from household_members o where o.household_id = h.id and o.user_id <> ${ctx.user.id})
    `);
    if (blocking.length) {
      throw new UserFacingError(`Make someone else an owner of “${blocking[0].name}” first, or remove its other members.`);
    }
    // Removing the auth user cascades to the profile and memberships; households
    // with no remaining members are deleted by the delete_orphaned_household trigger.
    // Their files are removed from storage below, before the rows disappear.
    const { adminSql } = await import("@/lib/db");
    const { storage } = await import("@/lib/storage");
    const soleHouseholds = await adminSql()<{ storage_path: string }[]>`
      select d.storage_path from documents d
      where d.household_id in (
        select household_id from household_members where user_id = ${ctx.user.id}
        except select household_id from household_members where user_id <> ${ctx.user.id}
      )
    `;
    for (const d of soleHouseholds) await storage().remove(d.storage_path).catch(() => {});
    await auth.deleteUser(ctx.user.id);
  } catch (err) {
    return { ok: false, error: toUserMessage(err, "account.delete") };
  }
  redirect("/?deleted=1");
}
