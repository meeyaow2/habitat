import "server-only";
import type { Tx } from "@/lib/db";
import { addInterval, startOfMonth, type ISODate } from "@/lib/domain/dates";

export const EXPENSE_LABELS: Record<string, string> = {
  appliance_purchase: "Appliance purchases",
  repair: "Repairs",
  servicing: "Servicing",
  renovation: "Renovation",
  parts: "Replacement parts",
  other: "Other",
};

export type ExpenseFilters = { from: ISODate; to: ISODate; category?: string; assetId?: string };

export type ExpenseRow = {
  id: string; description: string; category: string; amount_cents: number; currency: string; incurred_on: ISODate;
  vendor: string | null; asset_id: string | null; asset_name: string | null; maintenance_event_id: string | null; created_by: string | null;
};

/** Resolve a named period to an inclusive date range. */
export function periodRange(period: string, today: ISODate): { from: ISODate; to: ISODate; label: string } {
  const year = today.slice(0, 4);
  switch (period) {
    case "month":
      return { from: startOfMonth(today), to: today, label: "This month" };
    case "3m":
      return { from: startOfMonth(addInterval(today, -2, "month")), to: today, label: "Last 3 months" };
    case "12m":
      return { from: startOfMonth(addInterval(today, -11, "month")), to: today, label: "Last 12 months" };
    case "last-year":
      return { from: `${Number(year) - 1}-01-01`, to: `${Number(year) - 1}-12-31`, label: `${Number(year) - 1}` };
    case "all":
      return { from: "1900-01-01", to: "2999-12-31", label: "All time" };
    default:
      return { from: `${year}-01-01`, to: today, label: `${year} to date` };
  }
}

function where(tx: Tx, householdId: string, f: ExpenseFilters) {
  return tx`
    e.household_id = ${householdId} and e.incurred_on between ${f.from} and ${f.to}
    ${f.category ? tx`and e.category = ${f.category}` : tx``}
    ${f.assetId ? tx`and e.asset_id = ${f.assetId}` : tx``}
  `;
}

export async function listExpenses(tx: Tx, householdId: string, f: ExpenseFilters) {
  return [...(await tx<ExpenseRow[]>`
    select e.id, e.description, e.category, e.amount_cents, e.currency, e.incurred_on, e.vendor, e.asset_id,
           coalesce(a.name, e.asset_name_snapshot) as asset_name, e.maintenance_event_id, e.created_by
    from expenses e left join assets a on a.id = e.asset_id
    where ${where(tx, householdId, f)}
    order by e.incurred_on desc, e.created_at desc
  `)];
}

export async function expenseAnalytics(tx: Tx, householdId: string, f: ExpenseFilters) {
  const [totals] = await tx<{ total: number; purchases: number; upkeep: number; count: number }[]>`
    select coalesce(sum(amount_cents), 0)::bigint as total,
           coalesce(sum(amount_cents) filter (where category = 'appliance_purchase'), 0)::bigint as purchases,
           coalesce(sum(amount_cents) filter (where category <> 'appliance_purchase'), 0)::bigint as upkeep,
           count(*)::int as count
    from expenses e where ${where(tx, householdId, f)}
  `;
  const byCategory = await tx<{ category: string; total: number }[]>`
    select category, sum(amount_cents)::bigint as total from expenses e
    where ${where(tx, householdId, f)} group by 1 order by 2 desc
  `;
  const byMonth = await tx<{ month: ISODate; purchases: number; upkeep: number }[]>`
    select to_char(date_trunc('month', incurred_on), 'YYYY-MM-01') as month,
           coalesce(sum(amount_cents) filter (where category = 'appliance_purchase'), 0)::bigint as purchases,
           coalesce(sum(amount_cents) filter (where category <> 'appliance_purchase'), 0)::bigint as upkeep
    from expenses e where ${where(tx, householdId, f)} group by 1 order by 1
  `;
  const topAssets = await tx<{ asset_id: string; name: string; category_id: string; upkeep: number; purchase: number | null }[]>`
    select a.id as asset_id, a.name, a.category_id, sum(e.amount_cents)::bigint as upkeep, a.purchase_price_cents as purchase
    from expenses e join assets a on a.id = e.asset_id
    where ${where(tx, householdId, f)} and e.category <> 'appliance_purchase'
    group by a.id order by upkeep desc limit 5
  `;
  // Continuous month axis: empty months are shown as zero rather than skipped.
  const months: { month: ISODate; purchases: number; upkeep: number }[] = [];
  if (byMonth.length) {
    const first = f.from > "1900-01-01" ? startOfMonth(f.from) : byMonth[0].month;
    const last = startOfMonth(f.to < "2999-01-01" ? f.to : byMonth[byMonth.length - 1].month);
    for (let m = first; m <= last && months.length < 120; m = addInterval(m, 1, "month")) {
      const row = byMonth.find((r) => r.month === m);
      months.push({ month: m, purchases: row?.purchases ?? 0, upkeep: row?.upkeep ?? 0 });
    }
  }
  return { totals, byCategory: [...byCategory], byMonth: months, topAssets: [...topAssets] };
}
