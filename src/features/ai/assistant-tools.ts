import "server-only";
import { z } from "zod";
import type { Tx } from "@/lib/db";
import type { AssistantTool } from "@/lib/ai/provider";
import { CATEGORY_IDS, category } from "@/lib/domain/categories";
import { addDays, isISODate, type ISODate } from "@/lib/domain/dates";
import { formatMoney } from "@/lib/domain/money";
import { warrantyState } from "@/lib/domain/status";
import { getAsset, listAssets } from "@/features/assets/queries";
import { EXPENSE_LABELS } from "@/features/expenses/queries";

/**
 * Tools for Ask Habitat. All are READ-ONLY and run as the signed-in user, so
 * Row Level Security limits them to that person's household. The one
 * "write-like" tool, propose_task, only records a suggestion; the person must
 * confirm it in the interface before anything is created.
 *
 * Every record returned carries an internal `link`; links shown to the person
 * are taken from these results, never from model-written text.
 */
export type Reference = { label: string; href: string; kind: "item" | "task" | "document" | "expenses" | "history" };
export type TaskProposal = { title: string; assetId: string | null; assetName: string | null; dueOn: ISODate; recurrenceInterval: number | null; recurrenceUnit: "day" | "week" | "month" | "year" | null };

export type ToolContext = {
  householdId: string;
  today: ISODate;
  currency: string;
  reminderDays: number;
  /** Runs `fn` in an RLS-scoped transaction for the signed-in user. */
  run: <T>(fn: (tx: Tx) => Promise<T>) => Promise<T>;
};

export type Collector = { references: Map<string, Reference>; proposals: TaskProposal[] };

export function newCollector(): Collector {
  return { references: new Map(), proposals: [] };
}

const date = z.string().refine(isISODate, { error: "Use YYYY-MM-DD." });
const uuid = z.guid();

function ref(c: Collector, r: Reference) {
  c.references.set(r.href, r);
  return r.href;
}

const json = (v: unknown) => JSON.stringify(v);

