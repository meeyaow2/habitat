import { centsToInput } from "@/lib/domain/money";

export type AssetFormValues = {
  name: string;
  categoryId: string;
  brand: string;
  model: string;
  serialNumber: string;
  roomId: string;
  purchaseDate: string;
  purchasePrice: string;
  vendor: string;
  status: string;
  notes: string;
  warrantyStartsOn: string;
  warrantyExpiresOn: string;
  warrantyKind: string;
  warrantyProvider: string;
  warrantyTerms: string;
  recordPurchaseExpense: boolean;
};

export const emptyAsset = (overrides: Partial<AssetFormValues> = {}): AssetFormValues => ({
  name: "",
  categoryId: "",
  brand: "",
  model: "",
  serialNumber: "",
  roomId: "",
  purchaseDate: "",
  purchasePrice: "",
  vendor: "",
  status: "active",
  notes: "",
  warrantyStartsOn: "",
  warrantyExpiresOn: "",
  warrantyKind: "manufacturer",
  warrantyProvider: "",
  warrantyTerms: "",
  recordPurchaseExpense: true,
  ...overrides,
});

export function assetToForm(a: {
  name: string; category_id: string; brand: string | null; model: string | null; serial_number: string | null;
  room_id: string | null; purchase_date: string | null; purchase_price_cents: number | null; vendor: string | null;
  status: string; notes: string | null;
}, w?: { starts_on: string | null; expires_on: string; kind: string; provider: string | null; terms: string | null } | null): AssetFormValues {
  return emptyAsset({
    name: a.name,
    categoryId: a.category_id,
    brand: a.brand ?? "",
    model: a.model ?? "",
    serialNumber: a.serial_number ?? "",
    roomId: a.room_id ?? "",
    purchaseDate: a.purchase_date ?? "",
    purchasePrice: centsToInput(a.purchase_price_cents),
    vendor: a.vendor ?? "",
    status: a.status,
    notes: a.notes ?? "",
    warrantyStartsOn: w?.starts_on ?? "",
    warrantyExpiresOn: w?.expires_on ?? "",
    warrantyKind: w?.kind ?? "manufacturer",
    warrantyProvider: w?.provider ?? "",
    warrantyTerms: w?.terms ?? "",
    recordPurchaseExpense: false,
  });
}

