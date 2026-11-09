"use client";

import { FileText, MapPin, ShieldCheck, Wrench, X } from "lucide-react";
import { CategoryTile } from "@/components/category-icon";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/misc";
import { cn } from "@/lib/utils";
import type { GuestAsset } from "./data";

export function GuestApplianceDetails({ asset, onClose, onMove }: { asset: GuestAsset | null; onClose: () => void; onMove: () => void }) {
  if (!asset) return null;
  return (
    <aside aria-label={`${asset.name} details`} className="fixed inset-x-0 bottom-0 z-40 max-h-[70dvh] overflow-y-auto rounded-t-xl border-t border-line bg-surface shadow-xl md:relative md:inset-auto md:z-0 md:h-full md:max-h-none md:w-[380px] md:shrink-0 md:rounded-none md:border-l md:border-t-0 md:shadow-none">
      <div className="sticky top-0 flex items-start gap-3 border-b border-line bg-surface px-5 py-4">
        <CategoryTile categoryId={asset.categoryId} tone={asset.warrantyTone === "warning" ? "danger" : "neutral"} />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold">{asset.name}</h2>
          <p className="truncate text-sm text-fg-muted">{[asset.brand, asset.model].filter(Boolean).join(" ") || "Guest appliance"}</p>
        </div>
        <button type="button" onClick={onClose} className="grid size-8 place-items-center rounded-md text-fg-muted hover:bg-surface-muted" aria-label="Close details"><X className="size-4" /></button>
      </div>

      <dl className="grid grid-cols-2 gap-px border-b border-line bg-line text-sm">
        {[["Location", asset.room], ["Purchased", asset.purchased], ["Warranty", asset.warrantyTone === "none" ? "None recorded" : asset.warrantyTone === "warning" ? "Ending soon" : "Active"], ["Ends", asset.warranty]].map(([term, value]) => (
          <div key={term} className="bg-surface px-5 py-3"><dt className="text-xs text-fg-muted">{term}</dt><dd className={cn("font-medium", term === "Warranty" && asset.warrantyTone === "warning" && "text-warning", term === "Warranty" && asset.warrantyTone === "active" && "text-success")}>{value}</dd></div>
        ))}
      </dl>
      {asset.note && <div className="px-5 pt-4"><Notice tone="danger" title="Needs attention">{asset.note}</Notice></div>}

      <section className="px-5 py-4">
        <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle"><Wrench className="size-3.5" /> Upcoming maintenance</h3>
        {asset.maintenance.length ? <ul className="space-y-2">{asset.maintenance.map((task) => <li key={task.title} className="rounded-md border border-line px-3 py-2 text-sm"><span className="block font-medium">{task.title}</span><span className="text-xs text-fg-muted">{task.due}</span></li>)}</ul> : <p className="text-sm text-fg-muted">Nothing scheduled.</p>}
      </section>
      <section className="border-t border-line px-5 py-4">
        <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle"><ShieldCheck className="size-3.5" /> Recent service</h3>
        {asset.service.length ? <ul className="space-y-2">{asset.service.map((event) => <li key={`${event.title}-${event.date}`} className="text-sm"><span className="block font-medium">{event.title}</span><span className="text-xs text-fg-muted">{event.date} · {event.vendor}</span></li>)}</ul> : <p className="text-sm text-fg-muted">No service history yet.</p>}
      </section>
      <section className="border-t border-line px-5 py-4">
        <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle"><FileText className="size-3.5" /> Documents</h3>
        <p className="text-sm">{asset.document ?? "No receipt or manual yet."}</p>
      </section>
      <div className="sticky bottom-0 border-t border-line bg-surface p-4"><Button variant="secondary" className="w-full" onClick={onMove}><MapPin aria-hidden /> Move on plan</Button></div>
    </aside>
  );
}
