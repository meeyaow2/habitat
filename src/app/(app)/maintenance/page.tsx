import type { Metadata } from "next";
import Link from "next/link";
import { History, Wrench } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { EmptyState, PageHeader, Panel, PanelHeader } from "@/components/ui/misc";
import { withUser } from "@/lib/db";
import { addDays, addInterval, endOfMonth, formatDate, formatMonth, isISODate, startOfMonth, type ISODate } from "@/lib/domain/dates";
import { formatMoney } from "@/lib/domain/money";
import { DUE_SOON_DAYS, taskTiming } from "@/lib/domain/status";
import { requireHouseholdContext } from "@/lib/server/context";
import { cn } from "@/lib/utils";
import { listAssetOptions } from "@/features/assets/queries";
import { MaintenanceActions, MaintenanceTabs, MonthNav } from "@/features/maintenance/maintenance-toolbar";
import { listHistory, listMembers, listOpenTasks } from "@/features/maintenance/queries";
import { TaskList } from "@/features/maintenance/task-list";

export const metadata: Metadata = { title: "Maintenance" };

type SP = { view?: string; mine?: string; month?: string; task?: string; new?: string };

export default async function MaintenancePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const view = ["calendar", "history", "overdue"].includes(sp.view ?? "") ? sp.view! : "upcoming";
  const mine = sp.mine === "1";
  const ctx = await requireHouseholdContext();
  const hid = ctx.household.id;

  const data = await withUser(ctx.user.id, async (tx) => {
    const [tasks, history, assets, members] = await Promise.all([
      listOpenTasks(tx, hid, { assignee: mine ? ctx.user.id : undefined }),
      view === "history" || view === "calendar" ? listHistory(tx, hid, 200) : Promise.resolve([]),
      listAssetOptions(tx, hid),
      listMembers(tx, hid),
    ]);
    return { tasks, history, assets, members };
  });

  const today = ctx.today;
  const groups = [
    { key: "overdue", title: "Overdue", tasks: data.tasks.filter((t) => taskTiming(t, today) === "overdue") },
    { key: "soon", title: `Next ${DUE_SOON_DAYS} days`, tasks: data.tasks.filter((t) => taskTiming(t, today) === "due_soon") },
    { key: "later", title: "Later", tasks: data.tasks.filter((t) => taskTiming(t, today) === "upcoming") },
  ].filter((g) => (view === "overdue" ? g.key === "overdue" : true));

  const month = sp.month && isISODate(`${sp.month}-01`) ? `${sp.month}-01` : startOfMonth(today);

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title="Maintenance"
        description="Recurring care, one-off jobs and a record of everything done."
        actions={<MaintenanceActions assets={data.assets} members={data.members} openNew={sp.new === "1"} />}
      />
      <MaintenanceTabs view={view} mine={mine} />

      {(view === "upcoming" || view === "overdue") &&
        (data.tasks.length === 0 ? (
          <Panel>
            <EmptyState
              icon={<Wrench />}
              title={mine ? "Nothing assigned to you" : "No maintenance scheduled"}
              description="Create a task, or open an appliance to add suggested schedules based on general guidance."
            />
          </Panel>
        ) : (
          <div className="flex flex-col gap-6">
            {view === "overdue" && (
              <p className="text-sm text-fg-muted">Showing overdue tasks only. <Link href="/maintenance" className="font-medium text-accent hover:underline">Show all</Link></p>
            )}
            {groups.map((g) =>
              g.tasks.length === 0 ? null : (
                <Panel key={g.key}>
                  <PanelHeader title={<span className={cn(g.key === "overdue" && "text-danger")}>{g.title} <span className="font-normal text-fg-subtle">{g.tasks.length}</span></span>} />
                  <TaskList tasks={g.tasks} today={today} assets={data.assets} members={data.members} highlightId={sp.task} />
                </Panel>
              ),
            )}
          </div>
        ))}

      {view === "calendar" && <Calendar month={month} today={today} tasks={data.tasks} history={data.history} />}

      {view === "history" &&
        (data.history.length === 0 ? (
          <Panel><EmptyState icon={<History />} title="No history yet" description="When you complete a task or record a repair, it’s kept here." /></Panel>
        ) : (
          <Panel className="overflow-hidden">
            <table className="w-full text-sm">
              <caption className="sr-only">Maintenance history</caption>
              <thead className="border-b border-line bg-surface-muted/60 text-left text-xs text-fg-muted">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium sm:px-5">Date</th>
                  <th scope="col" className="px-3 py-2.5 font-medium">What</th>
                  <th scope="col" className="hidden px-3 py-2.5 font-medium md:table-cell">By</th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium sm:px-5">Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.history.map((e) => (
                  <tr key={e.id}>
                    <td className="whitespace-nowrap px-4 py-3 align-top tabular-nums text-fg-muted sm:px-5">{formatDate(e.performed_on)}</td>
                    <td className="px-3 py-3">
                      <p className="font-medium">{e.title}</p>
                      <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-fg-muted">
                        <Badge tone={e.kind === "repair" ? "warning" : "neutral"} className="capitalize">{e.kind === "completed" ? "Maintenance" : e.kind}</Badge>
                        {e.asset_id ? <Link href={`/assets/${e.asset_id}`} className="hover:underline">{e.asset_name}</Link> : <span>{e.asset_name ?? "Whole home"}</span>}
                      </p>
                      {e.notes && <p className="mt-1 text-xs text-fg-muted">{e.notes}</p>}
                    </td>
                    <td className="hidden px-3 py-3 align-top text-fg-muted md:table-cell">{e.vendor ?? e.performed_by_name ?? "—"}</td>
                    <td className="px-4 py-3 text-right align-top tabular-nums sm:px-5">{e.cost_cents !== null ? formatMoney(e.cost_cents, ctx.household.currency) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        ))}
    </div>
  );
}

