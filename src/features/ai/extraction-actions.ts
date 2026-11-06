"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { withUser } from "@/lib/db";
import { anthropicProvider } from "@/lib/ai/anthropic";
import { AI_NOT_CONFIGURED, aiConfigured } from "@/lib/ai/config";
import { householdAction, type ActionResult } from "@/lib/server/action";
import { getAppContext } from "@/lib/server/context";
import { toUserMessage, UserFacingError } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/rate-limit";
import { storage } from "@/lib/storage";
import { assetSchema, id } from "@/lib/validation/schemas";
import { createAsset, updateAsset } from "@/features/assets/server";
import { discardExtraction, finishExtraction, markExtractionApplied, startExtraction, type ExtractionRow } from "./extraction-server";

/**
 * Read a document with AI. Requires: a configured provider and the person’s
 * explicit consent (Settings → AI features). The result is only a proposal —
 * nothing is saved to the household’s records until it has been reviewed.
 */
export async function extractDocumentAction(documentId: string): Promise<ActionResult<ExtractionRow>> {
  const provider = anthropicProvider;
  const ctx = await getAppContext();
  if (!ctx?.household) return { ok: false, error: "Please sign in again." };
  if (!aiConfigured()) return { ok: false, error: AI_NOT_CONFIGURED };
  if (!ctx.profile.ai_consent_at) {
    return { ok: false, error: "Turn on AI features in Settings first. Your document is only sent to the AI provider once you agree." };
  }
  if (!z.guid().safeParse(documentId).success) return { ok: false, error: "Invalid document." };
  const actor = { householdId: ctx.household.id, userId: ctx.user.id };
  try {
    rateLimit(`ai-extract:${ctx.user.id}`, 20, 60 * 60_000);
    const { extractionId, doc } = await withUser(ctx.user.id, (tx) => startExtraction(tx, actor, documentId));
    let result: Parameters<typeof finishExtraction>[2];
    try {
      const bytes = await storage().get(doc.storage_path);
      const out = await provider.extract({ bytes, mime: doc.mime_type, filename: doc.original_filename });
      result = { ok: true, raw: out.raw, provider: provider.name, model: out.model };
    } catch (err) {
      const code = (err as Error)?.message;
      console.error("[habitat:ai.extract] provider error", code?.slice(0, 40));
      result = {
        ok: false,
        provider: provider.name,
        error: code === "refused" ? "The AI service declined to read this document." : code === "unparseable" ? "The AI couldn’t produce a reliable reading of this document." : "The AI service is unavailable right now.",
      };
    }
    const row = await withUser(ctx.user.id, (tx) => finishExtraction(tx, extractionId, result));
    if (row.status === "failed") return { ok: false, error: `${row.error} You can still enter the details yourself.` };
    return { ok: true, data: row };
  } catch (err) {
    return { ok: false, error: toUserMessage(err, "ai.extract") };
  }
}

const applySchema = z.object({ extractionId: id, assetId: id.nullable(), data: assetSchema });

/** Save the reviewed values through the normal asset paths, then link the document. */
export const applyExtractionAction = householdAction(applySchema, async ({ input, tx, ctx }) => {
  const actor = { householdId: ctx.household.id, userId: ctx.user.id, currency: ctx.household.currency };
  let assetId = input.assetId;
  if (assetId) {
    await updateAsset(tx, actor, assetId, input.data);
  } else {
    assetId = await createAsset(tx, actor, input.data);
  }
  if (!assetId) throw new UserFacingError("Couldn’t save this item.");
  await markExtractionApplied(tx, actor, input.extractionId, assetId);
  refresh();
  return { assetId };
}, "ai.apply");

export const discardExtractionAction = householdAction(z.object({ extractionId: id }), async ({ input, tx, ctx }) => {
  await discardExtraction(tx, ctx.household.id, input.extractionId);
}, "ai.discard");
