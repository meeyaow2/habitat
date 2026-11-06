import "server-only";
import type { Tx } from "@/lib/db";
import { addDays, type ISODate } from "@/lib/domain/dates";

export type AssetListItem = {
  id: string;
  name: string;
  category_id: string;
  brand: string | null;
  model: string | null;
  status: string;
  room_id: string | null;
  room_name: string | null;
  purchase_date: ISODate | null;
  purchase_price_cents: number | null;
  currency: string;
  archived_at: string | null;
  warranty_expires_on: ISODate | null;
  next_due_on: ISODate | null;
  open_tasks: number;
  overdue_tasks: number;
  placed: boolean;
  lifetime_cost_cents: number;
  created_at: string;
};

export type AssetFilters = {
  q?: string;
  category?: string;
  room?: string;
  status?: string;
  warranty?: "active" | "expiring" | "expired" | "none";
  archived?: boolean;
  sort?: "name" | "recent" | "warranty" | "due" | "cost";
};

export async function listAssets(tx: Tx, householdId: string, today: ISODate, reminderDays: number, f: AssetFilters = {}) {
  const q = f.q?.trim() ? `%${f.q.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%` : null;
  const soon = addDays(today, reminderDays);
  const order = {
    name: tx`lower(a.name)`,
    recent: tx`a.created_at desc`,
    warranty: tx`w.expires_on asc nulls last`,
    due: tx`t.next_due_on asc nulls last`,
    cost: tx`coalesce(e.total, 0) desc`,
  }[f.sort ?? "name"];

  const rows = await tx<AssetListItem[]>`
    select a.id, a.name, a.category_id, a.brand, a.model, a.status, a.room_id, r.name as room_name,
           a.purchase_date, a.purchase_price_cents, a.currency, a.archived_at, a.created_at,
           w.expires_on as warranty_expires_on,
           t.next_due_on, coalesce(t.open_tasks, 0)::int as open_tasks, coalesce(t.overdue, 0)::int as overdue_tasks,
           exists (select 1 from floor_plan_objects o where o.asset_id = a.id) as placed,
           coalesce(e.total, 0)::bigint as lifetime_cost_cents
    from assets a
    left join rooms r on r.id = a.room_id
    left join lateral (select max(expires_on) as expires_on from warranties where asset_id = a.id) w on true
    left join lateral (
      select min(due_on) as next_due_on, count(*) as open_tasks, count(*) filter (where due_on < ${today}) as overdue
      from maintenance_tasks where asset_id = a.id and status = 'open'
    ) t on true
    left join lateral (
      select sum(amount_cents) as total from expenses where asset_id = a.id and category <> 'appliance_purchase'
    ) e on true
    where a.household_id = ${householdId}
      and ${f.archived ? tx`a.archived_at is not null` : tx`a.archived_at is null`}
      ${q ? tx`and (a.name ilike ${q} or a.brand ilike ${q} or a.model ilike ${q} or a.serial_number ilike ${q} or r.name ilike ${q})` : tx``}
      ${f.category ? tx`and a.category_id = ${f.category}` : tx``}
      ${f.room ? (f.room === "none" ? tx`and a.room_id is null` : tx`and a.room_id = ${f.room}`) : tx``}
      ${f.status === "attention" ? tx`and a.status in ('needs_attention', 'in_repair')` : f.status ? tx`and a.status = ${f.status}` : tx``}
      ${f.warranty === "active" ? tx`and w.expires_on > ${soon}` : tx``}
      ${f.warranty === "expiring" ? tx`and w.expires_on between ${today} and ${soon}` : tx``}
      ${f.warranty === "expired" ? tx`and w.expires_on < ${today}` : tx``}
      ${f.warranty === "none" ? tx`and w.expires_on is null` : tx``}
    order by ${order}, lower(a.name)
  `;
  return [...rows];
}

export type AssetDetail = AssetListItem & {
  serial_number: string | null;
  vendor: string | null;
  notes: string | null;
  property_id: string | null;
  created_by: string | null;
  created_by_name: string | null;
  floor_id: string | null;
  floor_name: string | null;
};

