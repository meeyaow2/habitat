"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { withUser } from "@/lib/db";
import { getAppContext } from "@/lib/server/context";
import { flattenIssues, type ActionResult } from "@/lib/server/action";
import { toUserMessage, UserFacingError } from "@/lib/server/errors";
import { assetSchema, createHomeSchema } from "@/lib/validation/schemas";
import { applyTemplate, createProperty, getPrimaryProperty } from "@/features/home/server";
import { createAsset } from "@/features/assets/server";
import { getTemplate, type TemplateKey } from "@/features/home/templates";

const STEPS = ["welcome", "home", "layout", "appliance", "explore", "done"] as const;
type Step = (typeof STEPS)[number];

async function requireUser() {
  const ctx = await getAppContext();
  if (!ctx) redirect("/sign-in");
  return ctx;
}

export async function setOnboardingStep(step: Step): Promise<void> {
  const ctx = await requireUser();
  if (!STEPS.includes(step)) return;
  await withUser(ctx.user.id, (tx) =>
    step === "done"
      ? tx`update profiles set onboarding_step = 'done', onboarding_completed_at = now() where id = ${ctx.user.id}`
      : tx`update profiles set onboarding_step = ${step} where id = ${ctx.user.id}`,
  );
}

export async function createHomeAction(raw: unknown): Promise<ActionResult<{ propertyId: string }>> {
  const ctx = await requireUser();
  const parsed = createHomeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please check the highlighted fields.", fieldErrors: flattenIssues(parsed.error) };
  const input = parsed.data;
  try {
    const propertyId = await withUser(ctx.user.id, async (tx) => {
      let householdId = ctx.household?.id ?? null;
      if (householdId && ctx.role === "owner") {
        // Re-running this step updates the existing home rather than creating a duplicate.
        await tx`update households set name = ${input.householdName} where id = ${householdId}`;
        const existing = await getPrimaryProperty(tx, householdId);
        if (existing) {
          await tx`update properties set name = ${input.propertyName}, property_type = ${input.propertyType},
                     hdb_flat_type = ${input.hdbFlatType} where id = ${existing.id}`;
          await tx`update profiles set onboarding_step = 'layout' where id = ${ctx.user.id}`;
          return existing.id;
        }
      } else {
        const [row] = await tx<{ id: string }[]>`select public.create_household(${input.householdName}, 'SGD', 'en-SG') as id`;
        householdId = row.id;
      }
      const id = await createProperty(tx, householdId!, {
        name: input.propertyName,
        propertyType: input.propertyType,
        hdbFlatType: input.hdbFlatType,
      });
      await tx`update profiles set onboarding_step = 'layout' where id = ${ctx.user.id}`;
      return id;
    });
    return { ok: true, data: { propertyId } };
  } catch (err) {
    return { ok: false, error: toUserMessage(err, "onboarding.home") };
  }
}

const layoutSchema = z.object({ templateKey: z.string().max(40) });

export async function applyLayoutAction(raw: unknown): Promise<ActionResult> {
  const ctx = await requireUser();
  const parsed = layoutSchema.safeParse(raw);
  if (!parsed.success || !getTemplate(parsed.data.templateKey)) return { ok: false, error: "Choose a layout to continue." };
  if (!ctx.household) return { ok: false, error: "Create your home first." };
  try {
    await withUser(ctx.user.id, async (tx) => {
      const property = await getPrimaryProperty(tx, ctx.household!.id);
      if (!property) throw new UserFacingError("Create your home first.");
      await applyTemplate(tx, ctx.household!.id, property.id, parsed.data.templateKey as TemplateKey);
      await tx`update profiles set onboarding_step = 'appliance' where id = ${ctx.user.id}`;
    });
    return { ok: true, data: undefined };
  } catch (err) {
    return { ok: false, error: toUserMessage(err, "onboarding.layout") };
  }
}

export async function addFirstApplianceAction(raw: unknown): Promise<ActionResult<{ assetId: string }>> {
  const ctx = await requireUser();
  if (!ctx.household) return { ok: false, error: "Create your home first." };
  const parsed = assetSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "Please check the highlighted fields.", fieldErrors: flattenIssues(parsed.error) };
  try {
    const assetId = await withUser(ctx.user.id, async (tx) => {
      const id = await createAsset(tx, { householdId: ctx.household!.id, userId: ctx.user.id, currency: ctx.household!.currency }, parsed.data);
      await tx`update profiles set onboarding_step = 'explore' where id = ${ctx.user.id}`;
      return id;
    });
    return { ok: true, data: { assetId } };
  } catch (err) {
    return { ok: false, error: toUserMessage(err, "onboarding.asset") };
  }
}

export async function finishOnboardingAction(): Promise<void> {
  await setOnboardingStep("done");
  redirect("/home?welcome=1");
}
