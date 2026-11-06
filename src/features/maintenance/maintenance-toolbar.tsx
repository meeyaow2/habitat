"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { CalendarPlus, Hammer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Segmented } from "@/components/ui/segmented";
import type { AssetOption, MemberOption } from "@/features/shared/options";
import { RecordEventDialog } from "./complete-dialog";
import { TaskFormDialog } from "./task-form";

export function MaintenanceActions({ assets, members, openNew }: { assets: AssetOption[]; members: MemberOption[]; openNew?: boolean }) {
  const [open, setOpen] = React.useState<null | "task" | "event">(openNew ? "task" : null);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen("event")}><Hammer aria-hidden /> Record repair</Button>
      <Button variant="primary" onClick={() => setOpen("task")}><CalendarPlus aria-hidden /> New task</Button>
      <TaskFormDialog open={open === "task"} onOpenChange={(o) => setOpen(o ? "task" : null)} assets={assets} members={members} />
      <RecordEventDialog open={open === "event"} onOpenChange={(o) => setOpen(o ? "event" : null)} assets={assets} />
    </>
  );
}

export function MaintenanceTabs({ view, mine }: { view: string; mine: boolean }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const set = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    next.delete("task");
    router.replace(`${pathname}?${next}`, { scroll: false });
  };
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
      <Segmented
        label="View"
        value={view === "overdue" ? "upcoming" : view}
        onChange={(v) => set({ view: v === "upcoming" ? null : v, month: null })}
        options={[
          { value: "upcoming", label: "Upcoming" },
          { value: "calendar", label: "Calendar" },
          { value: "history", label: "History" },
        ]}
      />
      {view !== "history" && (
        <label className="flex items-center gap-2 text-sm text-fg-muted">
          <input type="checkbox" className="size-4 accent-[var(--accent)]" checked={mine} onChange={(e) => set({ mine: e.target.checked ? "1" : null })} />
          Assigned to me
        </label>
      )}
    </div>
  );
}

export function MonthNav({ month, prev, next, label }: { month: string; prev: string; next: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <Button asChild variant="ghost" size="icon-sm"><Link href={`?view=calendar&month=${prev}`} aria-label="Previous month">‹</Link></Button>
      <span className="min-w-28 text-center text-sm font-semibold" aria-live="polite" data-month={month}>{label}</span>
      <Button asChild variant="ghost" size="icon-sm"><Link href={`?view=calendar&month=${next}`} aria-label="Next month">›</Link></Button>
    </div>
  );
}
