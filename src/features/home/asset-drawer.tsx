"use client";

import Link from "next/link";
import * as React from "react";
import { Dialog as D } from "radix-ui";
import { ArrowRight, CalendarPlus, Check, FileText, Hammer, MapPin, X } from "lucide-react";
import { CategoryTile } from "@/components/category-icon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Notice, Skeleton } from "@/components/ui/misc";
import { category } from "@/lib/domain/categories";
import { formatDate, relativeDays } from "@/lib/domain/dates";
import { formatMoney } from "@/lib/domain/money";
import { taskTiming, warrantyLabels, warrantyState } from "@/lib/domain/status";
import { cn } from "@/lib/utils";
import { CompleteTaskDialog, RecordEventDialog } from "@/features/maintenance/complete-dialog";
import { emptyTask, TaskFormDialog } from "@/features/maintenance/task-form";
import type { AssetOption, MemberOption } from "@/features/shared/options";
import type { TaskRow } from "@/features/assets/queries";
import { getAssetPanelAction } from "./actions";

type Panel = Extract<Awaited<ReturnType<typeof getAssetPanelAction>>, { ok: true }>["data"];

/**
 * Non-modal side drawer showing the live asset record for a marker on the
 * plan. Clicking another marker swaps its content; the plan stays usable.
 */
