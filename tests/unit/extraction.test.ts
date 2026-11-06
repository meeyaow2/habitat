import { describe, expect, it } from "vitest";
import { ExtractionSchema, normaliseExtraction, type RawExtraction } from "@/lib/ai/extraction";

const f = <T,>(value: T | null, status: RawExtraction["brand"]["status"] = "extracted", evidence: string | null = value === null ? null : String(value), page: number | null = 1) => ({ value, status, evidence, page });

const raw = (over: Partial<RawExtraction> = {}): RawExtraction =>
  ExtractionSchema.parse({
    document_kind: "receipt",
    product_name: f("LG 9kg Front Load Washer"),
    brand: f("LG"),
    model: f("FV1409S4W"),
    serial_number: f(null, "missing"),
    purchase_date: f("2026-10-07", "extracted", "07/10/2026"),
    price: f("849.00", "extracted", "TOTAL S$849.00"),
    currency: f("SGD", "inferred", "S$"),
    vendor: f("Harvey Norman"),
    warranty_months: f(24, "extracted", "2 years manufacturer warranty"),
    warranty_expiry_date: f(null, "missing"),
    notes: null,
    ...over,
  });

describe("normaliseExtraction", () => {
  it("keeps extracted values with evidence and converts price to cents", () => {
    const n = normaliseExtraction(raw());
    expect(n.brand).toMatchObject({ value: "LG", status: "extracted", evidence: "LG" });
    expect(n.priceCents).toMatchObject({ value: 84900, status: "extracted" });
    expect(n.currency).toMatchObject({ value: "SGD", status: "inferred" });
    expect(n.serialNumber).toMatchObject({ value: null, status: "missing" });
  });

  it("computes warranty expiry deterministically and labels it inferred", () => {
    const n = normaliseExtraction(raw());
    expect(n.warrantyExpiry).toMatchObject({ value: "2028-10-07", status: "inferred" });
    expect(n.warrantyExpiry.note).toMatch(/24 months/);
  });

  it("prefers a printed expiry date over a calculated one", () => {
    const n = normaliseExtraction(raw({ warranty_expiry_date: f("2028-12-31", "extracted", "Valid until 31 Dec 2028") }));
    expect(n.warrantyExpiry).toMatchObject({ value: "2028-12-31", status: "extracted" });
  });

  it("downgrades values that have no supporting evidence", () => {
    const n = normaliseExtraction(raw({ model: f("XYZ-123", "extracted", null) }));
    expect(n.model.status).toBe("uncertain");
    expect(n.model.note).toMatch(/No supporting text/);
  });

  it("rejects invalid dates and prices instead of passing them through", () => {
    const n = normaliseExtraction(raw({ purchase_date: f("07/10/2026"), price: f("about $800") }));
    expect(n.purchaseDate).toMatchObject({ value: null, status: "uncertain" });
    expect(n.priceCents).toMatchObject({ value: null, status: "uncertain" });
    // No reliable purchase date → no inferred expiry
    expect(n.warrantyExpiry).toMatchObject({ value: null, status: "missing" });
  });

  it("does not infer an expiry from uncertain inputs", () => {
    const n = normaliseExtraction(raw({ warranty_months: f(24, "uncertain", "2? years") }));
    expect(n.warrantyExpiry.value).toBeNull();
  });

  it("treats a 'missing' status as authoritative even if a value slipped through", () => {
    const n = normaliseExtraction(raw({ vendor: f("Somewhere", "missing", null) }));
    expect(n.vendor).toMatchObject({ value: null, status: "missing" });
  });

  it("caps over-long strings and rejects silly warranty lengths", () => {
    const n = normaliseExtraction(raw({ product_name: f("x".repeat(500)), warranty_months: f(9999) }));
    expect(n.productName.value).toHaveLength(120);
    expect(n.warrantyMonths).toMatchObject({ value: null, status: "uncertain" });
  });
});