export type WarrantyRow = {
  id: string; kind: string; provider: string | null; starts_on: ISODate | null; expires_on: ISODate; terms: string | null;
  document_id: string | null;
};
export type TaskRow = {
  id: string; title: string; description: string | null; due_on: ISODate; status: string; priority: string;
  recurrence_interval: number | null; recurrence_unit: "day" | "week" | "month" | "year" | null; source: string;
  asset_id: string | null; asset_name: string | null; assigned_to: string | null; assignee_name: string | null;
  assignee_colour: string | null; last_completed_on: ISODate | null; created_by: string | null;
};
export type EventRow = {
  id: string; kind: string; title: string; performed_on: ISODate; vendor: string | null; cost_cents: number | null;
  notes: string | null; asset_id: string | null; asset_name: string | null; performed_by_name: string | null; task_id: string | null;
};
export type DocumentRow = {
  id: string; title: string; kind: string; mime_type: string; size_bytes: number; created_at: string; asset_id: string | null;
  asset_name: string | null; document_date: ISODate | null; original_filename: string | null;
};

export async function getAsset(tx: Tx, householdId: string, id: string, today: ISODate) {
  const [asset] = await tx<AssetDetail[]>`
    select a.id, a.name, a.category_id, a.brand, a.model, a.serial_number, a.status, a.room_id, r.name as room_name,
           a.purchase_date, a.purchase_price_cents, a.currency, a.vendor, a.notes, a.archived_at, a.created_at,
           a.property_id, a.created_by, p.display_name as created_by_name,
           (select max(expires_on) from warranties where asset_id = a.id) as warranty_expires_on,
           (select min(due_on) from maintenance_tasks where asset_id = a.id and status = 'open') as next_due_on,
           (select count(*)::int from maintenance_tasks where asset_id = a.id and status = 'open') as open_tasks,
           (select count(*)::int from maintenance_tasks where asset_id = a.id and status = 'open' and due_on < ${today}) as overdue_tasks,
           o.floor_id, f.name as floor_name, (o.id is not null) as placed,
           (select coalesce(sum(amount_cents), 0)::bigint from expenses where asset_id = a.id and category <> 'appliance_purchase') as lifetime_cost_cents
    from assets a
    left join rooms r on r.id = a.room_id
    left join profiles p on p.id = a.created_by
    left join floor_plan_objects o on o.asset_id = a.id
    left join floors f on f.id = o.floor_id
    where a.id = ${id} and a.household_id = ${householdId}
  `;
  if (!asset) return null;

  const [warranties, tasks, events, documents] = await Promise.all([
    tx<WarrantyRow[]>`select id, kind, provider, starts_on, expires_on, terms, document_id from warranties where asset_id = ${id} order by created_at`,
    tx<TaskRow[]>`
      select t.id, t.title, t.description, t.due_on, t.status, t.priority, t.recurrence_interval, t.recurrence_unit, t.source,
             t.asset_id, null::text as asset_name, t.assigned_to, p.display_name as assignee_name, p.avatar_color as assignee_colour,
             t.last_completed_on, t.created_by
      from maintenance_tasks t left join profiles p on p.id = t.assigned_to
      where t.asset_id = ${id} order by (t.status = 'open') desc, t.due_on`,
    tx<EventRow[]>`
      select e.id, e.kind, e.title, e.performed_on, e.vendor, e.cost_cents, e.notes, e.asset_id, null::text as asset_name,
             p.display_name as performed_by_name, e.task_id
      from maintenance_events e left join profiles p on p.id = e.performed_by
      where e.asset_id = ${id} order by e.performed_on desc, e.created_at desc limit 50`,
    tx<DocumentRow[]>`
      select id, title, kind, mime_type, size_bytes, created_at, asset_id, null::text as asset_name, document_date, original_filename
      from documents where asset_id = ${id} order by created_at desc`,
  ]);
  return { asset, warranties: [...warranties], tasks: [...tasks], events: [...events], documents: [...documents] };
}

export async function listRooms(tx: Tx, householdId: string) {
  return [...(await tx<{ id: string; name: string; floor_name: string; floor_count: number }[]>`
    select r.id, r.name, f.name as floor_name,
           (select count(*)::int from floors f2 where f2.property_id = f.property_id) as floor_count
    from rooms r join floors f on f.id = r.floor_id
    where r.household_id = ${householdId}
    order by f.level, r.sort_order, r.name
  `)];
}

export async function listAssetOptions(tx: Tx, householdId: string) {
  return [...(await tx<{ id: string; name: string; category_id: string; room_name: string | null }[]>`
    select a.id, a.name, a.category_id, r.name as room_name from assets a left join rooms r on r.id = a.room_id
    where a.household_id = ${householdId} and a.archived_at is null order by lower(a.name)
  `)];
}
