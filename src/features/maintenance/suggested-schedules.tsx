"use client";

import * as React from "react";
import { Info, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { addInterval, describeInterval, type ISODate } from "@/lib/domain/dates";
import type { Guidance } from "@/lib/domain/guidance";
import { useAction } from "@/lib/client/use-action";
import { createTasksAction } from "./actions";

/** One-click schedules from general guidance. Intervals are editable afterwards. */
export function SuggestedSchedules({ assetId, suggestions, today, disclaimer }: { assetId: string; suggestions: Guidance[]; today: ISODate; disclaimer: string }) {
  const add = useAction(createTasksAction, { success: (d) => `${d.count} task${d.count === 1 ? "" : "s"} scheduled` });
  const toTask = (g: Guidance) => ({
    title: g.title,
    description: g.why,
    assetId,
    assignedTo: null,
    dueOn: addInterval(today, g.interval, g.unit),
    priority: "normal" as const,
    recurrenceInterval: g.interval,
    recurrenceUnit: g.unit,
    source: "general_guidance" as const,
  });
  return (
    <div>
      <p className="flex items-center gap-1.5 text-sm font-semibold"><Sparkles className="size-4 text-accent" aria-hidden /> Suggested schedules</p>
      <ul className="mt-2 space-y-2">
        {suggestions.map((g) => (
          <li key={g.title} className="flex items-start justify-between gap-3 rounded-md border border-line p-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">{g.title} <span className="font-normal text-fg-muted">· {describeInterval(g.interval, g.unit).toLowerCase()}</span></p>
              <p className="text-xs text-fg-muted">{g.why}{g.professional ? " Use a qualified technician." : ""}</p>
            </div>
            <Button size="sm" variant="soft" loading={add.pending} onClick={() => add.run({ tasks: [toTask(g)] })}><Plus aria-hidden /> Add</Button>
          </li>
        ))}
      </ul>
      <p className="mt-2 flex gap-1.5 text-[11px] leading-4 text-fg-subtle"><Info className="mt-px size-3 shrink-0" aria-hidden /> {disclaimer}</p>
    </div>
  );
}
