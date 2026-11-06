"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { addInterval, formatDate, todayIn, type IntervalUnit } from "@/lib/domain/dates";
import { useAction } from "@/lib/client/use-action";
import type { AssetOption } from "@/features/shared/options";
import { completeTaskAction, recordEventAction } from "./actions";
import { useOnChange, useOnOpen } from "@/lib/client/use-on-change";

export type CompletableTask = {
  id: string;
  title: string;
  recurrence_interval: number | null;
  recurrence_unit: IntervalUnit | null;
  asset_name?: string | null;
};

export function CompleteTaskDialog({
  task,
  onOpenChange,
  onCompleted,
  onFailed,
}: {
  task: CompletableTask | null;
  onOpenChange: (open: boolean) => void;
  onCompleted?: (id: string) => void;
  onFailed?: (id: string) => void;
}) {
  const [performedOn, setPerformedOn] = React.useState(todayIn());
  const [cost, setCost] = React.useState("");
  const [vendor, setVendor] = React.useState("");
  const [notes, setNotes] = React.useState("");
  useOnChange(task, (t) => {
    if (t) {
      setPerformedOn(todayIn());
      setCost("");
      setVendor("");
      setNotes("");
    }
  });
  const complete = useAction(completeTaskAction, {
    success: (d) => (d.nextDueOn ? `Done. Next one due ${formatDate(d.nextDueOn)}` : "Task completed"),
  });

  const next = task?.recurrence_interval && task.recurrence_unit && performedOn
    ? addInterval(performedOn, task.recurrence_interval, task.recurrence_unit)
    : null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!task) return;
    onCompleted?.(task.id);
    const ok = await complete.run({ taskId: task.id, performedOn, cost, vendor, notes });
    if (ok) onOpenChange(false);
    else onFailed?.(task.id);
  }

  return (
    <Dialog open={!!task} onOpenChange={onOpenChange}>
      <DialogContent title="Mark as done" description={task ? `${task.title}${task.asset_name ? ` · ${task.asset_name}` : ""}` : undefined} size="sm">
        <form onSubmit={submit} noValidate>
          <DialogBody className="flex flex-col gap-4">
            <Field label="Done on" htmlFor="complete-date" error={complete.fieldErrors.performedOn}>
              <Input type="date" value={performedOn} max={todayIn()} onChange={(e) => setPerformedOn(e.target.value)} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cost (SGD)" htmlFor="complete-cost" optional error={complete.fieldErrors.cost} hint="Added to expenses.">
                <Input inputMode="decimal" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="0.00" />
              </Field>
              <Field label="Done by" htmlFor="complete-vendor" optional>
                <Input value={vendor} onChange={(e) => setVendor(e.target.value)} placeholder="You or a company" />
              </Field>
            </div>
            <Field label="Notes" htmlFor="complete-notes" optional>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} placeholder="Anything worth remembering next time" />
            </Field>
            {next && (
              <p className="rounded-md bg-accent-soft px-3 py-2 text-sm text-accent-soft-fg">
                Next one will be scheduled for <strong className="font-semibold">{formatDate(next)}</strong>.
              </p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={complete.pending}>Mark as done</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function RecordEventDialog({
  open,
  onOpenChange,
  assets,
  defaultAssetId,
  defaultKind = "repair",
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  assets: AssetOption[];
  defaultAssetId?: string;
  defaultKind?: "repair" | "service" | "inspection" | "note";
}) {
  const blank = React.useCallback(
    () => ({ assetId: defaultAssetId ?? "", kind: defaultKind, title: "", performedOn: todayIn(), vendor: "", cost: "", notes: "" }),
    [defaultAssetId, defaultKind],
  );
  const [v, setV] = React.useState(blank);
  useOnOpen(open, () => setV(blank()));
  const rec = useAction(recordEventAction, { success: "Recorded in service history" });
  const set = (k: keyof typeof v, val: string) => setV((s) => ({ ...s, [k]: val }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const ok = await rec.run({ ...v, assetId: v.assetId || null, kind: v.kind as "repair" });
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title="Record a repair or service" description="Adds to the item’s history. A cost is added to expenses." size="md">
        <form onSubmit={submit} noValidate>
          <DialogBody className="grid gap-4 sm:grid-cols-2">
            <Field label="Item" htmlFor="event-asset" optional className="sm:col-span-2">
              <NativeSelect value={v.assetId} onChange={(e) => set("assetId", e.target.value)}>
                <option value="">Whole home</option>
                {assets.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </NativeSelect>
            </Field>
            <Field label="Type" htmlFor="event-kind">
              <NativeSelect value={v.kind} onChange={(e) => set("kind", e.target.value)}>
                <option value="repair">Repair</option>
                <option value="service">Service</option>
                <option value="inspection">Inspection</option>
                <option value="note">Note</option>
              </NativeSelect>
            </Field>
            <Field label="Date" htmlFor="event-date" error={rec.fieldErrors.performedOn}>
              <Input type="date" value={v.performedOn} max={todayIn()} onChange={(e) => set("performedOn", e.target.value)} />
            </Field>
            <Field label="What was done" htmlFor="event-title" error={rec.fieldErrors.title} className="sm:col-span-2">
              <Input value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Replaced drain pump" />
            </Field>
            <Field label="Cost (SGD)" htmlFor="event-cost" optional error={rec.fieldErrors.cost}>
              <Input inputMode="decimal" value={v.cost} onChange={(e) => set("cost", e.target.value)} placeholder="0.00" />
            </Field>
            <Field label="Technician or company" htmlFor="event-vendor" optional>
              <Input value={v.vendor} onChange={(e) => set("vendor", e.target.value)} />
            </Field>
            <Field label="Notes" htmlFor="event-notes" optional className="sm:col-span-2">
              <Textarea value={v.notes} onChange={(e) => set("notes", e.target.value)} rows={2} />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={rec.pending}>Save record</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