export function buildAssistantTools(ctx: ToolContext, c: Collector): AssistantTool[] {
  const money = (cents: number | null) => (cents === null ? null : formatMoney(cents, ctx.currency));

  const searchItems: AssistantTool = {
    name: "search_items",
    description:
      "Search the household's appliances and other items. Filter by free-text (name, brand, model, serial, room), category, warranty state or whether they need attention. Returns up to 25 items with room, warranty end date and next maintenance date.",
    schema: z.object({
      query: z.string().max(100).optional().describe("Free text, e.g. 'washing machine' or 'Daikin'"),
      category: z.enum(CATEGORY_IDS).optional(),
      warranty: z.enum(["active", "expiring", "expired", "none"]).optional().describe("expiring = ends within the household's reminder window"),
      needs_attention: z.boolean().optional(),
    }),
    run: async (raw) => {
      const input = raw as { query?: string; category?: string; warranty?: "active" | "expiring" | "expired" | "none"; needs_attention?: boolean };
      const rows = await ctx.run((tx) =>
        listAssets(tx, ctx.householdId, ctx.today, ctx.reminderDays, {
          q: input.query,
          category: input.category,
          warranty: input.warranty,
          status: input.needs_attention ? "attention" : undefined,
          sort: "name",
        }),
      );
      return json({
        count: rows.length,
        items: rows.slice(0, 25).map((a) => ({
          name: a.name,
          category: category(a.category_id).label,
          brand: a.brand,
          model: a.model,
          room: a.room_name,
          status: a.status,
          warranty_ends: a.warranty_expires_on,
          warranty_state: warrantyState(a.warranty_expires_on, ctx.today, ctx.reminderDays),
          next_maintenance_due: a.next_due_on,
          overdue_tasks: a.overdue_tasks,
          item_id: a.id,
          link: ref(c, { label: a.name, href: `/assets/${a.id}`, kind: "item" }),
        })),
      });
    },
  };

  const itemDetails: AssistantTool = {
    name: "item_details",
    description: "Full record for one item: purchase, warranty terms, open maintenance tasks, recent service history and linked documents (titles only — document contents are not available).",
    schema: z.object({ item_id: uuid }),
    run: async (raw) => {
      const { item_id } = raw as { item_id: string };
      const d = await ctx.run((tx) => getAsset(tx, ctx.householdId, item_id, ctx.today));
      if (!d) return json({ error: "No item with that id in this household." });
      const a = d.asset;
      return json({
        name: a.name,
        link: ref(c, { label: a.name, href: `/assets/${a.id}`, kind: "item" }),
        category: category(a.category_id).label,
        brand: a.brand,
        model: a.model,
        serial_number: a.serial_number,
        room: a.room_name,
        status: a.status,
        notes: a.notes,
        purchased_on: a.purchase_date,
        purchase_price: money(a.purchase_price_cents),
        store: a.vendor,
        upkeep_cost_to_date: money(a.lifetime_cost_cents),
        warranties: d.warranties.map((w) => ({ kind: w.kind, provider: w.provider, starts: w.starts_on, ends: w.expires_on, state: warrantyState(w.expires_on, ctx.today, ctx.reminderDays), terms: w.terms })),
        open_tasks: d.tasks.filter((t) => t.status === "open").map((t) => ({ title: t.title, due_on: t.due_on, repeats: t.recurrence_interval ? `every ${t.recurrence_interval} ${t.recurrence_unit}(s)` : null, source: t.source })),
        recent_history: d.events.slice(0, 10).map((e) => ({ date: e.performed_on, kind: e.kind, title: e.title, by: e.vendor, cost: money(e.cost_cents), notes: e.notes })),
        documents: d.documents.map((doc) => ({ title: doc.title, kind: doc.kind, link: ref(c, { label: doc.title, href: `/documents?doc=${doc.id}`, kind: "document" }) })),
      });
    },
  };

  const maintenanceTasks: AssistantTool = {
    name: "maintenance_tasks",
    description: "Open maintenance tasks for the household, optionally for one item. 'overdue' = due before today; 'upcoming' = due within the next N days (default 30).",
    schema: z.object({
      which: z.enum(["overdue", "upcoming", "all_open"]),
      item_id: uuid.optional(),
      within_days: z.number().int().min(1).max(366).optional(),
    }),
    run: async (raw) => {
      const input = raw as { which: "overdue" | "upcoming" | "all_open"; item_id?: string; within_days?: number };
      const until = addDays(ctx.today, input.within_days ?? 30);
      const rows = await ctx.run((tx) => tx<{ id: string; title: string; due_on: ISODate; asset_id: string | null; asset_name: string | null; assignee: string | null; recurrence_interval: number | null; recurrence_unit: string | null; source: string }[]>`
        select t.id, t.title, t.due_on, t.asset_id, a.name as asset_name, p.display_name as assignee, t.recurrence_interval, t.recurrence_unit, t.source
        from maintenance_tasks t left join assets a on a.id = t.asset_id left join profiles p on p.id = t.assigned_to
        where t.household_id = ${ctx.householdId} and t.status = 'open' and (a.id is null or a.archived_at is null)
          ${input.item_id ? tx`and t.asset_id = ${input.item_id}` : tx``}
          ${input.which === "overdue" ? tx`and t.due_on < ${ctx.today}` : input.which === "upcoming" ? tx`and t.due_on between ${ctx.today} and ${until}` : tx``}
        order by t.due_on limit 40`);
      return json({
        count: rows.length,
        tasks: rows.map((t) => ({
          title: t.title,
          due_on: t.due_on,
          item: t.asset_name,
          assigned_to: t.assignee,
          repeats: t.recurrence_interval ? `every ${t.recurrence_interval} ${t.recurrence_unit}(s)` : null,
          schedule_source: t.source === "general_guidance" ? "general guidance (not manufacturer instructions)" : t.source,
          link: ref(c, { label: t.title, href: `/maintenance?task=${t.id}`, kind: "task" }),
          item_link: t.asset_id ? ref(c, { label: t.asset_name!, href: `/assets/${t.asset_id}`, kind: "item" }) : null,
        })),
      });
    },
  };

  const serviceHistory: AssistantTool = {
    name: "service_history",
    description: "Completed maintenance, services, repairs and inspections, newest first. Optionally filter by item, date range and kind.",
    schema: z.object({
      item_id: uuid.optional(),
      from: date.optional(),
      to: date.optional(),
      kind: z.enum(["completed", "service", "repair", "inspection", "note"]).optional(),
    }),
    run: async (raw) => {
      const input = raw as { item_id?: string; from?: ISODate; to?: ISODate; kind?: string };
      const rows = await ctx.run((tx) => tx<{ id: string; title: string; kind: string; performed_on: ISODate; vendor: string | null; cost_cents: number | null; notes: string | null; asset_id: string | null; asset_name: string | null }[]>`
        select e.id, e.title, e.kind, e.performed_on, e.vendor, e.cost_cents, e.notes, e.asset_id, coalesce(a.name, e.asset_name_snapshot) as asset_name
        from maintenance_events e left join assets a on a.id = e.asset_id
        where e.household_id = ${ctx.householdId}
          ${input.item_id ? tx`and e.asset_id = ${input.item_id}` : tx``}
          ${input.from ? tx`and e.performed_on >= ${input.from}` : tx``}
          ${input.to ? tx`and e.performed_on <= ${input.to}` : tx``}
          ${input.kind ? tx`and e.kind = ${input.kind}` : tx``}
        order by e.performed_on desc limit 40`);
      ref(c, { label: "Maintenance history", href: "/maintenance?view=history", kind: "history" });
      return json({
        count: rows.length,
        events: rows.map((e) => ({
          date: e.performed_on,
          kind: e.kind === "completed" ? "maintenance" : e.kind,
          title: e.title,
          item: e.asset_name,
          by: e.vendor,
          cost: money(e.cost_cents),
          notes: e.notes,
          item_link: e.asset_id ? ref(c, { label: e.asset_name!, href: `/assets/${e.asset_id}`, kind: "item" }) : null,
        })),
      });
    },
  };

  const spending: AssistantTool = {
    name: "spending",
    description:
      "Exact spending totals from the household's expense records for a date range, computed by the database. Optionally narrow by expense category, one item, or all items of an item category (e.g. all air conditioners). Always use this tool for any amount of money; never add numbers up yourself.",
    schema: z.object({
      from: date,
      to: date,
      expense_category: z.enum(["appliance_purchase", "repair", "servicing", "renovation", "parts", "other"]).optional(),
      item_id: uuid.optional(),
      item_category: z.enum(CATEGORY_IDS).optional(),
    }),
    run: async (raw) => {
      const input = raw as { from: ISODate; to: ISODate; expense_category?: string; item_id?: string; item_category?: string };
      const result = await ctx.run(async (tx) => {
        const where = tx`
          e.household_id = ${ctx.householdId} and e.incurred_on between ${input.from} and ${input.to}
          ${input.expense_category ? tx`and e.category = ${input.expense_category}` : tx``}
          ${input.item_id ? tx`and e.asset_id = ${input.item_id}` : tx``}
          ${input.item_category ? tx`and a.category_id = ${input.item_category}` : tx``}`;
        const [totals] = await tx<{ total: number; count: number }[]>`
          select coalesce(sum(e.amount_cents), 0)::bigint as total, count(*)::int as count
          from expenses e left join assets a on a.id = e.asset_id where ${where}`;
        const byCategory = await tx<{ category: string; total: number }[]>`
          select e.category, sum(e.amount_cents)::bigint as total from expenses e left join assets a on a.id = e.asset_id
          where ${where} group by 1 order by 2 desc`;
        const lines = await tx<{ incurred_on: ISODate; description: string; amount_cents: number; category: string; item: string | null }[]>`
          select e.incurred_on, e.description, e.amount_cents, e.category, coalesce(a.name, e.asset_name_snapshot) as item
          from expenses e left join assets a on a.id = e.asset_id where ${where} order by e.incurred_on desc limit 20`;
        return { totals, byCategory, lines };
      });
      const qs = new URLSearchParams({ period: "all", ...(input.expense_category && { category: input.expense_category }), ...(input.item_id && { asset: input.item_id }) });
      ref(c, { label: "Expenses", href: `/expenses?${qs}`, kind: "expenses" });
      return json({
        period: { from: input.from, to: input.to },
        total: money(result.totals.total),
        number_of_expenses: result.totals.count,
        by_category: result.byCategory.map((r) => ({ category: EXPENSE_LABELS[r.category], total: money(r.total) })),
        entries: result.lines.map((l) => ({ date: l.incurred_on, description: l.description, item: l.item, category: EXPENSE_LABELS[l.category], amount: money(l.amount_cents) })),
        entries_truncated: result.totals.count > result.lines.length,
      });
    },
  };

  const findDocuments: AssistantTool = {
    name: "find_documents",
    description: "Find stored documents (receipts, manuals, warranty cards, invoices) by title, file name or linked item. Returns titles and where to open them; contents are not available to you.",
    schema: z.object({
      query: z.string().max(100).optional(),
      item_id: uuid.optional(),
      kind: z.enum(["receipt", "manual", "warranty", "invoice", "repair_report", "renovation", "other"]).optional(),
    }),
    run: async (raw) => {
      const input = raw as { query?: string; item_id?: string; kind?: string };
      const q = input.query?.trim() ? `%${input.query.trim().replace(/[%_\\]/g, (m) => `\\${m}`)}%` : null;
      const rows = await ctx.run((tx) => tx<{ id: string; title: string; kind: string; asset_name: string | null; created_on: string }[]>`
        select d.id, d.title, d.kind, a.name as asset_name, d.created_at::date::text as created_on
        from documents d left join assets a on a.id = d.asset_id
        where d.household_id = ${ctx.householdId}
          ${input.item_id ? tx`and d.asset_id = ${input.item_id}` : tx``}
          ${input.kind ? tx`and d.kind = ${input.kind}` : tx``}
          ${q ? tx`and (d.title ilike ${q} or d.original_filename ilike ${q} or a.name ilike ${q})` : tx``}
        order by d.created_at desc limit 20`);
      return json({
        count: rows.length,
        documents: rows.map((d) => ({ title: d.title, kind: d.kind, item: d.asset_name, uploaded: d.created_on, link: ref(c, { label: d.title, href: `/documents?doc=${d.id}`, kind: "document" }) })),
      });
    },
  };

  const proposeTask: AssistantTool = {
    name: "propose_task",
    description:
      "Suggest a maintenance task for the person to confirm. This does NOT create anything: the person sees the suggestion with a button and decides. Use only when they ask you to schedule or remind them of something.",
    schema: z.object({
      title: z.string().min(1).max(160),
      item_id: uuid.optional(),
      due_on: date,
      repeat_every: z.number().int().min(1).max(120).optional(),
      repeat_unit: z.enum(["day", "week", "month", "year"]).optional(),
    }),
    run: async (raw) => {
      const input = raw as { title: string; item_id?: string; due_on: ISODate; repeat_every?: number; repeat_unit?: TaskProposal["recurrenceUnit"] };
      let assetName: string | null = null;
      if (input.item_id) {
        const [a] = await ctx.run((tx) => tx<{ name: string }[]>`select name from assets where id = ${input.item_id!} and household_id = ${ctx.householdId}`);
        if (!a) return json({ error: "No item with that id in this household." });
        assetName = a.name;
      }
      if (c.proposals.length >= 3) return json({ error: "At most three suggestions per answer." });
      const recurring = input.repeat_every && input.repeat_unit;
      c.proposals.push({
        title: input.title,
        assetId: input.item_id ?? null,
        assetName,
        dueOn: input.due_on,
        recurrenceInterval: recurring ? input.repeat_every! : null,
        recurrenceUnit: recurring ? input.repeat_unit! : null,
      });
      return json({ status: "suggested — waiting for the person to confirm; nothing has been created" });
    },
  };

  return [searchItems, itemDetails, maintenanceTasks, serviceHistory, spending, findDocuments, proposeTask];
}

