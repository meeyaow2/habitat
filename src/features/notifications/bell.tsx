"use client";

import { useRouter } from "next/navigation";
import * as React from "react";
import { Popover as P } from "radix-ui";
import { AlertTriangle, Bell, CalendarClock, ShieldAlert, UserPlus } from "lucide-react";
import { formatDateTime } from "@/lib/domain/dates";
import { useAction } from "@/lib/client/use-action";
import { cn } from "@/lib/utils";
import { markAllNotificationsReadAction, markNotificationReadAction } from "./actions";
import type { NotificationRow } from "./server";

const ICON: Record<string, React.ReactNode> = {
  task_overdue: <AlertTriangle className="size-4 text-danger" aria-hidden />,
  task_due: <CalendarClock className="size-4 text-warning" aria-hidden />,
  task_assigned: <UserPlus className="size-4 text-accent" aria-hidden />,
  warranty_expiring: <ShieldAlert className="size-4 text-warning" aria-hidden />,
};

export function NotificationBell({ items, unread, className }: { items: NotificationRow[]; unread: number; className?: string }) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const read = useAction(markNotificationReadAction, { silent: true });
  const readAll = useAction(markAllNotificationsReadAction, { silent: true });
  return (
    <P.Root open={open} onOpenChange={setOpen}>
      <P.Trigger
        className={cn("relative grid size-9 place-items-center rounded-md text-fg-muted hover:bg-surface-muted hover:text-fg", className)}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
      >
        <Bell className="size-[18px]" aria-hidden />
        {unread > 0 && (
          <span className="absolute right-1 top-1 grid min-w-4 place-items-center rounded-full bg-danger px-1 text-[10px] font-semibold leading-4 text-white" aria-hidden>
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </P.Trigger>
      <P.Portal>
        <P.Content align="end" side="bottom" sideOffset={6} collisionPadding={12} className="z-50 w-[min(360px,calc(100vw-24px))] overflow-hidden rounded-lg border border-line bg-surface shadow-md data-[state=open]:animate-pop-in">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="text-sm font-semibold">Notifications</h2>
            {unread > 0 && (
              <button type="button" className="text-xs font-medium text-accent hover:underline" onClick={() => readAll.run({})}>Mark all as read</button>
            )}
          </div>
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-fg-muted">You’re all caught up.</p>
          ) : (
            <ul className="max-h-[60vh] divide-y divide-line overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      if (!n.read_at) void read.run({ id: n.id });
                      if (n.link_path) router.push(n.link_path);
                    }}
                    className={cn("flex w-full gap-3 px-4 py-3 text-left hover:bg-surface-muted", !n.read_at && "bg-accent-soft/40")}
                  >
                    <span className="mt-0.5">{ICON[n.kind] ?? <Bell className="size-4 text-fg-subtle" aria-hidden />}</span>
                    <span className="min-w-0 flex-1">
                      <span className={cn("block text-sm", !n.read_at && "font-semibold")}>{n.title}</span>
                      {n.body && <span className="block truncate text-xs text-fg-muted">{n.body}</span>}
                      <span className="block text-[11px] text-fg-subtle">{formatDateTime(n.created_at)}</span>
                    </span>
                    {!n.read_at && <span className="mt-1.5 size-2 shrink-0 rounded-full bg-accent" aria-label="Unread" />}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </P.Content>
      </P.Portal>
    </P.Root>
  );
}
