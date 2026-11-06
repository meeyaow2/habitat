"use client";

import Link from "next/link";
import * as React from "react";
import { CalendarPlus, Hammer, House, Plus, Upload } from "lucide-react";
import { AssetFormDialog } from "@/features/assets/asset-form";
import { RecordEventDialog } from "@/features/maintenance/complete-dialog";
import { TaskFormDialog } from "@/features/maintenance/task-form";
import type { AssetOption, MemberOption, RoomOption } from "@/features/shared/options";
import { cn } from "@/lib/utils";

type Props = { rooms: RoomOption[]; assets: AssetOption[]; members: MemberOption[]; layout?: "grid" | "row" };

export function QuickActions({ rooms, assets, members, layout = "grid" }: Props) {
  const [open, setOpen] = React.useState<null | "asset" | "task" | "repair">(null);
  const item = "flex min-h-11 items-center gap-2.5 rounded-md border border-line bg-surface px-3 py-2 text-left text-sm font-medium text-fg shadow-xs transition-colors hover:border-line-strong hover:bg-surface-muted [&_svg]:size-4 [&_svg]:text-accent";
  return (
    <>
      <div className={cn(layout === "grid" ? "grid grid-cols-2 gap-2" : "flex flex-wrap gap-2")}>
        <button type="button" className={item} onClick={() => setOpen("asset")}><Plus aria-hidden /> Add appliance</button>
        <Link href="/documents?upload=receipt" className={item}><Upload aria-hidden /> Upload receipt</Link>
        <button type="button" className={item} onClick={() => setOpen("task")}><CalendarPlus aria-hidden /> Create task</button>
        <button type="button" className={item} onClick={() => setOpen("repair")}><Hammer aria-hidden /> Record repair</button>
        <Link href="/home" className={cn(item, layout === "grid" && "col-span-2")}><House aria-hidden /> Open home view</Link>
      </div>
      <AssetFormDialog open={open === "asset"} onOpenChange={(o) => setOpen(o ? "asset" : null)} rooms={rooms} />
      <TaskFormDialog open={open === "task"} onOpenChange={(o) => setOpen(o ? "task" : null)} assets={assets} members={members} />
      <RecordEventDialog open={open === "repair"} onOpenChange={(o) => setOpen(o ? "repair" : null)} assets={assets} />
    </>
  );
}

export function AddAssetButton({ rooms, label = "Add appliance", variant = "primary" }: { rooms: RoomOption[]; label?: string; variant?: "primary" | "secondary" }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "inline-flex h-9 items-center gap-2 rounded-md px-3.5 text-sm font-medium shadow-xs [&_svg]:size-4",
          variant === "primary" ? "bg-accent text-accent-fg hover:bg-accent-hover" : "border border-line bg-surface hover:bg-surface-muted",
        )}
      >
        <Plus aria-hidden /> {label}
      </button>
      <AssetFormDialog open={open} onOpenChange={setOpen} rooms={rooms} />
    </>
  );
}
