import "server-only";
import type { Tx } from "@/lib/db";
import { addDays, addInterval, startOfMonth, type ISODate } from "@/lib/domain/dates";
import { DUE_SOON_DAYS } from "@/lib/domain/status";

export async function getOverview(tx: Tx, householdId: string, today: ISODate, reminderDays: number) {
  const soon = addDays(today, DUE_SOON_DAYS);
  const warrantyHorizon = addDays(today, reminderDays);
  const sixMonthsAgo = startOfMonth(addInterval(today, -5, "month"));

  const [counts] = await tx<{
    assets: number; placed: number; rooms: number; overdue: number; due_soon: number; open_tasks: number;
    expiring: number; expired: number; attention: number; month_spend: number; year_spend: number;
  }[]>`
    with current_warranty as (
      select a.id, max(w.expires_on) as expires_on
      from assets a join warranties w on w.asset_id = a.id
      where a.household_id = ${householdId} and a.archived_at is null
      group by a.id
    ), open_tasks as (
      select t.* from maintenance_tasks t left join assets a on a.id = t.asset_id
      where t.household_id = ${householdId} and t.status = 'open' and (a.id is null or a.archived_at is null)
    )
    select
      (select count(*)::int from assets where household_id = ${householdId} and archived_at is null) as assets,
      (select count(*)::int from floor_plan_objects where household_id = ${householdId} and kind = 'asset') as placed,
      (select count(*)::int from rooms where household_id = ${householdId}) as rooms,
      (select count(*)::int from open_tasks where due_on < ${today}) as overdue,
      (select count(*)::int from open_tasks where due_on between ${today} and ${soon}) as due_soon,
      (select count(*)::int from open_tasks) as open_tasks,
      (select count(*)::int from current_warranty where expires_on between ${today} and ${warrantyHorizon}) as expiring,
      (select count(*)::int from current_warranty where expires_on < ${today}) as expired,
      (select count(*)::int from assets where household_id = ${householdId} and archived_at is null
         and status in ('needs_attention', 'in_repair')) as attention,
      (select coalesce(sum(amount_cents), 0)::bigint from expenses where household_id = ${householdId}
         and incurred_on >= ${startOfMonth(today)} and incurred_on <= ${today}) as month_spend,
      (select coalesce(sum(amount_cents), 0)::bigint from expenses where household_id = ${householdId}
         and incurred_on >= ${today.slice(0, 4) + "-01-01"} and incurred_on <= ${today}) as year_spend
  `;

  const [expiring, attention, monthly, activity] = await Promise.all([
    tx<{ asset_id: string; name: string; category_id: string; expires_on: ISODate; provider: string | null }[]>`
      select distinct on (a.id) a.id as asset_id, a.name, a.category_id, w.expires_on, w.provider
      from assets a join warranties w on w.asset_id = a.id
      where a.household_id = ${householdId} and a.archived_at is null
      order by a.id, w.expires_on desc
    `.then((rows) =>
      rows.filter((r) => r.expires_on >= today && r.expires_on <= warrantyHorizon).sort((x, y) => x.expires_on.localeCompare(y.expires_on)).slice(0, 5),
    ),
    tx<{ id: string; name: string; category_id: string; status: string; room_name: string | null; notes: string | null }[]>`
      select a.id, a.name, a.category_id, a.status, r.name as room_name, a.notes
      from assets a left join rooms r on r.id = a.room_id
      where a.household_id = ${householdId} and a.archived_at is null and a.status in ('needs_attention', 'in_repair')
      order by a.updated_at desc limit 5
    `,
    tx<{ month: ISODate; maintenance: number; purchases: number }[]>`
      select to_char(date_trunc('month', incurred_on), 'YYYY-MM-01') as month,
             coalesce(sum(amount_cents) filter (where category <> 'appliance_purchase'), 0)::bigint as maintenance,
             coalesce(sum(amount_cents) filter (where category = 'appliance_purchase'), 0)::bigint as purchases
      from expenses
      where household_id = ${householdId} and incurred_on >= ${sixMonthsAgo} and incurred_on <= ${today}
      group by 1 order by 1
    `,
    tx<{ id: number; summary: string; created_at: string; entity_type: string; entity_id: string | null; actor_name: string | null; actor_colour: string | null }[]>`
      select l.id, l.summary, l.created_at, l.entity_type, l.entity_id, p.display_name as actor_name, p.avatar_color as actor_colour
      from activity_logs l left join profiles p on p.id = l.actor_id
      where l.household_id = ${householdId}
      order by l.created_at desc, l.id desc limit 8
    `,
  ]);

  // Fill missing months so the chart always shows six buckets.
  const months: { month: ISODate; maintenance: number; purchases: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const month = startOfMonth(addInterval(today, -i, "month"));
    const row = monthly.find((r) => r.month === month);
    months.push({ month, maintenance: row?.maintenance ?? 0, purchases: row?.purchases ?? 0 });
  }

  return { counts, expiring, attention: [...attention], months, activity: [...activity] };
}
