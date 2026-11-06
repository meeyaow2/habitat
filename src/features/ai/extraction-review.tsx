"use client";

import Link from "next/link";
import * as React from "react";
import { Info, Quote, Sparkles } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Notice } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/segmented";
import { useAction } from "@/lib/client/use-action";
import { useOnOpen } from "@/lib/client/use-on-change";
import type { FieldStatus, NormalisedExtraction, ReviewField } from "@/lib/ai/extraction";
import { centsToInput } from "@/lib/domain/money";
import { formatDate } from "@/lib/domain/dates";
import { AssetFields, toPayload } from "@/features/assets/asset-form";
import { emptyAsset, type AssetFormValues } from "@/features/assets/form-values";
import type { RoomOption } from "@/features/shared/options";
import { applyExtractionAction, discardExtractionAction } from "./extraction-actions";

const STATUS: Record<FieldStatus, { label: string; tone: "success" | "info" | "neutral" | "warning"; help: string }> = {
  extracted: { label: "Extracted", tone: "success", help: "Printed in the document" },
  inferred: { label: "Inferred", tone: "info", help: "Not printed, but implied or calculated" },
  missing: { label: "Missing", tone: "neutral", help: "Not found in the document" },
  uncertain: { label: "Uncertain", tone: "warning", help: "Partly legible or ambiguous — check it" },
};

type Row = { label: string; field: ReviewField<string | number>; display: string | null };

function rows(x: NormalisedExtraction): Row[] {
  return [
    { label: "Product", field: x.productName, display: x.productName.value },
    { label: "Brand", field: x.brand, display: x.brand.value },
    { label: "Model", field: x.model, display: x.model.value },
    { label: "Serial number", field: x.serialNumber, display: x.serialNumber.value },
    { label: "Purchase date", field: x.purchaseDate, display: x.purchaseDate.value ? formatDate(x.purchaseDate.value) : null },
    { label: "Price", field: x.priceCents, display: x.priceCents.value !== null ? `${x.currency.value ?? ""} ${centsToInput(x.priceCents.value)}`.trim() : null },
    { label: "Store", field: x.vendor, display: x.vendor.value },
    { label: "Warranty length", field: x.warrantyMonths, display: x.warrantyMonths.value ? `${x.warrantyMonths.value} months` : null },
    { label: "Warranty ends", field: x.warrantyExpiry, display: x.warrantyExpiry.value ? formatDate(x.warrantyExpiry.value) : null },
  ];
}

/** Pre-fill the asset form only with values that were actually read (never with missing ones). */
function toForm(x: NormalisedExtraction, base: AssetFormValues): AssetFormValues {
  const pick = <T,>(f: ReviewField<T>) => (f.status === "missing" ? null : f.value);
  return {
    ...base,
    name: base.name || pick(x.productName) || "",
    brand: pick(x.brand) ?? base.brand,
    model: pick(x.model) ?? base.model,
    serialNumber: pick(x.serialNumber) ?? base.serialNumber,
    purchaseDate: pick(x.purchaseDate) ?? base.purchaseDate,
    purchasePrice: pick(x.priceCents) !== null ? centsToInput(pick(x.priceCents)) : base.purchasePrice,
    vendor: pick(x.vendor) ?? base.vendor,
    warrantyStartsOn: pick(x.warrantyExpiry) && pick(x.purchaseDate) ? pick(x.purchaseDate)! : base.warrantyStartsOn,
    warrantyExpiresOn: pick(x.warrantyExpiry) ?? base.warrantyExpiresOn,
    recordPurchaseExpense: !base.name,
  };
}

