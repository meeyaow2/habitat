import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { finishExtraction, markExtractionApplied, startExtraction } from "@/features/ai/extraction-server";
import { ExtractionSchema } from "@/lib/ai/extraction";
import { UserFacingError } from "@/lib/server/errors";
import { as, createUser, rejects, seedHousehold, sql } from "./helpers";

const stubRaw = ExtractionSchema.parse({
  document_kind: "receipt",
  product_name: { value: "Washer", status: "extracted", evidence: "Washer", page: 1 },
  brand: { value: "LG", status: "extracted", evidence: "LG", page: 1 },
  model: { value: null, status: "missing", evidence: null, page: null },
  serial_number: { value: null, status: "missing", evidence: null, page: null },
  purchase_date: { value: "2026-10-07", status: "extracted", evidence: "07/10/2026", page: 1 },
  price: { value: "849.00", status: "extracted", evidence: "S$849.00", page: 1 },
  currency: { value: "SGD", status: "inferred", evidence: "S$", page: 1 },
  vendor: { value: null, status: "missing", evidence: null, page: null },
  warranty_months: { value: 24, status: "extracted", evidence: "2 years", page: 1 },
  warranty_expiry_date: { value: null, status: "missing", evidence: null, page: null },
  notes: null,
});

describe("AI extraction lifecycle (provider stubbed)", () => {
  let owner: { id: string }, outsider: { id: string };
  let H: Awaited<ReturnType<typeof seedHousehold>>;
  const actor = () => ({ householdId: H.hid, userId: owner.id });

  beforeAll(async () => {
    owner = await createUser("Owner");
    outsider = await createUser("Outsider");
    H = await seedHousehold(owner.id);
    await seedHousehold(outsider.id);
  });
  afterAll(() => sql.end());

  it("stores a normalised result, then links the document when applied", async () => {
    const { extractionId } = await as(owner.id, (tx) => startExtraction(tx, actor(), H.documentId));
    const row = await as(owner.id, (tx) => finishExtraction(tx, extractionId, { ok: true, raw: stubRaw, provider: "stub", model: "stub-1" }));
    expect(row.status).toBe("completed");
    expect(row.fields).toMatchObject({ priceCents: { value: 84900 }, warrantyExpiry: { value: "2028-10-07", status: "inferred" } });

    await sql`update documents set asset_id = null where id = ${H.documentId}`;
    await as(owner.id, (tx) => markExtractionApplied(tx, actor(), extractionId, H.assetId));
    expect((await sql`select asset_id from documents where id = ${H.documentId}`)[0].asset_id).toBe(H.assetId);
    expect((await sql`select status from document_extractions where id = ${extractionId}`)[0].status).toBe("applied");
    // Single use
    expect(await rejects(as(owner.id, (tx) => markExtractionApplied(tx, actor(), extractionId, H.assetId)))).toBeInstanceOf(UserFacingError);
  });

  it("records provider failures without data", async () => {
    const { extractionId } = await as(owner.id, (tx) => startExtraction(tx, actor(), H.documentId));
    const row = await as(owner.id, (tx) => finishExtraction(tx, extractionId, { ok: false, error: "The AI service declined to read this document.", provider: "stub" }));
    expect(row).toMatchObject({ status: "failed", fields: {} });
  });

  it("refuses unsupported formats before anything is sent", async () => {
    const [d] = await sql<{ id: string }[]>`
      insert into documents (household_id, kind, title, storage_path, mime_type, size_bytes, uploaded_by)
      values (${H.hid}, 'receipt', 'Photo', ${`${H.hid}/${randomUUID()}.heic`}, 'image/heic', 10, ${owner.id}) returning id`;
    const err = await rejects(as(owner.id, (tx) => startExtraction(tx, actor(), d.id)));
    expect(err.message).toMatch(/HEIC/);
  });

  it("another household cannot read the document or its extractions", async () => {
    const err = await rejects(as(outsider.id, (tx) => startExtraction(tx, { householdId: H.hid, userId: outsider.id }, H.documentId)));
    expect(err.message).toMatch(/no longer exists|row-level security/);
    expect(await as(outsider.id, (tx) => tx`select * from document_extractions`)).toHaveLength(0);
  });
});
