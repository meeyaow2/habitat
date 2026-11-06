import type { Metadata } from "next";
import Link from "next/link";
import { Receipt } from "lucide-react";
import { CategoryTile } from "@/components/category-icon";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Panel, PanelHeader } from "@/components/ui/misc";
import { withUser } from "@/lib/db";
import { formatDate, formatMonth } from "@/lib/domain/dates";
import { formatMoney } from "@/lib/domain/money";
import { requireHouseholdContext } from "@/lib/server/context";
import { listAssetOptions } from "@/features/assets/queries";
import { ExpenseFiltersBar, ExpenseRowMenu, ExpenseToolbar } from "@/features/expenses/expense-ui";
import { EXPENSE_LABELS, expenseAnalytics, listExpenses, periodRange } from "@/features/expenses/queries";

export const metadata: Metadata = { title: "Expenses" };

type SP = { period?: string; category?: string; asset?: string };

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await requireHouseholdContext();
  const period = ["month", "3m", "12m", "last-year", "all"].includes(sp.period ?? "") ? sp.period! : "year";
  const range = periodRange(period, ctx.today);
  const category = sp.category && EXPENSE_LABELS[sp.category] ? sp.category : "";
  const assetId = sp.asset && /^[0-9a-f-]{36}$/i.test(sp.asset) ? sp.asset : "";
  const filters = { from: range.from, to: range.to, category: category || undefined, assetId: assetId || undefined };
  const currency = ctx.household.currency;

  const { rows, stats, assets } = await withUser(ctx.user.id, async (tx) => ({
    rows: await listExpenses(tx, ctx.household.id, filters),
    stats: await expenseAnalytics(tx, ctx.household.id, filters),
    assets: await listAssetOptions(tx, ctx.household.id),
  }));
  const qs = new URLSearchParams({ period, ...(category && { category }), ...(assetId && { asset: assetId }) });
  const maxCat = Math.max(1, ...stats.byCategory.map((c) => c.total));
  const maxMonth = Math.max(1, ...stats.byMonth.map((m) => m.purchases + m.upkeep));
  const maxAsset = Math.max(1, ...stats.topAssets.map((a) => a.upkeep));

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title="Expenses"
        description="What your home costs — purchases, servicing, repairs and renovation. Totals are calculated exactly from your records."
        actions={<ExpenseToolbar assets={assets} exportHref={`/api/expenses/export?${qs}`} />}
      />
      <ExpenseFiltersBar assets={assets} period={period} category={category} assetId={assetId} />

      <dl className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {[
          ["Total", stats.totals.total, `${range.label} · ${stats.totals.count} entr${stats.totals.count === 1 ? "y" : "ies"}`],
          ["Upkeep", stats.totals.upkeep, "Servicing, repairs, parts, renovation"],
          ["Purchases", stats.totals.purchases, "Appliances and items"],
          ["Upkeep share", null, "Upkeep as a share of all spending"],
        ].map(([label, value, hint]) => (
          <div key={label as string} className="rounded-lg border border-line bg-surface p-4 shadow-xs">
            <dt className="text-xs text-fg-muted">{label}</dt>
            <dd className="mt-1 text-2xl font-semibold tabular-nums">{value === null ? (stats.totals.total ? `${Math.round((stats.totals.upkeep / stats.totals.total) * 100)}%` : "—") : formatMoney(value as number, currency)}</dd>
            <dd className="mt-0.5 text-xs text-fg-subtle">{hint}</dd>
          </div>
        ))}
      </dl>

      {stats.totals.count === 0 ? (
        <Panel>
          <EmptyState icon={<Receipt />} title="No expenses in this period" description="Costs you record when completing maintenance or repairs appear here automatically. You can also add expenses directly." />
        </Panel>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          <div className="flex min-w-0 flex-col gap-6 lg:col-span-8">
            {stats.byMonth.length > 1 && (
              <Panel>
                <PanelHeader
                  title="Monthly spending"
                  action={
                    <span className="flex gap-3 text-xs text-fg-muted">
                      <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-xs bg-accent" aria-hidden /> Upkeep</span>
                      <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-xs bg-[#c9d6cd]" aria-hidden /> Purchases</span>
                    </span>
                  }
                />
                <div className="flex h-44 items-end gap-1.5 px-4 pb-2 sm:gap-2 sm:px-5" aria-hidden>
                  {stats.byMonth.map((m) => (
                    <div key={m.month} className="flex min-w-0 flex-1 flex-col items-center gap-1" title={`${formatMonth(m.month)}: upkeep ${formatMoney(m.upkeep, currency)}, purchases ${formatMoney(m.purchases, currency)}`}>
                      <div className="flex w-full max-w-9 flex-col-reverse overflow-hidden rounded-t-[3px]" style={{ height: `${((m.purchases + m.upkeep) / maxMonth) * 140}px` }}>
                        <div className="bg-accent" style={{ height: `${(m.upkeep / Math.max(1, m.purchases + m.upkeep)) * 100}%` }} />
                        <div className="flex-1 bg-[#c9d6cd]" />
                      </div>
                      <span className="text-[10px] text-fg-muted">{formatMonth(m.month).split(" ")[0]}</span>
                    </div>
                  ))}
                </div>
                <table className="sr-only">
                  <caption>Monthly spending</caption>
                  <thead><tr><th>Month</th><th>Upkeep</th><th>Purchases</th></tr></thead>
                  <tbody>{stats.byMonth.map((m) => <tr key={m.month}><td>{formatMonth(m.month)}</td><td>{formatMoney(m.upkeep, currency)}</td><td>{formatMoney(m.purchases, currency)}</td></tr>)}</tbody>
                </table>
              </Panel>
            )}

            <Panel className="overflow-hidden">
              <PanelHeader title="All expenses" description={`${rows.length} in ${range.label.toLowerCase()}`} />
              <div className="relative overflow-x-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <caption className="sr-only">Expenses</caption>
                  <thead className="border-y border-line bg-surface-muted/60 text-left text-xs text-fg-muted">
                    <tr>
                      <th scope="col" className="px-4 py-2.5 font-medium sm:px-5">Date</th>
                      <th scope="col" className="px-3 py-2.5 font-medium">Description</th>
                      <th scope="col" className="px-3 py-2.5 font-medium">Category</th>
                      <th scope="col" className="px-3 py-2.5 text-right font-medium">Amount</th>
                      <th scope="col" className="w-12 px-2"><span className="sr-only">Actions</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((r) => (
                      <tr key={r.id}>
                        <td className="whitespace-nowrap px-4 py-2.5 tabular-nums text-fg-muted sm:px-5">{formatDate(r.incurred_on)}</td>
                        <td className="px-3 py-2.5">
                          <p className="font-medium">{r.description}</p>
                          <p className="text-xs text-fg-muted">
                            {r.asset_id ? <Link href={`/assets/${r.asset_id}`} className="hover:underline">{r.asset_name}</Link> : r.asset_name}
                            {r.asset_name && r.vendor ? " · " : ""}
                            {r.vendor}
                          </p>
                        </td>
                        <td className="px-3 py-2.5"><Badge tone={r.category === "appliance_purchase" ? "neutral" : r.category === "repair" ? "warning" : "accent"}>{EXPENSE_LABELS[r.category]}</Badge></td>
                        <td className="px-3 py-2.5 text-right font-medium tabular-nums">{formatMoney(r.amount_cents, r.currency)}</td>
                        <td className="px-2 py-2.5 text-right"><ExpenseRowMenu row={r} assets={assets} canEdit={ctx.role === "owner" || r.created_by === ctx.user.id} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Panel>
          </div>

          <div className="flex min-w-0 flex-col gap-6 lg:col-span-4">
            <Panel>
              <PanelHeader title="By category" />
              <ul className="flex flex-col gap-3 px-4 pb-5 sm:px-5">
                {stats.byCategory.map((c) => (
                  <li key={c.category}>
                    <div className="flex justify-between text-sm"><span>{EXPENSE_LABELS[c.category]}</span><span className="tabular-nums text-fg-muted">{formatMoney(c.total, currency)}</span></div>
                    <div className="mt-1 h-1.5 rounded-full bg-surface-sunken"><div className="h-full rounded-full bg-accent" style={{ width: `${(c.total / maxCat) * 100}%` }} /></div>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel>
              <PanelHeader title="Most expensive to maintain" description="Upkeep only, excluding purchase price" />
              {stats.topAssets.length === 0 ? (
                <p className="px-4 pb-5 text-sm text-fg-muted sm:px-5">No upkeep costs linked to items in this period.</p>
              ) : (
                <ul className="flex flex-col gap-3 px-4 pb-5 sm:px-5">
                  {stats.topAssets.map((a) => (
                    <li key={a.asset_id}>
                      <Link href={`/assets/${a.asset_id}`} className="flex items-center gap-3 hover:underline">
                        <CategoryTile categoryId={a.category_id} size="sm" />
                        <span className="min-w-0 flex-1 truncate text-sm">{a.name}</span>
                        <span className="text-sm tabular-nums text-fg-muted">{formatMoney(a.upkeep, currency)}</span>
                      </Link>
                      <div className="ml-10 mt-1 h-1.5 rounded-full bg-surface-sunken"><div className="h-full rounded-full bg-accent" style={{ width: `${(a.upkeep / maxAsset) * 100}%` }} /></div>
                      {a.purchase ? <p className="ml-10 mt-0.5 text-[11px] text-fg-subtle">{Math.round((a.upkeep / a.purchase) * 100)}% of its purchase price</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>
      )}
    </div>
  );
}
