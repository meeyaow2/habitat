import "server-only";
import type { Tx } from "@/lib/db";
import { logActivity } from "@/lib/server/activity";
import { UserFacingError } from "@/lib/server/errors";
import { normaliseExtraction, type NormalisedExtraction, type RawExtraction } from "@/lib/ai/extraction";

export type ExtractionRow = { id: string; document_id: string; status: string; fields: NormalisedExtraction | Record<string, never>; error: string | null; model: string | null };

/** Step 1 (RLS): check the document is readable and record a pending extraction. */
export async function startExtraction(tx: Tx, a: { householdId: string; userId: string }, documentId: string) {
  const [doc] = await tx<{ storage_path: string; mime_type: string; original_filename: string | null; title: string }[]>`
    select storage_path, mime_type, original_filename, title from documents where id = ${documentId} and household_id = ${a.householdId}
  `;
  if (!doc) throw new UserFacingError("This document no longer exists.");
  if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(doc.mime_type)) {
    throw new UserFacingError("AI reading works with PDFs and JPG, PNG or WebP photos. Convert HEIC photos to JPG first.");
  }
  const [row] = await tx<{ id: string }[]>`
    insert into document_extractions (household_id, document_id, status, created_by)
    values (${a.householdId}, ${documentId}, 'pending', ${a.userId}) returning id
  `;
  return { extractionId: row.id, doc };
}

/** Step 2 (RLS): store the normalised result, or the failure reason. */
export async function finishExtraction(
  tx: Tx,
  extractionId: string,
  result: { ok: true; raw: RawExtraction; provider: string; model: string } | { ok: false; error: string; provider: string },
): Promise<ExtractionRow> {
  const [row] = result.ok
    ? await tx<ExtractionRow[]>`
        update document_extractions set status = 'completed', provider = ${result.provider}, model = ${result.model},
               fields = ${tx.json(normaliseExtraction(result.raw) as never)}, error = null
        where id = ${extractionId} returning id, document_id, status, fields, error, model`
    : await tx<ExtractionRow[]>`
        update document_extractions set status = 'failed', provider = ${result.provider}, error = ${result.error.slice(0, 300)}
        where id = ${extractionId} returning id, document_id, status, fields, error, model`;
  return row;
}

/** After the person reviews and saves: link the document and mark the extraction applied. */
export async function markExtractionApplied(tx: Tx, a: { householdId: string; userId: string }, extractionId: string, assetId: string) {
  const [ex] = await tx<{ document_id: string; status: string }[]>`
    select document_id, status from document_extractions where id = ${extractionId} and household_id = ${a.householdId}`;
  if (!ex) throw new UserFacingError("This AI result no longer exists.");
  if (ex.status !== "completed") throw new UserFacingError("This AI result has already been used or discarded.");
  await tx`update document_extractions set status = 'applied', applied_at = now() where id = ${extractionId}`;
  const [doc] = await tx<{ kind: string; title: string }[]>`
    update documents set asset_id = ${assetId} where id = ${ex.document_id} and household_id = ${a.householdId} returning kind, title`;
  if (doc && (doc.kind === "receipt" || doc.kind === "warranty")) {
    await tx`update warranties set document_id = ${ex.document_id}
             where id = (select id from warranties where asset_id = ${assetId} and document_id is null order by created_at limit 1)`;
  }
  await logActivity(tx, { householdId: a.householdId, actorId: a.userId, action: "document.ai_applied", entityType: "asset", entityId: assetId, summary: `saved details read from “${doc?.title ?? "a document"}” after review` });
}

export async function discardExtraction(tx: Tx, householdId: string, extractionId: string) {
  await tx`update document_extractions set status = 'discarded' where id = ${extractionId} and household_id = ${householdId} and status = 'completed'`;
}
