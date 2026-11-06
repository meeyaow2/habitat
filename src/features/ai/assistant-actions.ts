"use server";

import { z } from "zod";
import { withUser } from "@/lib/db";
import { anthropicProvider } from "@/lib/ai/anthropic";
import { AI_NOT_CONFIGURED, aiConfigured } from "@/lib/ai/config";
import type { ActionResult } from "@/lib/server/action";
import { getAppContext } from "@/lib/server/context";
import { toUserMessage } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/rate-limit";
import { answerQuestion, type AssistantAnswer } from "./assistant";

const historySchema = z
  .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().trim().min(1).max(4000) }))
  .min(1)
  .max(20)
  .refine((h) => h[0].role === "user" && h[h.length - 1].role === "user", { error: "Invalid conversation." });

/**
 * Ask Habitat. The conversation lives only in the browser; each question
 * sends it here, the server answers from RLS-scoped records, and nothing is
 * stored. Requires a configured provider and the person's AI consent.
 */
export async function askHabitatAction(history: unknown): Promise<ActionResult<AssistantAnswer>> {
  const ctx = await getAppContext();
  if (!ctx?.household) return { ok: false, error: "Please sign in again." };
  if (!aiConfigured()) return { ok: false, error: AI_NOT_CONFIGURED };
  if (!ctx.profile.ai_consent_at) return { ok: false, error: "Turn on AI features first. Your household records are only sent to the AI provider once you agree." };
  const parsed = historySchema.safeParse(history);
  if (!parsed.success) return { ok: false, error: "That question is too long. Try a shorter one." };
  try {
    rateLimit(`ask:${ctx.user.id}`, 40, 60 * 60_000);
    const userId = ctx.user.id;
    const answer = await answerQuestion({
      provider: anthropicProvider,
      history: parsed.data,
      ctx: {
        householdId: ctx.household.id,
        householdName: ctx.household.name,
        today: ctx.today,
        currency: ctx.household.currency,
        reminderDays: ctx.household.warranty_reminder_days,
        run: (fn) => withUser(userId, fn),
      },
    });
    return { ok: true, data: answer };
  } catch (err) {
    console.error("[habitat:ask] failed", (err as Error)?.name);
    return { ok: false, error: toUserMessage(err, "ask") === "Something went wrong on our side. Your changes weren’t saved — please try again." ? "Ask Habitat couldn’t answer just now. Please try again in a moment." : toUserMessage(err, "ask") };
  }
}