export function AssetDrawer({
  assetId,
  onClose,
  onEditPosition,
  assets,
  members,
  refreshKey,
}: {
  assetId: string | null;
  onClose: () => void;
  onEditPosition: (assetId: string) => void;
  assets: AssetOption[];
  members: MemberOption[];
  refreshKey: unknown;
}) {
  const [data, setData] = React.useState<Panel | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [dialog, setDialog] = React.useState<null | "task" | "repair">(null);
  const [completing, setCompleting] = React.useState<TaskRow | null>(null);

  React.useEffect(() => {
    if (!assetId) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    getAssetPanelAction({ id: assetId })
      .then((res) => {
        if (cancelled) return;
        if (res.ok) setData(res.data);
        else setError(res.error);
      })
      .catch(() => !cancelled && setError("We couldn’t load this item. Check your connection and try again."))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [assetId, refreshKey]);

  const a = data?.asset;
  const current = a && a.id === assetId;

  return (
    <D.Root open={!!assetId} onOpenChange={(o) => !o && onClose()} modal={false}>
      <D.Portal>
        <D.Content
          onInteractOutside={(e) => e.preventDefault()}
          onOpenAutoFocus={(e) => e.preventDefault()}
          className={cn(
            "fixed z-40 flex flex-col border-line bg-surface shadow-lg focus:outline-none",
            "inset-x-0 bottom-[calc(64px+env(safe-area-inset-bottom))] max-h-[62dvh] rounded-t-lg border-t data-[state=open]:animate-slide-in-bottom",
            "md:inset-y-0 md:bottom-0 md:left-auto md:right-0 md:max-h-none md:w-[400px] md:rounded-none md:border-l md:border-t-0 md:data-[state=open]:animate-slide-in-right",
          )}
          aria-describedby={undefined}
        >
          <div className="flex items-start gap-3 border-b border-line px-5 py-4">
            {current ? <CategoryTile categoryId={a.category_id} tone={a.status === "needs_attention" ? "danger" : "neutral"} /> : <Skeleton className="size-9" />}
            <div className="min-w-0 flex-1">
              <D.Title className="truncate text-lg font-semibold">{current ? a.name : "Loading…"}</D.Title>
              {current && (
                <p className="truncate text-sm text-fg-muted">
                  {[a.brand, a.model].filter(Boolean).join(" ") || category(a.category_id).label}
                </p>
              )}
            </div>
            <D.Close className="-mr-1.5 grid size-8 shrink-0 place-items-center rounded-md text-fg-muted hover:bg-surface-muted hover:text-fg" aria-label="Close details">
              <X className="size-4" />
            </D.Close>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto">
            {error ? (
              <div className="p-5"><Notice tone="danger">{error}</Notice></div>
            ) : !current ? (
              <div className="space-y-3 p-5" aria-busy="true" aria-label="Loading item">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-24 w-full" />
              </div>
            ) : (
              <DrawerBody data={data!} onTask={() => setDialog("task")} onRepair={() => setDialog("repair")} onComplete={setCompleting} onEditPosition={() => onEditPosition(a.id)} />
            )}
          </div>
        </D.Content>
      </D.Portal>
      {current && (
        <>
          <TaskFormDialog open={dialog === "task"} onOpenChange={(o) => setDialog(o ? "task" : null)} assets={assets} members={members} initial={emptyTask({ assetId: a.id })} />
          <RecordEventDialog open={dialog === "repair"} onOpenChange={(o) => setDialog(o ? "repair" : null)} assets={assets} defaultAssetId={a.id} />
          <CompleteTaskDialog task={completing} onOpenChange={(o) => !o && setCompleting(null)} />
        </>
      )}
    </D.Root>
  );
}

function DrawerBody({ data, onTask, onRepair, onComplete, onEditPosition }: { data: Panel; onTask: () => void; onRepair: () => void; onComplete: (t: TaskRow) => void; onEditPosition: () => void }) {
  const { asset: a, tasks, events, documents, today, reminderDays, currency } = data;
  const ws = warrantyState(a.warranty_expires_on, today, reminderDays);
  return (
    <div className="flex flex-col">
      <dl className="grid grid-cols-2 gap-px border-b border-line bg-line text-sm">
        {[
          ["Location", a.room_name ?? "No room"],
          ["Purchased", a.purchase_date ? formatDate(a.purchase_date) : "—"],
          ["Warranty", ws === "none" ? "None recorded" : `${warrantyLabels[ws]}`],
          [ws === "expired" ? "Ended" : "Ends", a.warranty_expires_on ? `${formatDate(a.warranty_expires_on)}` : "—"],
        ].map(([k, v]) => (
          <div key={k} className="bg-surface px-5 py-2.5">
            <dt className="text-xs text-fg-muted">{k}</dt>
            <dd className={cn("font-medium", k === "Warranty" && ws === "expiring" && "text-warning", k === "Warranty" && ws === "active" && "text-success")}>{v}</dd>
          </div>
        ))}
      </dl>
      {(a.status === "needs_attention" || a.status === "in_repair") && (
        <div className="px-5 pt-4"><Notice tone="danger" title={a.status === "in_repair" ? "In repair" : "Needs attention"}>{a.notes ?? "Flagged by a household member."}</Notice></div>
      )}

      <section className="px-5 py-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Upcoming maintenance</h3>
        {tasks.length === 0 ? (
          <p className="text-sm text-fg-muted">Nothing scheduled.</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {tasks.map((t) => {
              const timing = taskTiming(t, today);
              return (
                <li key={t.id} className="flex items-center gap-2.5 rounded-md border border-line px-3 py-2">
                  <button type="button" onClick={() => onComplete(t)} aria-label={`Mark “${t.title}” as done`} className="grid size-5 shrink-0 place-items-center rounded-full border-[1.5px] border-line-input text-transparent hover:border-accent hover:text-accent">
                    <Check className="size-3" strokeWidth={3} />
                  </button>
                  <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                  <span className={cn("shrink-0 text-xs font-medium", timing === "overdue" ? "text-danger" : timing === "due_soon" ? "text-warning" : "text-fg-muted")}>
                    {timing === "overdue" ? "Overdue" : relativeDays(t.due_on, today)}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="border-t border-line px-5 py-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Recent service</h3>
        {events.length === 0 ? (
          <p className="text-sm text-fg-muted">No service history yet.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {events.map((e) => (
              <li key={e.id} className="flex justify-between gap-3 text-sm">
                <span className="min-w-0">
                  <span className="block truncate">{e.title}</span>
                  <span className="text-xs text-fg-muted">{formatDate(e.performed_on)}{e.vendor ? ` · ${e.vendor}` : ""}</span>
                </span>
                {e.cost_cents !== null && <span className="shrink-0 tabular-nums text-fg-muted">{formatMoney(e.cost_cents, currency)}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="border-t border-line px-5 py-4">
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-fg-subtle">Documents</h3>
        {documents.length === 0 ? (
          <p className="text-sm text-fg-muted">
            No receipt or manual yet. <Link href={`/documents?upload=receipt&asset=${a.id}`} className="font-medium text-accent hover:underline">Upload one</Link>
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {documents.map((d) => (
              <li key={d.id}>
                <Link href={`/documents?doc=${d.id}`} className="flex items-center gap-2 rounded-sm py-1 text-sm hover:underline">
                  <FileText className="size-4 text-fg-subtle" aria-hidden /> <span className="truncate">{d.title}</span>
                  <Badge className="ml-auto capitalize">{d.kind.replace("_", " ")}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="sticky bottom-0 mt-auto grid grid-cols-2 gap-2 border-t border-line bg-surface p-4">
        <Button variant="secondary" onClick={onTask}><CalendarPlus aria-hidden /> Schedule</Button>
        <Button variant="secondary" onClick={onRepair}><Hammer aria-hidden /> Record repair</Button>
        <Button variant="secondary" onClick={onEditPosition}><MapPin aria-hidden /> Move</Button>
        <Button variant="primary" asChild><Link href={`/assets/${a.id}`}>Full details <ArrowRight aria-hidden /></Link></Button>
      </div>
    </div>
  );
}
