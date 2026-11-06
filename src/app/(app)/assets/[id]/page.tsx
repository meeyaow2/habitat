import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, FileText, History, Info, Upload } from "lucide-react";
import { CategoryTile } from "@/components/category-icon";
import { Badge } from "@/components/ui/badge";
import { EmptyState, Notice, PageHeader, Panel, PanelHeader } from "@/components/ui/misc";
import { withUser } from "@/lib/db";
import { category } from "@/lib/domain/categories";
import { daysBetween, formatDate, relativeDays } from "@/lib/domain/dates";
import { GUIDANCE_DISCLAIMER, guidanceFor } from "@/lib/domain/guidance";
import { formatMoney } from "@/lib/domain/money";
import { warrantyLabels, warrantyState } from "@/lib/domain/status";
import { requireHouseholdContext } from "@/lib/server/context";
import { AssetActions } from "@/features/assets/asset-actions";
import { assetToForm } from "@/features/assets/form-values";
import { getAsset, listAssetOptions, listRooms } from "@/features/assets/queries";
import { AssetStatusBadge } from "@/features/assets/warranty-badge";
import { listMembers } from "@/features/maintenance/queries";
import { TaskList } from "@/features/maintenance/task-list";
import { SuggestedSchedules } from "@/features/maintenance/suggested-schedules";

export const metadata: Metadata = { title: "Item" };

const EVENT_LABEL: Record<string, string> = { completed: "Maintenance", service: "Service", repair: "Repair", inspection: "Inspection", note: "Note" };

