import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { CATEGORIES } from "@/lib/domain/categories";
import { assetSchema, expenseSchema, signUpSchema, taskSchema } from "@/lib/validation/schemas";

describe("asset schema", () => {
  it("accepts a minimal asset and normalises blanks to null", () => {
    const r = assetSchema.parse({ name: " Washing machine ", categoryId: "washing_machine", brand: "", purchasePrice: "849", warrantyExpiresOn: "" });
    expect(r).toMatchObject({ name: "Washing machine", brand: null, purchasePrice: 84900, warrantyExpiresOn: null, status: "active" });
  });

  it("rejects unknown categories, bad prices and inverted warranty dates", () => {
    expect(assetSchema.safeParse({ name: "X", categoryId: "spaceship" }).success).toBe(false);
    expect(assetSchema.safeParse({ name: "X", categoryId: "other", purchasePrice: "12.345" }).success).toBe(false);
    const inverted = assetSchema.safeParse({ name: "X", categoryId: "other", warrantyStartsOn: "2026-05-01", warrantyExpiresOn: "2026-01-01" });
    expect(inverted.success).toBe(false);
    expect(inverted.error?.issues[0].path).toEqual(["warrantyExpiresOn"]);
  });

  it("requires an expiry when a warranty start is given", () => {
    expect(assetSchema.safeParse({ name: "X", categoryId: "other", warrantyStartsOn: "2026-05-01" }).success).toBe(false);
  });
});

describe("task schema", () => {
  it("requires interval and unit together", () => {
    const base = { title: "Clean filter", dueOn: "2026-12-01" };
    expect(taskSchema.safeParse({ ...base, recurrenceInterval: 3, recurrenceUnit: "month" }).success).toBe(true);
    expect(taskSchema.safeParse({ ...base, recurrenceInterval: 3 }).success).toBe(false);
    expect(taskSchema.safeParse({ ...base, recurrenceUnit: "month" }).success).toBe(false);
    expect(taskSchema.safeParse({ ...base, dueOn: "2026-13-01" }).success).toBe(false);
  });
});

describe("expense and auth schemas", () => {
  it("requires a positive, exact amount", () => {
    expect(expenseSchema.parse({ description: "Gas top-up", category: "servicing", amount: "60", incurredOn: "2026-11-01" }).amount).toBe(6000);
    expect(expenseSchema.safeParse({ description: "x", category: "servicing", amount: "", incurredOn: "2026-11-01" }).success).toBe(false);
  });
  it("enforces password length and normalises email", () => {
    expect(signUpSchema.safeParse({ displayName: "A", email: "A@B.co", password: "short" }).success).toBe(false);
    expect(signUpSchema.parse({ displayName: "A", email: "A@Example.COM", password: "long-enough-pw" }).email).toBe("a@example.com");
  });
});

describe("category reference data", () => {
  it("matches the migration seed exactly", () => {
    const sql = readFileSync(path.resolve(__dirname, "../../supabase/migrations/20261106000300_reference_data.sql"), "utf8");
    const rows = [...sql.matchAll(/\('([a-z_]+)',\s*'([^']+)',\s*'([a-z-]+)',\s*(true|false),\s*(\d+),\s*(\d+)/g)].map((m) => ({ id: m[1], label: m[2], icon: m[3], isAppliance: m[4] === "true", w: Number(m[5]), d: Number(m[6]) }));
    expect(rows).toEqual(CATEGORIES.map((c) => ({ id: c.id, label: c.label, icon: c.icon, isAppliance: c.isAppliance, w: c.w, d: c.d })));
  });
});