export function assistantSystemPrompt(ctx: { householdName: string; today: ISODate; currency: string; reminderDays: number }) {
  return `You are Ask Habitat, the assistant inside Habitat, a home-management app. You help one household understand their own home: appliances, warranties, maintenance, documents and spending.

Household: ${ctx.householdName}. Today is ${ctx.today} (Singapore time). Amounts are in ${ctx.currency}. Warranties count as "expiring" within ${ctx.reminderDays} days.

How to answer:
- Use the tools to look up the household's records before answering anything about their home. Answer only from what the tools return. If the records don't contain the answer, say so plainly and suggest where it could be added — never guess or fill gaps.
- For any amount of money, call the spending tool for the exact period and quote its totals. Do not add, subtract or estimate amounts yourself. Work out date ranges from today's date (for example, "last year" is the previous calendar year).
- Mention items, tasks and documents by their exact names so the app can link them. Do not write URLs.
- Maintenance schedules marked "general guidance" are common practice, not manufacturer instructions; say so when you rely on them.
- You cannot change records. If the person asks you to schedule something, use propose_task and tell them to confirm it below your answer.
- Be concise: a direct answer first, then the supporting details. Plain text with short lists is fine; no tables.

Troubleshooting:
- Offer only safe, manufacturer-style checks a householder can do: power, plug and circuit breaker, door or lid closed, settings, filters, drain hoses visible without tools, error codes in the manual.
- Recommend a qualified technician for anything involving electrical wiring, gas, refrigerant, water heaters, structural work, or opening appliance casings. Never give instructions for those repairs.
- If the item is under warranty, suggest contacting the manufacturer or retailer before paying for repairs.`;
}