export default async function AssetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const ctx = await requireHouseholdContext();
  const data = await withUser(ctx.user.id, async (tx) => {
    const detail = await getAsset(tx, ctx.household.id, id, ctx.today);
    if (!detail) return null;
    const [rooms, assets, members] = await Promise.all([listRooms(tx, ctx.household.id), listAssetOptions(tx, ctx.household.id), listMembers(tx, ctx.household.id)]);
    return { ...detail, rooms, assets, members };
  });
  if (!data) notFound();
  const { asset, warranties, tasks, events, documents } = data;
  const currency = ctx.household.currency;
  const reminder = ctx.household.warranty_reminder_days;
  const primary = warranties[0] ?? null;
  const ws = warrantyState(asset.warranty_expires_on, ctx.today, reminder);
  const openTasks = tasks.filter((t) => t.status === "open");
  const existingTitles = new Set(tasks.map((t) => t.title.toLowerCase()));
  const suggestions = asset.archived_at ? [] : guidanceFor(asset.category_id).filter((g) => !existingTitles.has(g.title.toLowerCase()));
  const ageYears = asset.purchase_date ? (daysBetween(asset.purchase_date, ctx.today) / 365).toFixed(1) : null;
  const canDelete = ctx.role === "owner" || asset.created_by === ctx.user.id;

  const facts: [string, React.ReactNode][] = [
    ["Category", category(asset.category_id).label],
    ["Brand", asset.brand ?? "—"],
    ["Model", asset.model ?? "—"],
    ["Serial number", asset.serial_number ? <span className="font-mono text-xs">{asset.serial_number}</span> : "—"],
    ["Room", asset.room_name ?? "Not assigned"],
    ["Purchased", asset.purchase_date ? `${formatDate(asset.purchase_date)}${ageYears ? ` · ${ageYears} yrs ago` : ""}` : "—"],
    ["Price", formatMoney(asset.purchase_price_cents, currency)],
    ["Store", asset.vendor ?? "—"],
    ["Added by", asset.created_by_name ?? "—"],
  ];

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <Link href="/assets" className="mb-4 inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg">
        <ChevronLeft className="size-4" aria-hidden /> Appliances & Assets
      </Link>
      {asset.archived_at && <Notice tone="neutral" className="mb-4">This item is archived. It keeps its history but is hidden from your plan, reminders and totals.</Notice>}
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <CategoryTile categoryId={asset.category_id} size="lg" tone={asset.status === "needs_attention" ? "danger" : "neutral"} />
          <div className="min-w-0">
            <PageHeader
              title={asset.name}
              description={
                <span className="flex flex-wrap items-center gap-2">
                  <span>{[asset.brand, asset.model].filter(Boolean).join(" · ") || category(asset.category_id).label}</span>
                  {asset.room_name && <span className="text-fg-subtle">· {asset.room_name}{asset.floor_name && asset.placed ? "" : ""}</span>}
                  <AssetStatusBadge status={asset.status} />
                </span>
              }
            />
          </div>
        </div>
        <AssetActions
          asset={{ id: asset.id, name: asset.name, status: asset.status, archived: !!asset.archived_at, placed: asset.placed }}
          form={assetToForm(asset, primary)}
          rooms={data.rooms}
          assets={data.assets}
          members={data.members}
          canDelete={canDelete}
        />
      </div>
      {asset.notes && <Notice tone={asset.status === "needs_attention" ? "danger" : "neutral"} className="-mt-2 mb-6">{asset.notes}</Notice>}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-8">
          <Panel>
            <PanelHeader title="Maintenance" description={openTasks.length ? `${openTasks.length} scheduled` : undefined} />
            {openTasks.length === 0 && suggestions.length === 0 ? (
              <p className="px-4 pb-5 text-sm text-fg-muted sm:px-5">Nothing scheduled for this item.</p>
            ) : (
              <TaskList tasks={openTasks} today={ctx.today} assets={data.assets} members={data.members} showAsset={false} emptyText="Nothing scheduled for this item." />
            )}
            {suggestions.length > 0 && (
              <div className="border-t border-line px-4 py-4 sm:px-5">
                <SuggestedSchedules assetId={asset.id} suggestions={suggestions} today={ctx.today} disclaimer={GUIDANCE_DISCLAIMER} />
              </div>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Service history" description={events.length ? `${events.length} record${events.length === 1 ? "" : "s"}` : undefined} />
            {events.length === 0 ? (
              <EmptyState compact icon={<History />} title="No history yet" description="Completed tasks, services and repairs for this item build up here." />
            ) : (
              <ol className="relative mx-4 mb-4 border-l border-line pl-5 sm:mx-5">
                {events.map((e) => (
                  <li key={e.id} className="relative pb-5 last:pb-1">
                    <span className={`absolute -left-[25px] top-1.5 size-2.5 rounded-full ring-4 ring-surface ${e.kind === "repair" ? "bg-warning" : "bg-accent"}`} aria-hidden />
                    <div className="flex flex-wrap items-baseline justify-between gap-x-3">
                      <p className="text-sm font-medium">{e.title}</p>
                      <p className="text-xs tabular-nums text-fg-muted">{formatDate(e.performed_on)}</p>
                    </div>
                    <p className="mt-0.5 flex flex-wrap gap-x-2 text-xs text-fg-muted">
                      <Badge tone={e.kind === "repair" ? "warning" : "neutral"}>{EVENT_LABEL[e.kind]}</Badge>
                      {e.vendor && <span>{e.vendor}</span>}
                      {e.cost_cents !== null && <span className="tabular-nums">{formatMoney(e.cost_cents, currency)}</span>}
                      {e.performed_by_name && <span>· logged by {e.performed_by_name.split(" ")[0]}</span>}
                    </p>
                    {e.notes && <p className="mt-1 text-sm text-fg-muted">{e.notes}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Panel>

          <Panel>
            <PanelHeader
              title="Documents"
              action={<Link href={`/documents?upload=receipt&asset=${asset.id}`} className="inline-flex items-center gap-1.5 text-sm font-medium text-accent hover:underline"><Upload className="size-3.5" aria-hidden /> Upload</Link>}
            />
            {documents.length === 0 ? (
              <EmptyState compact icon={<FileText />} title="No documents linked" description="Upload the receipt, warranty card or manual so it’s here when you need it." />
            ) : (
              <ul className="px-2 pb-2">
                {documents.map((d) => (
                  <li key={d.id}>
                    <Link href={`/documents?doc=${d.id}`} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-surface-muted">
                      <FileText className="size-4 text-fg-subtle" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{d.title}</span>
                      <span className="text-xs capitalize text-fg-muted">{d.kind.replace("_", " ")}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:col-span-4">
          <Panel>
            <PanelHeader title="Warranty" />
            <div className="px-4 pb-5 sm:px-5">
              {primary ? (
                <>
                  <p className={`text-lg font-semibold ${ws === "expiring" ? "text-warning" : ws === "expired" ? "text-fg-muted" : "text-success"}`}>
                    {warrantyLabels[ws]}
                  </p>
                  <p className="text-sm text-fg-muted">
                    {ws === "expired" ? "Ended" : "Ends"} {formatDate(asset.warranty_expires_on)} · {relativeDays(asset.warranty_expires_on!, ctx.today)}
                  </p>
                  <dl className="mt-4 space-y-2 text-sm">
                    {warranties.map((w) => (
                      <div key={w.id} className="rounded-md border border-line p-3">
                        <dt className="font-medium">{w.kind.charAt(0).toUpperCase() + w.kind.slice(1)} warranty{w.provider ? ` · ${w.provider}` : ""}</dt>
                        <dd className="text-fg-muted">{w.starts_on ? `${formatDate(w.starts_on)} – ` : "Until "}{formatDate(w.expires_on)}</dd>
                        {w.terms && <dd className="mt-1 whitespace-pre-line text-xs text-fg-muted">{w.terms}</dd>}
                      </div>
                    ))}
                  </dl>
                  {ws === "expired" && (
                    <p className="mt-3 flex gap-1.5 text-xs text-fg-muted">
                      <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                      An expired manufacturer’s warranty doesn’t necessarily end your rights — consumer protection laws (such as Singapore’s Lemon Law) may still apply.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm text-fg-muted">No warranty recorded. Edit this item to add the expiry date and get a reminder before it ends.</p>
              )}
            </div>
          </Panel>

          <Panel>
            <PanelHeader title="Costs" />
            <dl className="grid grid-cols-2 gap-px border-t border-line bg-line">
              <div className="bg-surface px-4 py-3 sm:px-5">
                <dt className="text-xs text-fg-muted">Purchase</dt>
                <dd className="text-lg font-semibold tabular-nums">{formatMoney(asset.purchase_price_cents, currency)}</dd>
              </div>
              <div className="bg-surface px-4 py-3 sm:px-5">
                <dt className="text-xs text-fg-muted">Upkeep to date</dt>
                <dd className="text-lg font-semibold tabular-nums">{formatMoney(asset.lifetime_cost_cents, currency)}</dd>
              </div>
            </dl>
            <p className="px-4 py-3 text-xs text-fg-muted sm:px-5">Upkeep includes servicing, repairs and parts linked to this item. <Link href={`/expenses?asset=${asset.id}`} className="font-medium text-accent hover:underline">See expenses</Link></p>
          </Panel>

          <Panel>
            <PanelHeader title="Details" />
            <dl className="divide-y divide-line px-4 pb-2 sm:px-5">
              {facts.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 py-2 text-sm">
                  <dt className="text-fg-muted">{k}</dt>
                  <dd className="min-w-0 text-right">{v}</dd>
                </div>
              ))}
            </dl>
          </Panel>
        </div>
      </div>
    </div>
  );
}
