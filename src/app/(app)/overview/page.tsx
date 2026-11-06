import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, ArrowRight, Check, CircleCheck, Clock, ShieldAlert, Wrench } from "lucide-react";
import { CategoryTile } from "@/components/category-icon";
import { Avatar, EmptyState, PageHeader, Panel, PanelHeader } from "@/components/ui/misc";
import { withUser } from "@/lib/db";
import { formatDate, formatDateTime, relativeDays } from "@/lib/domain/dates";
import { formatMoney } from "@/lib/domain/money";
import { householdHealth } from "@/lib/domain/status";
import { requireHouseholdContext } from "@/lib/server/context";
import { cn } from "@/lib/utils";
import { listAssetOptions, listRooms } from "@/features/assets/queries";
import { getPrimaryProperty } from "@/features/home/server";
import { listMembers, listOpenTasks } from "@/features/maintenance/queries";
import { TaskList } from "@/features/maintenance/task-list";
import { getOverview } from "@/features/overview/queries";
import { QuickActions } from "@/features/overview/quick-actions";
import { SpendChart } from "@/features/overview/spend-chart";

export const metadata: Metadata = { title: "Overview" };

function greeting(timeZone: string) {
  const hour = Number(new Intl.DateTimeFormat("en-SG", { hour: "numeric", hourCycle: "h23", timeZone }).format(new Date()));
  return hour < 5 ? "Good evening" : hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
}

