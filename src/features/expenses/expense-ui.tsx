"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Download, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { Menu, MenuContent, MenuItem, MenuTrigger } from "@/components/ui/menu";
import { todayIn } from "@/lib/domain/dates";
import { centsToInput } from "@/lib/domain/money";
import { useAction } from "@/lib/client/use-action";
import type { AssetOption } from "@/features/shared/options";
import { createExpenseAction, deleteExpenseAction, updateExpenseAction } from "./actions";
import { useOnOpen } from "@/lib/client/use-on-change";

const CATS = [
  ["appliance_purchase", "Appliance purchase"],
  ["repair", "Repair"],
  ["servicing", "Servicing"],
  ["renovation", "Renovation"],
  ["parts", "Replacement parts"],
  ["other", "Other"],
] as const;

type Values = { description: string; category: string; amount: string; incurredOn: string; assetId: string; vendor: string };

export function ExpenseDialog({ open, onOpenChange, assets, initial, expenseId }: { open: boolean; onOpenChange: (o: boolean) => void; assets: AssetOption[]; initial?: Values; expenseId?: string }) {
  const blank = (): Values => ({ description: "", category: "repair", amount: "", incurredOn: todayIn(), assetId: "", vendor: "" });
  const [v, setV] = React.useState<Values>(initial ?? blank());
  useOnOpen(open, () => setV(initial ?? blank()));
  const create = useAction(createExpenseAction, { success: "Expense recorded" });
  const update = useAction(updateExpenseAction, { success: "Expense updated" });
  const a = expenseId ? update : create;
  const set = (k: keyof Values, val: string) => setV((s) => ({ ...s, [k]: val }));
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={expenseId ? "Edit expense" : "Add an expense"} size="md">
        <form
          noValidate
          onSubmit={async (e) => {
            e.preventDefault();
            const payload = { ...v, assetId: v.assetId || null };
            const ok = expenseId ? await update.run({ id: expenseId, data: payload }) : await create.run(payload);
            if (ok) onOpenChange(false);
          }}
        >
          <DialogBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Description" htmlFor="exp-desc" error={a.fieldErrors.description} className="sm:col-span-2">
              <Input value={v.description} onChange={(e) => set("description", e.target.value)} placeholder="e.g. Aircon chemical wash" />
            </Field>
            <Field label="Amount (SGD)" htmlFor="exp-amount" error={a.fieldErrors.amount}>
              <Input inputMode="decimal" value={v.amount} onChange={(e) => set("amount", e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="Date" htmlFor="exp-date" error={a.fieldErrors.incurredOn}>
              <Input type="date" value={v.incurredOn} onChange={(e) => set("incurredOn", e.target.value)} />
            </Field>
            <Field label="Category" htmlFor="exp-cat">
              <NativeSelect value={v.category} onChange={(e) => set("category", e.target.value)}>
                {CATS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Item" htmlFor="exp-asset" optional>
              <NativeSelect value={v.assetId} onChange={(e) => set("assetId", e.target.value)}>
                <option value="">Not linked</option>
                {assets.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </NativeSelect>
            </Field>
            <Field label="Paid to" htmlFor="exp-vendor" optional className="sm:col-span-2">
              <Input value={v.vendor} onChange={(e) => set("vendor", e.target.value)} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={a.pending}>{expenseId ? "Save" : "Add expense"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function ExpenseToolbar({ assets, exportHref }: { assets: AssetOption[]; exportHref: string }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <Button variant="secondary" asChild><a href={exportHref} download><Download aria-hidden /> Export CSV</a></Button>
      <Button variant="primary" onClick={() => setOpen(true)}><Plus aria-hidden /> Add expense</Button>
      <ExpenseDialog open={open} onOpenChange={setOpen} assets={assets} />
    </>
  );
}

export function ExpenseFiltersBar({ assets, period, category, assetId }: { assets: AssetOption[]; period: string; category: string; assetId: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params.toString());
    if (v) next.set(k, v);
    else next.delete(k);
    router.replace(`${pathname}?${next}`, { scroll: false });
  };
  return (
    <div className="mb-5 grid grid-cols-1 gap-2 sm:grid-cols-3 lg:max-w-3xl">
      <div>
        <label htmlFor="ef-period" className="sr-only">Period</label>
        <NativeSelect id="ef-period" value={period} onChange={(e) => set("period", e.target.value === "year" ? "" : e.target.value)}>
          <option value="month">This month</option>
          <option value="3m">Last 3 months</option>
          <option value="year">This year</option>
          <option value="12m">Last 12 months</option>
          <option value="last-year">Last year</option>
          <option value="all">All time</option>
        </NativeSelect>
      </div>
      <div>
        <label htmlFor="ef-cat" className="sr-only">Category</label>
        <NativeSelect id="ef-cat" value={category} onChange={(e) => set("category", e.target.value)}>
          <option value="">All categories</option>
          {CATS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </NativeSelect>
      </div>
      <div>
        <label htmlFor="ef-asset" className="sr-only">Item</label>
        <NativeSelect id="ef-asset" value={assetId} onChange={(e) => set("asset", e.target.value)}>
          <option value="">All items</option>
          {assets.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
        </NativeSelect>
      </div>
    </div>
  );
}

export function ExpenseRowMenu({ row, assets, canEdit }: { row: { id: string; description: string; category: string; amount_cents: number; incurred_on: string; asset_id: string | null; vendor: string | null }; assets: AssetOption[]; canEdit: boolean }) {
  const [open, setOpen] = React.useState<null | "edit" | "delete">(null);
  const del = useAction(deleteExpenseAction, { success: "Expense deleted" });
  if (!canEdit) return null;
  return (
    <>
      <Menu>
        <MenuTrigger className="grid size-8 place-items-center rounded-md text-fg-subtle hover:bg-surface-muted hover:text-fg" aria-label={`Actions for ${row.description}`}>
          <MoreHorizontal className="size-4" />
        </MenuTrigger>
        <MenuContent>
          <MenuItem onSelect={() => setOpen("edit")}><Pencil /> Edit</MenuItem>
          <MenuItem tone="danger" onSelect={() => setOpen("delete")}><Trash2 /> Delete</MenuItem>
        </MenuContent>
      </Menu>
      <ExpenseDialog
        open={open === "edit"}
        onOpenChange={(o) => setOpen(o ? "edit" : null)}
        assets={assets}
        expenseId={row.id}
        initial={{ description: row.description, category: row.category, amount: centsToInput(row.amount_cents), incurredOn: row.incurred_on, assetId: row.asset_id ?? "", vendor: row.vendor ?? "" }}
      />
      <ConfirmDialog open={open === "delete"} onOpenChange={(o) => setOpen(o ? "delete" : null)} title="Delete this expense?" description={`“${row.description}” will be removed from your totals.`} confirmLabel="Delete expense" onConfirm={async () => { await del.run({ id: row.id }); }} />
    </>
  );
}
