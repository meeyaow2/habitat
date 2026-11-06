"use client";

import Link from "next/link";
import * as React from "react";
import { Check, MoreHorizontal, Pencil, Repeat, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Avatar } from "@/components/ui/misc";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { describeInterval, formatDate, relativeDays, type ISODate } from "@/lib/domain/dates";
import { taskTiming } from "@/lib/domain/status";
import { useAction } from "@/lib/client/use-action";
import { cn } from "@/lib/utils";
import type { TaskRow } from "@/features/assets/queries";
import type { AssetOption, MemberOption } from "@/features/shared/options";
import { deleteTaskAction } from "./actions";
import { CompleteTaskDialog } from "./complete-dialog";
import { emptyTask, repeatValue, TaskFormDialog } from "./task-form";
import { useOnChange } from "@/lib/client/use-on-change";

export function TaskList({
  tasks,
  today,
  assets,
  members,
  showAsset = true,
  highlightId,
  emptyText = "Nothing scheduled.",
}: {
  tasks: TaskRow[];
  today: ISODate;
  assets: AssetOption[];
  members: MemberOption[];
  showAsset?: boolean;
  highlightId?: string;
  emptyText?: string;
}) {
  // Optimistic: hide a task the moment it's submitted; roll back if the action fails.
  const [hidden, setHidden] = React.useState<Set<string>>(new Set());
  const [completing, setCompleting] = React.useState<TaskRow | null>(null);
  const [editing, setEditing] = React.useState<TaskRow | null>(null);
  const [deleting, setDeleting] = React.useState<TaskRow | null>(null);
  const del = useAction(deleteTaskAction, { success: "Task deleted" });

  // New server data supersedes optimistic hiding.
  useOnChange(tasks, () => setHidden(new Set()));

  const visible = tasks.filter((t) => !hidden.has(t.id));
  if (visible.length === 0) return <p className="px-4 py-6 text-sm text-fg-muted sm:px-5">{emptyText}</p>;

  return (
    <>
      <ul className="divide-y divide-line" aria-label="Maintenance tasks">
        {visible.map((t) => {
          const timing = taskTiming(t, today);
          return (
            <li key={t.id} id={`task-${t.id}`} className={cn("group flex items-center gap-3 px-4 py-3 sm:px-5", highlightId === t.id && "bg-accent-soft/50")}>
              <button
                type="button"
                onClick={() => setCompleting(t)}
                className={cn(
                  "grid size-6 shrink-0 place-items-center rounded-full border-[1.5px] text-transparent transition-colors hover:border-accent hover:bg-accent-soft hover:text-accent",
                  timing === "overdue" ? "border-danger/60" : "border-line-input",
                )}
                aria-label={`Mark “${t.title}” as done`}
              >
                <Check className="size-3.5" strokeWidth={3} />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-fg">{t.title}</p>
                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-fg-muted">
                  {showAsset && t.asset_name && (
                    <Link href={`/assets/${t.asset_id}`} className="truncate hover:text-fg hover:underline">{t.asset_name}</Link>
                  )}
                  {showAsset && !t.asset_name && <span>Whole home</span>}
                  {t.recurrence_interval && t.recurrence_unit && (
                    <span className="inline-flex items-center gap-1">
                      <Repeat className="size-3" aria-hidden />
                      {describeInterval(t.recurrence_interval, t.recurrence_unit)}
                    </span>
                  )}
                  {t.source === "general_guidance" && <span title="Schedule based on general guidance, not manufacturer instructions">General guidance</span>}
                </p>
              </div>
              {t.priority === "high" && <Badge tone="warning" className="hidden sm:inline-flex">High</Badge>}
              {t.assignee_name && (
                <span title={`Assigned to ${t.assignee_name}`}>
                  <Avatar name={t.assignee_name} colour={t.assignee_colour ?? undefined} size="sm" />
                  <span className="sr-only">Assigned to {t.assignee_name}</span>
                </span>
              )}
              <div className="w-[88px] shrink-0 text-right">
                <p className={cn("text-xs font-medium", timing === "overdue" ? "text-danger" : timing === "due_soon" ? "text-warning" : "text-fg-muted")}>
                  {timing === "overdue" ? `Overdue` : relativeDays(t.due_on, today)}
                </p>
                <p className="text-[11px] text-fg-subtle" data-numeric>{timing === "overdue" ? relativeDays(t.due_on, today) : formatDate(t.due_on, "en-SG", { year: undefined })}</p>
              </div>
              <Menu>
                <MenuTrigger className="grid size-8 shrink-0 place-items-center rounded-md text-fg-subtle hover:bg-surface-muted hover:text-fg" aria-label={`More actions for ${t.title}`}>
                  <MoreHorizontal className="size-4" />
                </MenuTrigger>
                <MenuContent>
                  <MenuItem onSelect={() => setCompleting(t)}><Check /> Mark as done</MenuItem>
                  <MenuItem onSelect={() => setEditing(t)}><Pencil /> Edit</MenuItem>
                  <MenuSeparator />
                  <MenuItem tone="danger" onSelect={() => setDeleting(t)}><Trash2 /> Delete</MenuItem>
                </MenuContent>
              </Menu>
            </li>
          );
        })}
      </ul>

      <CompleteTaskDialog
        task={completing}
        onOpenChange={(o) => !o && setCompleting(null)}
        onCompleted={(id) => {
          const isRecurring = tasks.find((t) => t.id === id)?.recurrence_interval;
          if (!isRecurring) setHidden((h) => new Set(h).add(id));
        }}
        onFailed={(id) => setHidden((h) => { const n = new Set(h); n.delete(id); return n; })}
      />
      <TaskFormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        assets={assets}
        members={members}
        taskId={editing?.id}
        initial={
          editing
            ? emptyTask({
                title: editing.title,
                description: editing.description ?? "",
                assetId: editing.asset_id ?? "",
                assignedTo: editing.assigned_to ?? "",
                dueOn: editing.due_on,
                priority: editing.priority as "normal",
                repeat: repeatValue(editing.recurrence_interval, editing.recurrence_unit),
                customInterval: String(editing.recurrence_interval ?? 2),
                customUnit: editing.recurrence_unit ?? "month",
                source: editing.source as "user",
              })
            : undefined
        }
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Delete “${deleting?.title}”?`}
        description="The schedule is removed. Past completions stay in the service history."
        confirmLabel="Delete task"
        onConfirm={async () => {
          if (!deleting) return;
          const id = deleting.id;
          setHidden((h) => new Set(h).add(id));
          const ok = await del.run({ id });
          if (!ok) setHidden((h) => { const n = new Set(h); n.delete(id); return n; });
        }}
      />
    </>
  );
}
