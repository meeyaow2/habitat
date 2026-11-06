"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import * as React from "react";
import { Archive, Boxes, Grid2x2, List, MapPin, Search, X } from "lucide-react";
import { CategoryTile } from "@/components/category-icon";
import { Button } from "@/components/ui/button";
import { NativeSelect } from "@/components/ui/input";
import { EmptyState, Panel } from "@/components/ui/misc";
import { Segmented } from "@/components/ui/segmented";
import { CATEGORIES, category } from "@/lib/domain/categories";
import { relativeDays, type ISODate } from "@/lib/domain/dates";
import { formatMoney } from "@/lib/domain/money";
import { taskTiming } from "@/lib/domain/status";
import { cn } from "@/lib/utils";
import { roomLabel, type RoomOption } from "@/features/shared/options";
import type { AssetListItem } from "./queries";
import { AssetStatusBadge, WarrantyBadge } from "./warranty-badge";

const WARRANTY_FILTERS = [
  { value: "", label: "Any warranty" },
  { value: "active", label: "Covered" },
  { value: "expiring", label: "Expiring soon" },
  { value: "expired", label: "Expired" },
  { value: "none", label: "No warranty" },
];

export function AssetBrowser({
  assets,
  rooms,
  today,
  reminderDays,
  currency,
  totalActive,
  categoryCounts,
}: {
  assets: AssetListItem[];
  rooms: RoomOption[];
  today: ISODate;
  reminderDays: number;
  currency: string;
  totalActive: number;
  categoryCounts: Record<string, number>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [q, setQ] = React.useState(params.get("q") ?? "");
  const [view, setView] = React.useState<"list" | "grid">("list");

  // Remembered per browser; read after hydration so server and client markup match.
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem("habitat.assets.view");
      // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is client-only
      if (saved === "grid" || saved === "list") setView(saved);
    } catch {}
  }, []);

  const update = React.useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(params.toString());
      for (const [k, v] of Object.entries(patch)) {
        if (v) next.set(k, v);
        else next.delete(k);
      }
      router.replace(`${pathname}${next.size ? `?${next}` : ""}`, { scroll: false });
    },
    [params, pathname, router],
  );

  // Debounced search → URL (server filters).
  React.useEffect(() => {
    if ((params.get("q") ?? "") === q) return;
    const t = setTimeout(() => update({ q: q || null }), 250);
    return () => clearTimeout(t);
  }, [q, params, update]);

  const archived = params.get("archived") === "1";
  const activeFilters = ["category", "room", "status", "warranty"].filter((k) => params.get(k));
  const usedCategories = CATEGORIES.filter((c) => categoryCounts[c.id]);

  return (
    <div className="flex flex-col gap-4">
      {/* Category chips */}
      {!archived && usedCategories.length > 1 && (
        <nav aria-label="Categories" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          <ul className="flex gap-1.5">
            <li>
              <button
                type="button"
                onClick={() => update({ category: null })}
                aria-pressed={!params.get("category")}
                className="h-8 whitespace-nowrap rounded-full border border-line bg-surface px-3 text-sm text-fg-muted aria-pressed:border-fg aria-pressed:bg-fg aria-pressed:text-fg-inverse"
              >
                All <span className="tabular-nums opacity-70">{totalActive}</span>
              </button>
            </li>
            {usedCategories.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => update({ category: params.get("category") === c.id ? null : c.id })}
                  aria-pressed={params.get("category") === c.id}
                  className="h-8 whitespace-nowrap rounded-full border border-line bg-surface px-3 text-sm text-fg-muted hover:border-line-strong aria-pressed:border-fg aria-pressed:bg-fg aria-pressed:text-fg-inverse"
                >
                  {c.label} <span className="tabular-nums opacity-70">{categoryCounts[c.id]}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>
      )}

      {/* Toolbar */}
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-fg-subtle" aria-hidden />
          <label htmlFor="asset-search" className="sr-only">Search items</label>
          <input
            id="asset-search"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, brand, model, serial or room"
            className="h-10 w-full rounded-md border border-line-input bg-surface pl-9 pr-3 text-base shadow-xs placeholder:text-fg-subtle focus-visible:border-accent focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-accent/20 sm:h-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex">
          <div className="sm:w-40">
            <label htmlFor="f-room" className="sr-only">Room</label>
            <NativeSelect id="f-room" value={params.get("room") ?? ""} onChange={(e) => update({ room: e.target.value || null })}>
              <option value="">All rooms</option>
              <option value="none">No room</option>
              {rooms.map((r) => <option key={r.id} value={r.id}>{roomLabel(r)}</option>)}
            </NativeSelect>
          </div>
          <div className="sm:w-40">
            <label htmlFor="f-warranty" className="sr-only">Warranty</label>
            <NativeSelect id="f-warranty" value={params.get("warranty") ?? ""} onChange={(e) => update({ warranty: e.target.value || null })}>
              {WARRANTY_FILTERS.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
            </NativeSelect>
          </div>
          <div className="sm:w-40">
            <label htmlFor="f-status" className="sr-only">Condition</label>
            <NativeSelect id="f-status" value={params.get("status") ?? ""} onChange={(e) => update({ status: e.target.value || null })}>
              <option value="">Any condition</option>
              <option value="attention">Needs attention</option>
              <option value="active">Working normally</option>
              <option value="in_repair">In repair</option>
              <option value="retired">Retired</option>
            </NativeSelect>
          </div>
          <div className="sm:w-36">
            <label htmlFor="f-sort" className="sr-only">Sort</label>
            <NativeSelect id="f-sort" value={params.get("sort") ?? "name"} onChange={(e) => update({ sort: e.target.value === "name" ? null : e.target.value })}>
              <option value="name">Name A–Z</option>
              <option value="recent">Recently added</option>
              <option value="due">Next maintenance</option>
              <option value="warranty">Warranty ending</option>
              <option value="cost">Upkeep cost</option>
            </NativeSelect>
          </div>
        </div>
        <Segmented
          label="Display"
          value={view}
          onChange={(v) => {
            setView(v);
            try { localStorage.setItem("habitat.assets.view", v); } catch {}
          }}
          options={[
            { value: "list", label: <span className="sr-only sm:not-sr-only">List</span>, icon: <List aria-hidden />, ariaLabel: "List view" },
            { value: "grid", label: <span className="sr-only sm:not-sr-only">Grid</span>, icon: <Grid2x2 aria-hidden />, ariaLabel: "Grid view" },
          ]}
          className="self-start lg:self-auto"
        />
      </div>

      <div className="flex min-h-6 flex-wrap items-center justify-between gap-2 text-sm text-fg-muted">
        <p aria-live="polite">
          {assets.length} {archived ? "archived " : ""}item{assets.length === 1 ? "" : "s"}
          {activeFilters.length > 0 || q ? " match" : ""}
        </p>
        <div className="flex items-center gap-3">
          {(activeFilters.length > 0 || params.get("q")) && (
            <button type="button" onClick={() => { setQ(""); update({ category: null, room: null, status: null, warranty: null, q: null }); }} className="inline-flex items-center gap-1 font-medium text-accent hover:underline">
              <X className="size-3.5" aria-hidden /> Clear filters
            </button>
          )}
          <button type="button" onClick={() => update({ archived: archived ? null : "1" })} className="inline-flex items-center gap-1 font-medium text-fg-muted hover:text-fg">
            <Archive className="size-3.5" aria-hidden /> {archived ? "Show active items" : "Archived"}
          </button>
        </div>
      </div>

      {assets.length === 0 ? (
        <Panel>
          {totalActive === 0 && !archived ? (
            <EmptyState icon={<Boxes />} title="No appliances yet" description="Add the things in your home that need looking after — aircons, fridges, washers, water heaters. Warranties and maintenance follow from there." />
          ) : (
            <EmptyState icon={<Search />} title={archived ? "No archived items" : "Nothing matches"} description={archived ? "Items you archive keep their history and appear here." : "Try a different search or clear the filters."} action={!archived && <Button onClick={() => { setQ(""); update({ category: null, room: null, status: null, warranty: null, q: null }); }}>Clear filters</Button>} />
          )}
        </Panel>
      ) : view === "list" ? (
        <Panel className="overflow-hidden">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">Appliances and assets</caption>
            <thead className="hidden border-b border-line bg-surface-muted/60 text-xs text-fg-muted md:table-header-group">
              <tr>
                <th scope="col" className="px-5 py-2.5 font-medium">Item</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Room</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Warranty</th>
                <th scope="col" className="px-3 py-2.5 font-medium">Next maintenance</th>
                <th scope="col" className="px-5 py-2.5 text-right font-medium">Upkeep</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {assets.map((a) => (
                <tr key={a.id} className="group relative block hover:bg-surface-muted/50 md:table-row">
                  <td className="block px-4 pb-1 pt-3 md:table-cell md:px-5 md:py-3">
                    <div className="flex items-center gap-3">
                      <CategoryTile categoryId={a.category_id} tone={a.status === "needs_attention" ? "danger" : "neutral"} />
                      <div className="min-w-0">
                        <Link href={`/assets/${a.id}`} className="block truncate font-medium text-fg after:absolute after:inset-0 hover:underline">
                          {a.name}
                        </Link>
                        <p className="truncate text-xs text-fg-muted">{[a.brand, a.model].filter(Boolean).join(" ") || category(a.category_id).label}</p>
                      </div>
                      <span className="ml-auto md:hidden"><AssetStatusBadge status={a.status} /></span>
                    </div>
                  </td>
                  <td className="inline-block pl-[60px] pr-2 text-xs text-fg-muted md:table-cell md:px-3 md:text-sm">
                    <span className="inline-flex items-center gap-1">
                      {a.room_name ?? <span className="text-fg-subtle">No room</span>}
                      {a.placed && <MapPin className="size-3 text-accent" aria-label="Placed on floor plan" />}
                    </span>
                  </td>
                  <td className="inline-block px-1 pb-3 md:table-cell md:px-3 md:py-3">
                    <WarrantyBadge expiresOn={a.warranty_expires_on} today={today} reminderDays={reminderDays} />
                  </td>
                  <td className="hidden px-3 md:table-cell">
                    {a.next_due_on ? (
                      <span className={cn("text-sm", taskTiming({ due_on: a.next_due_on, status: "open" }, today) === "overdue" ? "font-medium text-danger" : "text-fg-muted")}>
                        {taskTiming({ due_on: a.next_due_on, status: "open" }, today) === "overdue" ? "Overdue" : relativeDays(a.next_due_on, today)}
                      </span>
                    ) : (
                      <span className="text-sm text-fg-subtle">None scheduled</span>
                    )}
                    <span className="ml-2 hidden lg:inline"><AssetStatusBadge status={a.status} /></span>
                  </td>
                  <td className="hidden px-5 text-right tabular-nums text-fg-muted md:table-cell">{a.lifetime_cost_cents ? formatMoney(a.lifetime_cost_cents, currency) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Panel>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {assets.map((a) => (
            <li key={a.id}>
              <Link href={`/assets/${a.id}`} className="flex h-full flex-col rounded-lg border border-line bg-surface p-4 shadow-xs transition-colors hover:border-line-strong">
                <div className="flex items-start gap-3">
                  <CategoryTile categoryId={a.category_id} size="lg" tone={a.status === "needs_attention" ? "danger" : "neutral"} />
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{a.name}</p>
                    <p className="truncate text-xs text-fg-muted">{[a.brand, a.model].filter(Boolean).join(" ") || category(a.category_id).label}</p>
                    <p className="mt-1 flex items-center gap-1 text-xs text-fg-muted">
                      {a.room_name ?? "No room"}
                      {a.placed && <MapPin className="size-3 text-accent" aria-label="Placed on floor plan" />}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-1.5">
                  <WarrantyBadge expiresOn={a.warranty_expires_on} today={today} reminderDays={reminderDays} />
                  <AssetStatusBadge status={a.status} />
                  {a.overdue_tasks > 0 && <span className="text-xs font-medium text-danger">{a.overdue_tasks} overdue</span>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
