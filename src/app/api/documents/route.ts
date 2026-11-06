import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/db";
import { logActivity } from "@/lib/server/activity";
import { getAppContext } from "@/lib/server/context";
import { toUserMessage, UserFacingError } from "@/lib/server/errors";
import { rateLimit } from "@/lib/server/rate-limit";
import { MAX_UPLOAD_BYTES, sniffType, storage } from "@/lib/storage";
import { optionalDate } from "@/lib/validation/schemas";

const metaSchema = z.object({
  title: z.string().trim().min(1).max(160),
  kind: z.enum(["receipt", "manual", "warranty", "invoice", "repair_report", "renovation", "other"]),
  assetId: z.guid().nullable(),
  documentDate: optionalDate,
});

export async function POST(req: NextRequest) {
  const ctx = await getAppContext();
  if (!ctx?.household) return NextResponse.json({ error: "Please sign in again." }, { status: 401 });
  try {
    rateLimit(`upload:${ctx.user.id}`, 30, 10 * 60_000);
    const len = Number(req.headers.get("content-length") ?? 0);
    if (len > MAX_UPLOAD_BYTES + 64 * 1024) throw new UserFacingError("Files must be 20 MB or smaller.");

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new UserFacingError("Choose a file to upload.");
    if (file.size === 0) throw new UserFacingError("That file is empty.");
    if (file.size > MAX_UPLOAD_BYTES) throw new UserFacingError("Files must be 20 MB or smaller.");

    const bytes = new Uint8Array(await file.arrayBuffer());
    const type = sniffType(bytes);
    if (!type) throw new UserFacingError("Upload a PDF, JPG, PNG, WebP or HEIC file.");

    const meta = metaSchema.safeParse({
      title: String(form.get("title") || file.name.replace(/\.[^.]+$/, "")).slice(0, 160),
      kind: form.get("kind") || "other",
      assetId: form.get("assetId") || null,
      documentDate: form.get("documentDate") || null,
    });
    if (!meta.success) throw new UserFacingError("Some document details aren’t valid.");
    const m = meta.data;
    const householdId = ctx.household.id;

    const doc = await withUser(ctx.user.id, async (tx) => {
      if (m.assetId) {
        const [a] = await tx`select 1 from assets where id = ${m.assetId} and household_id = ${householdId}`;
        if (!a) throw new UserFacingError("That item no longer exists.");
      }
      const storagePath = `${householdId}/${randomUUID()}.${type.ext}`;
      const [row] = await tx<{ id: string }[]>`
        insert into documents (household_id, asset_id, kind, title, storage_path, mime_type, size_bytes, original_filename, document_date, uploaded_by)
        values (${householdId}, ${m.assetId}, ${m.kind}, ${m.title}, ${storagePath}, ${type.mime}, ${bytes.byteLength},
                ${file.name.slice(0, 255)}, ${m.documentDate}, ${ctx.user.id})
        returning id
      `;
      // Proof of purchase / warranty card becomes the asset's warranty evidence.
      if (m.assetId && (m.kind === "receipt" || m.kind === "warranty")) {
        await tx`update warranties set document_id = ${row.id}
                 where id = (select id from warranties where asset_id = ${m.assetId} and document_id is null order by created_at limit 1)`;
      }
      await logActivity(tx, { householdId, actorId: ctx.user.id, action: "document.uploaded", entityType: "document", entityId: row.id, summary: `uploaded “${m.title}”` });
      // Upload inside the transaction: if storage fails, the row is rolled back.
      await storage().put(storagePath, bytes, type.mime);
      return row;
    });
    return NextResponse.json({ id: doc.id });
  } catch (err) {
    return NextResponse.json({ error: toUserMessage(err, "document.upload") }, { status: err instanceof UserFacingError ? 400 : 500 });
  }
}