export default async function OverviewPage() {
  const ctx = await requireHouseholdContext();
  const hid = ctx.household.id;
  const data = await withUser(ctx.user.id, async (tx) => {
    const [overview, tasks, rooms, assets, members, property] = await Promise.all([
      getOverview(tx, hid, ctx.today, ctx.household.warranty_reminder_days),
      listOpenTasks(tx, hid, { limit: 6 }),
      listRooms(tx, hid),
      listAssetOptions(tx, hid),
      listMembers(tx, hid),
      getPrimaryProperty(tx, hid),
    ]);
    return { overview, tasks, rooms, assets, members, property };
  });
  const { counts, expiring, attention, months, activity } = data.overview;
  const health = householdHealth({
    overdueTasks: counts.overdue,
    dueSoonTasks: counts.due_soon,
    expiringWarranties: counts.expiring,
    assetsNeedingAttention: counts.attention,
  });
  const firstName = (ctx.profile.display_name || "").split(" ")[0];
  const currency = ctx.household.currency;

  const setup = [
    { done: counts.rooms > 0, label: "Lay out your home", href: "/home" },
    { done: counts.assets > 0, label: "Add your first appliance", href: "/assets?new=1" },
    { done: counts.placed > 0, label: "Place an appliance on your floor plan", href: "/home?edit=1" },
    { done: counts.open_tasks > 0, label: "Schedule a maintenance task", href: "/maintenance?new=1" },
    { done: data.members.length > 1, label: "Invite someone you live with", href: "/household" },
  ];
  const setupRemaining = setup.filter((s) => !s.done).length;
  const showSetup = setupRemaining > 0 && counts.assets < 5;

  const metrics = [
    { label: "Overdue", value: counts.overdue, href: "/maintenance?view=overdue", tone: counts.overdue ? "danger" : "neutral", icon: AlertTriangle },
    { label: "Due in 14 days", value: counts.due_soon, href: "/maintenance?view=upcoming", tone: counts.due_soon ? "warning" : "neutral", icon: Clock },
    { label: "Warranties expiring", value: counts.expiring, href: "/assets?warranty=expiring", tone: counts.expiring ? "warning" : "neutral", icon: ShieldAlert },
    { label: "Need attention", value: counts.attention, href: "/assets?status=attention", tone: counts.attention ? "danger" : "neutral", icon: Wrench },
  ] as const;

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        eyebrow={data.property ? data.property.name : ctx.household.name}
        title={`${greeting(ctx.profile.timezone)}${firstName ? `, ${firstName}` : ""}`}
        description={
          counts.assets === 0
            ? "Let’s get your home set up. It only takes a few minutes."
            : `${counts.assets} item${counts.assets === 1 ? "" : "s"} across ${counts.rooms} room${counts.rooms === 1 ? "" : "s"} · ${formatMoney(counts.year_spend, currency)} spent this year`
        }
      />

      {/* Household status */}
      <Panel className="mb-6 overflow-hidden">
        <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center">
          <div className="flex min-w-0 items-center gap-3 lg:w-[34%]">
            <span
              className={cn(
                "grid size-10 shrink-0 place-items-center rounded-full",
                health.level === "good" && "bg-success-soft text-success",
                health.level === "attention" && "bg-warning-soft text-warning",
                health.level === "action" && "bg-danger-soft text-danger",
              )}
              aria-hidden
            >
              {health.level === "good" ? <CircleCheck className="size-5" /> : <AlertTriangle className="size-5" />}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">Household status</p>
              <p className="text-md font-semibold text-fg">{health.headline}</p>
            </div>
          </div>
          <ul className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
            {metrics.map((m) => (
              <li key={m.label}>
                <Link
                  href={m.href}
                  className="group flex h-full flex-col rounded-md border border-line px-3 py-2.5 transition-colors hover:border-line-strong hover:bg-surface-muted"
                >
                  <span className="flex items-center justify-between text-xs text-fg-muted">
                    {m.label}
                    <ArrowRight className="size-3.5 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                  </span>
                  <span
                    className={cn(
                      "mt-0.5 text-2xl font-semibold tabular-nums",
                      m.tone === "danger" && "text-danger",
                      m.tone === "warning" && "text-warning",
                      m.tone === "neutral" && "text-fg",
                    )}
                  >
                    {m.value}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </Panel>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-8">
          {showSetup && (
            <Panel>
              <PanelHeader title="Set up your home" description={`${setup.length - setupRemaining} of ${setup.length} done`} />
              <ol className="px-2 pb-2">
                {setup.map((s) => (
                  <li key={s.label}>
                    <Link href={s.href} className="flex min-h-11 items-center gap-3 rounded-md px-2 text-sm hover:bg-surface-muted">
                      <span className={cn("grid size-5 place-items-center rounded-full border", s.done ? "border-accent bg-accent text-accent-fg" : "border-line-input")}>
                        {s.done && <Check className="size-3" strokeWidth={3} aria-hidden />}
                      </span>
                      <span className={cn("flex-1", s.done && "text-fg-subtle line-through")}>{s.label}</span>
                      <span className="sr-only">{s.done ? "(done)" : "(to do)"}</span>
                      {!s.done && <ArrowRight className="size-4 text-fg-subtle" aria-hidden />}
                    </Link>
                  </li>
                ))}
              </ol>
            </Panel>
          )}

          <Panel>
            <PanelHeader
              title="Upcoming maintenance"
              action={<Link href="/maintenance" className="text-sm font-medium text-accent hover:underline">All tasks</Link>}
            />
            {data.tasks.length === 0 ? (
              <EmptyState compact icon={<Wrench />} title="No maintenance scheduled" description="Schedule recurring care like aircon servicing or filter changes and Habitat will keep track." />
            ) : (
              <TaskList tasks={data.tasks} today={ctx.today} assets={data.assets} members={data.members} />
            )}
          </Panel>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <Panel>
              <PanelHeader
                title="Maintenance spending"
                description={`${formatMoney(counts.month_spend, currency)} this month`}
                action={<Link href="/expenses" className="text-sm font-medium text-accent hover:underline">Expenses</Link>}
              />
              {months.some((m) => m.maintenance > 0) ? (
                <SpendChart months={months} currency={currency} />
              ) : (
                <EmptyState compact title="No upkeep costs yet" description="Costs you record when completing tasks or repairs appear here." />
              )}
            </Panel>
            <Panel>
              <PanelHeader title="Needs attention" action={attention.length > 0 && <Link href="/assets?status=attention" className="text-sm font-medium text-accent hover:underline">View</Link>} />
              {attention.length === 0 ? (
                <EmptyState compact icon={<CircleCheck />} title="Nothing flagged" description="Items you mark as needing attention or in repair show up here." />
              ) : (
                <ul className="px-2 pb-2">
                  {attention.map((a) => (
                    <li key={a.id}>
                      <Link href={`/assets/${a.id}`} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-surface-muted">
                        <CategoryTile categoryId={a.category_id} tone="danger" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium">{a.name}</p>
                          <p className="truncate text-xs text-fg-muted">{a.notes || (a.status === "in_repair" ? "In repair" : "Needs attention")}</p>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:col-span-4">
          <Panel>
            <PanelHeader title="Quick actions" />
            <div className="px-4 pb-4 sm:px-5">
              <QuickActions rooms={data.rooms} assets={data.assets} members={data.members} />
            </div>
          </Panel>

          <Panel>
            <PanelHeader
              title="Expiring warranties"
              description={`Within ${ctx.household.warranty_reminder_days} days`}
              action={counts.expiring > 0 && <Link href="/assets?warranty=expiring" className="text-sm font-medium text-accent hover:underline">View</Link>}
            />
            {expiring.length === 0 ? (
              <p className="px-4 pb-5 text-sm text-fg-muted sm:px-5">
                {counts.expired > 0 ? (
                  <>None expiring soon. <Link href="/assets?warranty=expired" className="font-medium text-accent hover:underline">{counts.expired} already expired</Link>.</>
                ) : (
                  "No warranties expiring soon."
                )}
              </p>
            ) : (
              <ul className="px-2 pb-2">
                {expiring.map((w) => (
                  <li key={w.asset_id}>
                    <Link href={`/assets/${w.asset_id}`} className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-surface-muted">
                      <CategoryTile categoryId={w.category_id} tone="warning" size="sm" />
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">{w.name}</span>
                      <span className="text-right text-xs">
                        <span className="block font-medium text-warning">{relativeDays(w.expires_on, ctx.today)}</span>
                        <span className="block text-fg-subtle">{formatDate(w.expires_on)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel>
            <PanelHeader title="Recent activity" action={<Link href="/household#activity" className="text-sm font-medium text-accent hover:underline">All</Link>} />
            {activity.length === 0 ? (
              <p className="px-4 pb-5 text-sm text-fg-muted sm:px-5">Changes made by anyone in your household appear here.</p>
            ) : (
              <ol className="px-4 pb-4 sm:px-5">
                {activity.map((a) => (
                  <li key={a.id} className="flex gap-2.5 py-1.5">
                    <Avatar name={a.actor_name} colour={a.actor_colour ?? undefined} size="sm" className="mt-0.5" />
                    <p className="min-w-0 text-sm leading-5">
                      <span className="font-medium">{a.actor_name?.split(" ")[0] ?? "Someone"}</span>{" "}
                      <span className="text-fg-muted">{a.summary}</span>
                      <span className="block text-[11px] text-fg-subtle">{formatDateTime(a.created_at)}</span>
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </Panel>
        </div>
      </div>
    </div>
  );
}
