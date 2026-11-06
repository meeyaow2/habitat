"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { householdAction } from "@/lib/server/action";
import { logActivity } from "@/lib/server/activity";
import { UserFacingError } from "@/lib/server/errors";
import { storage } from "@/lib/storage";
import { id, optionalDate, optionalText } from "@/lib/validation/schemas";

/** Short-lived signed URL, issued only after an RLS-checked read of the row. */
export const getDocumentUrlAction = householdAction(z.object({ id, download: z.boolean().default(false) }), async ({ input, tx, ctx }) => {
  const [doc] = await tx<{ storage_path: string; mime_type: string; title: string; original_filename: string | null }[]>`
    select storage_path, mime_type, title, original_filename from documents where id = ${input.id} and household_id = ${ctx.household.id}
  `;
  if (!doc) throw new UserFacingError("This document no longer exists.");
  const ext = doc.storage_path.split(".").pop();
  const url = await storage().signedUrl(doc.storage_path, {
    expiresIn: 300,
    contentType: doc.mime_type,
    downloadName: input.download ? doc.original_filename ?? `${doc.title}.${ext}` : undefined,
  });
  return { url, mime: doc.mime_type };
}, "document.url");

export const updateDocumentAction = householdAction(
  z.object({
    id,
    title: z.string().trim().min(1, { error: "Give the document a title." }).max(160),
    kind: z.enum(["receipt", "manual", "warranty", "invoice", "repair_report", "renovation", "other"]),
    assetId: id.nullable(),
    documentDate: optionalDate,
    notes: optionalText(4000),
  }),
  async ({ input, tx, ctx }) => {
    if (input.assetId) {
      const [a] = await tx`select 1 from assets where id = ${input.assetId} and household_id = ${ctx.household.id}`;
      if (!a) throw new UserFacingError("That item no longer exists.", "assetId");
    }
    const res = await tx`
      update documents set title = ${input.title}, kind = ${input.kind}, asset_id = ${input.assetId},
             document_date = ${input.documentDate}, notes = ${input.notes}
      where id = ${input.id} and household_id = ${ctx.household.id}
    `;
    if (res.count === 0) throw new UserFacingError("This document no longer exists.");
    refresh();
  },
  "document.update",
);

export const deleteDocumentAction = householdAction(z.object({ id }), async ({ input, tx, ctx }) => {
  const [doc] = await tx<{ storage_path: string; title: string }[]>`
    delete from documents where id = ${input.id} and household_id = ${ctx.household.id} returning storage_path, title
  `;
  if (!doc) throw new UserFacingError("Only the person who uploaded this or an owner can delete it.");
  await logActivity(tx, { householdId: ctx.household.id, actorId: ctx.user.id, action: "document.deleted", entityType: "document", entityId: null, summary: `deleted “${doc.title}”` });
  // Row is gone inside this transaction; remove the file. If removal fails the
  // transaction rolls back so the record and file never drift apart.
  await storage().remove(doc.storage_path);
  refresh();
}, "document.delete");
