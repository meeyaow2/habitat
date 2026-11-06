import { z } from "zod";
import { isISODate } from "@/lib/domain/dates";
import { parseMoneyToCents } from "@/lib/domain/money";
import { CATEGORY_IDS } from "@/lib/domain/categories";

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------
export const id = z.guid({ error: "Invalid reference." });

/** Optional free text: trims, empty → null. */
export const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Keep this under ${max} characters.` })
    .nullish()
    .transform((v) => (v ? v : null));

export const requiredText = (max: number, label = "This field") =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, { error: `${label} is required.` })
    .max(max, { error: `Keep this under ${max} characters.` });

export const optionalDate = z
  .string()
  .trim()
  .nullish()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isISODate(v), { error: "Enter a valid date." });

export const requiredDate = z.string({ error: "Choose a date." }).refine(isISODate, { error: "Enter a valid date." });

/** Money typed by a user ("1,299.90") → integer cents or null. */
export const optionalMoney = z
  .union([z.string(), z.number()])
  .nullish()
  .transform((v, ctx) => {
    if (v === null || v === undefined || v === "") return null;
    const cents = typeof v === "number" ? Math.round(v * 100) : parseMoneyToCents(v);
    if (cents === null) return null;
    if (Number.isNaN(cents) || cents < 0 || cents >= 1e12) {
      ctx.addIssue({ code: "custom", message: "Enter an amount like 1299.90." });
      return z.NEVER;
    }
    return cents;
  });

export const requiredMoney = optionalMoney.refine((v) => v !== null, { error: "Enter an amount." });

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------
export const signUpSchema = z.object({
  displayName: requiredText(80, "Your name"),
  email: z.email({ error: "Enter a valid email address." }).max(254).transform((v) => v.toLowerCase()),
  password: z
    .string()
    .min(10, { error: "Use at least 10 characters." })
    .max(200, { error: "That password is too long." }),
});

export const signInSchema = z.object({
  email: z.email({ error: "Enter a valid email address." }).transform((v) => v.toLowerCase()),
  password: z.string().min(1, { error: "Enter your password." }).max(200),
});

// ---------------------------------------------------------------------------
// Household & property
// ---------------------------------------------------------------------------
export const propertyTypes = ["hdb", "condo", "landed", "apartment", "other"] as const;
export const hdbFlatTypes = ["2_room", "3_room", "4_room", "5_room", "executive"] as const;

export const createHomeSchema = z
  .object({
    householdName: requiredText(80, "Household name"),
    propertyName: requiredText(80, "Home name"),
    propertyType: z.enum(propertyTypes, { error: "Choose a property type." }),
    hdbFlatType: z.enum(hdbFlatTypes).nullish().transform((v) => v ?? null),
  })
  .refine((v) => v.propertyType === "hdb" || v.hdbFlatType === null, {
    error: "Flat type only applies to HDB homes.",
    path: ["hdbFlatType"],
  });

export const householdSettingsSchema = z.object({
  name: requiredText(80, "Household name"),
  warrantyReminderDays: z.coerce.number().int().min(7).max(365),
});

// ---------------------------------------------------------------------------
// Assets
// ---------------------------------------------------------------------------
export const assetStatuses = ["active", "needs_attention", "in_repair", "retired"] as const;
export const warrantyKinds = ["manufacturer", "extended", "store", "other"] as const;

export const assetSchema = z
  .object({
    name: requiredText(120, "Name"),
    categoryId: z.enum(CATEGORY_IDS, { error: "Choose a category." }),
    brand: optionalText(80),
    model: optionalText(80),
    serialNumber: optionalText(120),
    roomId: id.nullish().transform((v) => v ?? null),
    purchaseDate: optionalDate,
    purchasePrice: optionalMoney,
    vendor: optionalText(120),
    status: z.enum(assetStatuses).default("active"),
    notes: optionalText(4000),
    warrantyStartsOn: optionalDate,
    warrantyExpiresOn: optionalDate,
    warrantyKind: z.enum(warrantyKinds).default("manufacturer"),
    warrantyProvider: optionalText(120),
    warrantyTerms: optionalText(4000),
    recordPurchaseExpense: z.boolean().default(false),
  })
  .refine((v) => !v.warrantyStartsOn || v.warrantyExpiresOn, {
    error: "Add the expiry date for this warranty.",
    path: ["warrantyExpiresOn"],
  })
  .refine((v) => !v.warrantyStartsOn || !v.warrantyExpiresOn || v.warrantyExpiresOn >= v.warrantyStartsOn, {
    error: "Expiry must be on or after the start date.",
    path: ["warrantyExpiresOn"],
  });

export type AssetInput = z.infer<typeof assetSchema>;

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------
export const recurrenceUnits = ["day", "week", "month", "year"] as const;

export const taskSchema = z
  .object({
    title: requiredText(160, "Title"),
    description: optionalText(4000),
    assetId: id.nullish().transform((v) => v ?? null),
    assignedTo: id.nullish().transform((v) => v ?? null),
    dueOn: requiredDate,
    priority: z.enum(["low", "normal", "high"]).default("normal"),
    recurrenceInterval: z.coerce.number().int().min(1).max(120).nullish().transform((v) => v ?? null),
    recurrenceUnit: z.enum(recurrenceUnits).nullish().transform((v) => v ?? null),
    source: z.enum(["user", "general_guidance", "manufacturer"]).default("user"),
  })
  .refine((v) => (v.recurrenceInterval === null) === (v.recurrenceUnit === null), {
    error: "Choose both how often and the unit, or set it to not repeat.",
    path: ["recurrenceInterval"],
  });

export const completeTaskSchema = z.object({
  taskId: id,
  performedOn: requiredDate,
  notes: optionalText(4000),
  vendor: optionalText(120),
  cost: optionalMoney,
});

export const eventKinds = ["service", "repair", "inspection", "note"] as const;

export const recordEventSchema = z.object({
  assetId: id.nullish().transform((v) => v ?? null),
  kind: z.enum(eventKinds),
  title: requiredText(160, "Title"),
  performedOn: requiredDate,
  vendor: optionalText(120),
  cost: optionalMoney,
  notes: optionalText(4000),
});

// ---------------------------------------------------------------------------
// Expenses
// ---------------------------------------------------------------------------
export const expenseCategories = ["appliance_purchase", "repair", "servicing", "renovation", "parts", "other"] as const;

export const expenseSchema = z.object({
  description: requiredText(200, "Description"),
  category: z.enum(expenseCategories),
  amount: requiredMoney,
  incurredOn: requiredDate,
  assetId: id.nullish().transform((v) => v ?? null),
  vendor: optionalText(120),
});

// ---------------------------------------------------------------------------
// Household members
// ---------------------------------------------------------------------------
export const inviteSchema = z.object({
  email: z.email({ error: "Enter a valid email address." }).max(254).transform((v) => v.toLowerCase()),
  role: z.enum(["owner", "member"]).default("member"),
});