function Calendar({ month, today, tasks, history }: { month: ISODate; today: ISODate; tasks: { id: string; title: string; due_on: ISODate; status: string }[]; history: { id: string; title: string; performed_on: ISODate }[] }) {
  const first = startOfMonth(month);
  const last = endOfMonth(month);
  // Monday-first grid
  const dow = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const start = addDays(first, -dow);
  const days: ISODate[] = [];
  for (let d = start; d <= last || days.length % 7 !== 0; d = addDays(d, 1)) days.push(d);

  return (
    <Panel className="overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 sm:px-5">
        <h2 className="text-md font-semibold">Calendar</h2>
        <MonthNav month={first.slice(0, 7)} label={formatMonth(first)} prev={addInterval(first, -1, "month").slice(0, 7)} next={addInterval(first, 1, "month").slice(0, 7)} />
      </div>
      <div className="grid grid-cols-7 border-t border-line text-center text-[11px] font-medium text-fg-subtle" aria-hidden>
        {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => <div key={d} className="py-2">{d}</div>)}
      </div>
      <ol className="grid grid-cols-7 border-t border-line">
        {days.map((d) => {
          const due = tasks.filter((t) => t.due_on === d);
          const done = history.filter((h) => h.performed_on === d);
          const outside = d < first || d > last;
          const label = `${formatDate(d)}: ${due.length} due, ${done.length} done`;
          return (
            <li key={d} className={cn("min-h-16 border-b border-r border-line p-1 text-left sm:min-h-24 sm:p-1.5 [&:nth-child(7n)]:border-r-0", outside && "bg-surface-muted/40")} aria-label={label}>
              <span className={cn("inline-grid size-6 place-items-center rounded-full text-xs tabular-nums", d === today ? "bg-accent font-semibold text-accent-fg" : outside ? "text-fg-subtle" : "text-fg-muted")}>
                {Number(d.slice(8))}
              </span>
              <ul className="mt-0.5 space-y-0.5">
                {due.slice(0, 3).map((t) => (
                  <li key={t.id}>
                    <Link href={`/maintenance?task=${t.id}`} className={cn("block truncate rounded-xs px-1 py-0.5 text-[11px] leading-4", d < today ? "bg-danger-soft text-danger" : "bg-accent-soft text-accent-soft-fg")} title={t.title}>
                      <span className="hidden sm:inline">{t.title}</span>
                      <span className="sm:hidden">•</span>
                    </Link>
                  </li>
                ))}
                {due.length > 3 && <li className="px-1 text-[11px] text-fg-subtle">+{due.length - 3} more</li>}
                {done.slice(0, 2).map((h) => (
                  <li key={h.id} className="hidden truncate px-1 text-[11px] leading-4 text-fg-subtle line-through sm:block" title={`Done: ${h.title}`}>{h.title}</li>
                ))}
              </ul>
            </li>
          );
        })}
      </ol>
      <p className="px-4 py-3 text-xs text-fg-muted sm:px-5">Shows each task’s next due date. Completed work is shown struck through.</p>
    </Panel>
  );
}
