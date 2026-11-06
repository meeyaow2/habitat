"use client";

import * as React from "react";
import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { CATEGORIES, category } from "@/lib/domain/categories";
import { addInterval, todayIn } from "@/lib/domain/dates";
import { useAction } from "@/lib/client/use-action";
import { cn } from "@/lib/utils";
import { roomLabel, type RoomOption } from "@/features/shared/options";
import { createAssetAction, updateAssetAction } from "./actions";
import { emptyAsset, type AssetFormValues } from "./form-values";

export { emptyAsset, assetToForm, type AssetFormValues } from "./form-values";

/** Shared fields, used by the dialog and by onboarding. */
export function AssetFields({
  values,
  set,
  errors,
  rooms,
  mode,
  compact,
}: {
  values: AssetFormValues;
  set: <K extends keyof AssetFormValues>(k: K, v: AssetFormValues[K]) => void;
  errors: Record<string, string>;
  rooms: RoomOption[];
  mode: "create" | "edit";
  compact?: boolean;
}) {
  const [more, setMore] = React.useState(mode === "edit");
  const warrantyBase = values.purchaseDate || values.warrantyStartsOn || todayIn();
  const setWarrantyYears = (years: number) => {
    if (!values.warrantyStartsOn && values.purchaseDate) set("warrantyStartsOn", values.purchaseDate);
    set("warrantyExpiresOn", addInterval(warrantyBase, years, "year"));
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Category" htmlFor="asset-category" error={errors.categoryId}>
          <NativeSelect
            value={values.categoryId}
            onChange={(e) => {
              const id = e.target.value;
              set("categoryId", id);
              if (!values.name.trim() && id) set("name", category(id).label);
            }}
          >
            <option value="">Choose…</option>
            {CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Name" htmlFor="asset-name" error={errors.name} hint="What you call it at home.">
          <Input value={values.name} onChange={(e) => set("name", e.target.value)} placeholder="e.g. Bedroom aircon" autoComplete="off" />
        </Field>
        <Field label="Brand" htmlFor="asset-brand" optional error={errors.brand}>
          <Input value={values.brand} onChange={(e) => set("brand", e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Model" htmlFor="asset-model" optional error={errors.model}>
          <Input value={values.model} onChange={(e) => set("model", e.target.value)} autoComplete="off" />
        </Field>
        <Field label="Room" htmlFor="asset-room" optional error={errors.roomId} className="sm:col-span-2" hint={rooms.length === 0 ? "Rooms appear here once you set up your floor plan." : "Placing it on the floor plan also sets this."}>
          <NativeSelect value={values.roomId} onChange={(e) => set("roomId", e.target.value)} disabled={rooms.length === 0}>
            <option value="">Not assigned</option>
            {rooms.map((r) => (
              <option key={r.id} value={r.id}>
                {roomLabel(r)}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <section className="grid gap-4 sm:grid-cols-2" aria-labelledby="asset-purchase-h">
        <h3 id="asset-purchase-h" className="text-sm font-semibold text-fg sm:col-span-2">Purchase</h3>
        <Field label="Purchase date" htmlFor="asset-purchase-date" optional error={errors.purchaseDate}>
          <Input type="date" value={values.purchaseDate} onChange={(e) => set("purchaseDate", e.target.value)} max={todayIn()} />
        </Field>
        <Field label="Price (SGD)" htmlFor="asset-price" optional error={errors.purchasePrice}>
          <Input inputMode="decimal" value={values.purchasePrice} onChange={(e) => set("purchasePrice", e.target.value)} placeholder="0.00" />
        </Field>
        <Field label="Store or vendor" htmlFor="asset-vendor" optional error={errors.vendor} className={cn(mode === "create" ? "" : "sm:col-span-2")}>
          <Input value={values.vendor} onChange={(e) => set("vendor", e.target.value)} autoComplete="off" />
        </Field>
        {mode === "create" && (
          <label className="flex items-start gap-2.5 self-end pb-2 text-sm text-fg-muted">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[var(--accent)]"
              checked={values.recordPurchaseExpense}
              onChange={(e) => set("recordPurchaseExpense", e.target.checked)}
            />
            Add the price to household expenses
          </label>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2" aria-labelledby="asset-warranty-h">
        <div className="sm:col-span-2">
          <h3 id="asset-warranty-h" className="text-sm font-semibold text-fg">Warranty</h3>
          <p className="text-xs text-fg-muted">Habitat reminds you before it expires. Statutory consumer rights may still apply after a warranty ends.</p>
        </div>
        <Field label="Warranty expires" htmlFor="asset-warranty-expiry" optional error={errors.warrantyExpiresOn}>
          <Input type="date" value={values.warrantyExpiresOn} onChange={(e) => set("warrantyExpiresOn", e.target.value)} />
        </Field>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm font-medium text-fg" id="warranty-quick">Quick set</span>
          <div className="flex gap-1.5" role="group" aria-labelledby="warranty-quick">
            {[1, 2, 3, 5].map((y) => (
              <Button key={y} type="button" size="sm" variant="secondary" onClick={() => setWarrantyYears(y)} className="h-10 flex-1 sm:h-9" title={`${y} year${y > 1 ? "s" : ""} from ${values.purchaseDate ? "purchase" : "today"}`}>
                {y}y
              </Button>
            ))}
          </div>
        </div>
      </section>

      {!compact && (
        <div>
          <button
            type="button"
            className="flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"
            aria-expanded={more}
            onClick={() => setMore((m) => !m)}
          >
            <ChevronDown className={cn("size-4 transition-transform", more && "rotate-180")} aria-hidden />
            {more ? "Fewer details" : "More details — serial number, warranty terms, notes"}
          </button>
          {more && (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <Field label="Serial number" htmlFor="asset-serial" optional error={errors.serialNumber}>
                <Input value={values.serialNumber} onChange={(e) => set("serialNumber", e.target.value)} autoComplete="off" className="font-mono" />
              </Field>
              <Field label="Status" htmlFor="asset-status">
                <NativeSelect value={values.status} onChange={(e) => set("status", e.target.value)}>
                  <option value="active">Working normally</option>
                  <option value="needs_attention">Needs attention</option>
                  <option value="in_repair">In repair</option>
                  <option value="retired">Retired</option>
                </NativeSelect>
              </Field>
              <Field label="Warranty starts" htmlFor="asset-warranty-start" optional error={errors.warrantyStartsOn}>
                <Input type="date" value={values.warrantyStartsOn} onChange={(e) => set("warrantyStartsOn", e.target.value)} />
              </Field>
              <Field label="Warranty type" htmlFor="asset-warranty-kind">
                <NativeSelect value={values.warrantyKind} onChange={(e) => set("warrantyKind", e.target.value)}>
                  <option value="manufacturer">Manufacturer</option>
                  <option value="extended">Extended</option>
                  <option value="store">Store / retailer</option>
                  <option value="other">Other</option>
                </NativeSelect>
              </Field>
              <Field label="Warranty provider" htmlFor="asset-warranty-provider" optional className="sm:col-span-2">
                <Input value={values.warrantyProvider} onChange={(e) => set("warrantyProvider", e.target.value)} placeholder="e.g. Daikin Singapore" />
              </Field>
              <Field label="Warranty terms" htmlFor="asset-warranty-terms" optional className="sm:col-span-2" hint="What’s covered, claim process, phone number.">
                <Textarea value={values.warrantyTerms} onChange={(e) => set("warrantyTerms", e.target.value)} rows={2} />
              </Field>
              <Field label="Notes" htmlFor="asset-notes" optional className="sm:col-span-2" error={errors.notes}>
                <Textarea value={values.notes} onChange={(e) => set("notes", e.target.value)} rows={3} />
              </Field>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function toPayload(v: AssetFormValues) {
  return {
    ...v,
    roomId: v.roomId || null,
    categoryId: v.categoryId,
  };
}

export function AssetFormDialog({
  open,
  onOpenChange,
  rooms,
  initial,
  assetId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  rooms: RoomOption[];
  initial?: AssetFormValues;
  assetId?: string;
  onSaved?: (id: string) => void;
}) {
  const mode = assetId ? "edit" : "create";
  const [values, setValues] = React.useState<AssetFormValues>(initial ?? emptyAsset());
  React.useEffect(() => {
    if (open) setValues(initial ?? emptyAsset());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  const set = <K extends keyof AssetFormValues>(k: K, v: AssetFormValues[K]) => setValues((s) => ({ ...s, [k]: v }));

  const create = useAction(createAssetAction, { success: () => `Added ${values.name || "item"}` });
  const update = useAction(updateAssetAction, { success: "Changes saved" });
  const action = mode === "create" ? create : update;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = toPayload(values);
    const result = mode === "create" ? await create.run(payload) : await update.run({ id: assetId!, data: payload });
    if (result) {
      onOpenChange(false);
      onSaved?.(result.data.id);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={mode === "create" ? "Add an appliance or item" : `Edit ${initial?.name ?? "item"}`} description={mode === "create" ? "Only category and name are required. You can add details later." : undefined} size="lg">
        <form onSubmit={submit} noValidate>
          <DialogBody>
            <AssetFields values={values} set={set} errors={action.fieldErrors} rooms={rooms} mode={mode} />
            {action.error && Object.keys(action.fieldErrors).length > 0 && (
              <p className="mt-4 text-sm font-medium text-danger" role="alert">{action.error}</p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={action.pending}>{mode === "create" ? "Add item" : "Save changes"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
