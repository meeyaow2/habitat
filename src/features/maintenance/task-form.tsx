"use client";

import * as React from "react";
import { Info, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect, Textarea } from "@/components/ui/input";
import { addDays, describeInterval, todayIn, type IntervalUnit } from "@/lib/domain/dates";
import { GUIDANCE_DISCLAIMER, guidanceFor, HOUSEHOLD_GUIDANCE } from "@/lib/domain/guidance";
import { useAction } from "@/lib/client/use-action";
import type { AssetOption, MemberOption } from "@/features/shared/options";
import { createTaskAction, updateTaskAction } from "./actions";
import { useOnOpen } from "@/lib/client/use-on-change";

export type TaskFormValues = {
  title: string;
  description: string;
  assetId: string;
  assignedTo: string;
  dueOn: string;
  priority: "low" | "normal" | "high";
  repeat: string; // "none" | "1:month" | ... | "custom"
  customInterval: string;
  customUnit: IntervalUnit;
  source: "user" | "general_guidance" | "manufacturer";
};

const REPEATS = [
  { value: "none", label: "Doesn’t repeat" },
  { value: "1:week", label: "Weekly" },
  { value: "1:month", label: "Monthly" },
  { value: "3:month", label: "Every 3 months" },
  { value: "6:month", label: "Every 6 months" },
  { value: "1:year", label: "Yearly" },
  { value: "custom", label: "Custom…" },
];

export function repeatValue(interval: number | null, unit: string | null) {
  if (!interval || !unit) return "none";
  const v = `${interval}:${unit}`;
  return REPEATS.some((r) => r.value === v) ? v : "custom";
}

export const emptyTask = (o: Partial<TaskFormValues> = {}): TaskFormValues => ({
  title: "",
  description: "",
  assetId: "",
  assignedTo: "",
  dueOn: addDays(todayIn(), 7),
  priority: "normal",
  repeat: "none",
  customInterval: "2",
  customUnit: "month",
  source: "user",
  ...o,
});

function toPayload(v: TaskFormValues) {
  let interval: number | null = null;
  let unit: IntervalUnit | null = null;
  if (v.repeat === "custom") {
    interval = Number(v.customInterval);
    unit = v.customUnit;
  } else if (v.repeat !== "none") {
    const [n, u] = v.repeat.split(":");
    interval = Number(n);
    unit = u as IntervalUnit;
  }
  return {
    title: v.title,
    description: v.description,
    assetId: v.assetId || null,
    assignedTo: v.assignedTo || null,
    dueOn: v.dueOn,
    priority: v.priority,
    recurrenceInterval: interval,
    recurrenceUnit: unit,
    source: v.source,
  };
}