export function ExtractionReviewDialog({
  open,
  onOpenChange,
  extractionId,
  result,
  rooms,
  linkedAsset,
  currency,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  extractionId: string;
  result: NormalisedExtraction;
  rooms: RoomOption[];
  linkedAsset: { id: string; name: string; form: AssetFormValues } | null;
  currency: string;
}) {
  const [target, setTarget] = React.useState<"update" | "create">(linkedAsset ? "update" : "create");
  const [values, setValues] = React.useState<AssetFormValues>(() => toForm(result, linkedAsset?.form ?? emptyAsset({ categoryId: "" })));
  useOnOpen(open, () => {
    setTarget(linkedAsset ? "update" : "create");
    setValues(toForm(result, linkedAsset?.form ?? emptyAsset({ categoryId: "" })));
  });
  const apply = useAction(applyExtractionAction, { success: "Saved after your review" });
  const discard = useAction(discardExtractionAction, { silent: true });
  const [saved, setSaved] = React.useState<string | null>(null);
  const currencyMismatch = result.currency.value && result.currency.value !== currency;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Review what AI read" description="Nothing is saved until you confirm. Check each value against the document." size="lg">
        {saved ? (
          <>
            <DialogBody>
              <Notice tone="success" title="Saved">The item was updated and this document is now linked to it. <Link href={`/assets/${saved}`}>Open the item</Link></Notice>
            </DialogBody>
            <DialogFooter><Button variant="primary" onClick={() => onOpenChange(false)}>Done</Button></DialogFooter>
          </>
        ) : (
          <form
            noValidate
            onSubmit={async (e) => {
              e.preventDefault();
              const ok = await apply.run({ extractionId, assetId: target === "update" && linkedAsset ? linkedAsset.id : null, data: toPayload(values) });
              if (ok) setSaved(ok.data.assetId);
            }}
          >
            <DialogBody className="flex flex-col gap-6">
              <section aria-labelledby="ai-read-h">
                <h3 id="ai-read-h" className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="size-4 text-accent" aria-hidden /> What the document says</h3>
                <dl className="mt-2 divide-y divide-line rounded-md border border-line">
                  {rows(result).map((r) => {
                    const s = STATUS[r.field.status];
                    return (
                      <div key={r.label} className="grid grid-cols-[110px_1fr] gap-x-3 px-3 py-2 text-sm sm:grid-cols-[130px_1fr_auto]">
                        <dt className="text-fg-muted">{r.label}</dt>
                        <dd className="min-w-0">
                          <span className={r.display ? "font-medium" : "text-fg-subtle"}>{r.display ?? "—"}</span>
                          {r.field.evidence && (
                            <span className="mt-0.5 flex items-start gap-1 text-xs text-fg-muted">
                              <Quote className="mt-0.5 size-3 shrink-0" aria-hidden />
                              <span className="break-words">“{r.field.evidence}”{r.field.page ? ` · page ${r.field.page}` : ""}</span>
                            </span>
                          )}
                          {r.field.note && <span className="mt-0.5 block text-xs text-warning">{r.field.note}</span>}
                        </dd>
                        <dd className="col-start-2 mt-1 sm:col-start-auto sm:mt-0"><Badge tone={s.tone} title={s.help}>{s.label}</Badge></dd>
                      </div>
                    );
                  })}
                </dl>
                {result.notes && <Notice tone="neutral" icon={<Info />} className="mt-3">{result.notes}</Notice>}
                {currencyMismatch && <Notice tone="warning" className="mt-3">The document is in {result.currency.value}. Habitat records amounts in {currency} without conversion — adjust the price if needed.</Notice>}
                <p className="mt-2 text-[11px] text-fg-subtle">AI can misread documents. Quotes show the text each value came from; values marked Missing were not filled in.</p>
              </section>

              <section aria-labelledby="ai-save-h" className="flex flex-col gap-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 id="ai-save-h" className="text-sm font-semibold">Save to</h3>
                  {linkedAsset && (
                    <Segmented
                      size="sm"
                      label="Save to"
                      value={target}
                      onChange={(t) => {
                        setTarget(t);
                        setValues(toForm(result, t === "update" ? linkedAsset.form : emptyAsset({ categoryId: "" })));
                      }}
                      options={[
                        { value: "update", label: `Update ${linkedAsset.name}` },
                        { value: "create", label: "New item" },
                      ]}
                    />
                  )}
                </div>
                {apply.error && !Object.keys(apply.fieldErrors).length && <Notice tone="danger">{apply.error}</Notice>}
                <AssetFields values={values} set={(k, v) => setValues((s) => ({ ...s, [k]: v }))} errors={Object.fromEntries(Object.entries(apply.fieldErrors).map(([k, v]) => [k.replace(/^data\./, ""), v]))} rooms={rooms} mode={target === "update" ? "edit" : "create"} />
              </section>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={async () => { await discard.run({ extractionId }); onOpenChange(false); }}>Discard</Button>
              <Button type="submit" variant="primary" loading={apply.pending}>{target === "update" && linkedAsset ? `Save to ${linkedAsset.name}` : "Create item"}</Button>
            </DialogFooter>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