export function TaskFormDialog({
  open,
  onOpenChange,
  assets,
  members,
  initial,
  taskId,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  assets: AssetOption[];
  members: MemberOption[];
  initial?: TaskFormValues;
  taskId?: string;
}) {
  const [v, setV] = React.useState<TaskFormValues>(initial ?? emptyTask());
  useOnOpen(open, () => setV(initial ?? emptyTask()));
  const set = <K extends keyof TaskFormValues>(k: K, val: TaskFormValues[K]) => setV((s) => ({ ...s, [k]: val }));

  const create = useAction(createTaskAction, { success: "Task scheduled" });
  const update = useAction(updateTaskAction, { success: "Task updated" });
  const a = taskId ? update : create;

  const asset = assets.find((x) => x.id === v.assetId);
  const suggestions = asset ? guidanceFor(asset.category_id) : HOUSEHOLD_GUIDANCE;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = toPayload(v);
    const ok = taskId ? await update.run({ id: taskId, data: payload }) : await create.run(payload);
    if (ok) onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={taskId ? "Edit task" : "New maintenance task"} size="md">
        <form onSubmit={submit} noValidate>
          <DialogBody className="flex flex-col gap-4">
            <Field label="For" htmlFor="task-asset" optional>
              <NativeSelect value={v.assetId} onChange={(e) => set("assetId", e.target.value)}>
                <option value="">Whole home</option>
                {assets.map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.name}
                    {x.room_name ? ` — ${x.room_name}` : ""}
                  </option>
                ))}
              </NativeSelect>
            </Field>

            {!taskId && suggestions.length > 0 && (
              <div className="rounded-md border border-line bg-surface-muted/60 p-3">
                <p className="flex items-center gap-1.5 text-xs font-semibold text-fg-muted">
                  <Sparkles className="size-3.5" aria-hidden /> Suggestions · general guidance
                </p>
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {suggestions.map((g) => (
                    <button
                      type="button"
                      key={g.title}
                      onClick={() =>
                        setV((s) => ({
                          ...s,
                          title: g.title,
                          description: g.why,
                          repeat: repeatValue(g.interval, g.unit),
                          customInterval: String(g.interval),
                          customUnit: g.unit,
                          source: "general_guidance",
                        }))
                      }
                      className="rounded-sm border border-line bg-surface px-2 py-1 text-left text-xs hover:border-line-strong"
                    >
                      <span className="font-medium text-fg">{g.title}</span>
                      <span className="text-fg-subtle"> · {describeInterval(g.interval, g.unit).toLowerCase()}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-2 flex gap-1.5 text-[11px] leading-4 text-fg-subtle">
                  <Info className="mt-px size-3 shrink-0" aria-hidden /> {GUIDANCE_DISCLAIMER}
                </p>
              </div>
            )}

            <Field label="Task" htmlFor="task-title" error={a.fieldErrors.title}>
              <Input value={v.title} onChange={(e) => set("title", e.target.value)} placeholder="e.g. Clean aircon filters" />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Due" htmlFor="task-due" error={a.fieldErrors.dueOn}>
                <Input type="date" value={v.dueOn} onChange={(e) => set("dueOn", e.target.value)} />
              </Field>
              <Field label="Repeats" htmlFor="task-repeat" error={a.fieldErrors.recurrenceInterval}>
                <NativeSelect value={v.repeat} onChange={(e) => set("repeat", e.target.value)}>
                  {REPEATS.map((r) => (
                    <option key={r.value} value={r.value}>{r.label}</option>
                  ))}
                </NativeSelect>
              </Field>
              {v.repeat === "custom" && (
                <div className="grid grid-cols-2 gap-2 sm:col-span-2">
                  <Field label="Every" htmlFor="task-interval">
                    <Input type="number" min={1} max={120} value={v.customInterval} onChange={(e) => set("customInterval", e.target.value)} />
                  </Field>
                  <Field label="Unit" htmlFor="task-unit">
                    <NativeSelect value={v.customUnit} onChange={(e) => set("customUnit", e.target.value as IntervalUnit)}>
                      <option value="day">Days</option>
                      <option value="week">Weeks</option>
                      <option value="month">Months</option>
                      <option value="year">Years</option>
                    </NativeSelect>
                  </Field>
                </div>
              )}
              <Field label="Assign to" htmlFor="task-assignee" optional>
                <NativeSelect value={v.assignedTo} onChange={(e) => set("assignedTo", e.target.value)}>
                  <option value="">Anyone</option>
                  {members.map((m) => (
                    <option key={m.user_id} value={m.user_id}>{m.display_name || "Member"}</option>
                  ))}
                </NativeSelect>
              </Field>
              <Field label="Priority" htmlFor="task-priority">
                <NativeSelect value={v.priority} onChange={(e) => set("priority", e.target.value as TaskFormValues["priority"])}>
                  <option value="low">Low</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </NativeSelect>
              </Field>
            </div>
            <Field label="Notes" htmlFor="task-desc" optional>
              <Textarea value={v.description} onChange={(e) => set("description", e.target.value)} rows={2} />
            </Field>
            {v.repeat !== "none" && (
              <p className="text-xs text-fg-muted">When you complete a repeating task, the next one is scheduled from the day you did it.</p>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button type="submit" variant="primary" loading={a.pending}>{taskId ? "Save task" : "Schedule task"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
