import { addInterval, daysBetween, type ISODate, type IntervalUnit } from "./dates";

// ---------------------------------------------------------------------------
// Warranty
// ---------------------------------------------------------------------------
export type WarrantyState = "none" | "active" | "expiring" | "expired";

export function warrantyState(expiresOn: ISODate | null | undefined, today: ISODate, reminderDays: number): WarrantyState {
  if (!expiresOn) return "none";
  const remaining = daysBetween(today, expiresOn);
  if (remaining < 0) return "expired";
  if (remaining <= reminderDays) return "expiring";
  return "active";
}

export const warrantyLabels: Record<WarrantyState, string> = {
  none: "No warranty recorded",
  active: "Under warranty",
  expiring: "Expiring soon",
  expired: "Warranty expired",
};

// ---------------------------------------------------------------------------
// Maintenance
// ---------------------------------------------------------------------------
export type TaskTiming = "overdue" | "due_soon" | "upcoming" | "done";

export const DUE_SOON_DAYS = 14;

export function taskTiming(task: { due_on: ISODate; status: string }, today: ISODate): TaskTiming {
  if (task.status !== "open") return "done";
  const diff = daysBetween(today, task.due_on);
  if (diff < 0) return "overdue";
  if (diff <= DUE_SOON_DAYS) return "due_soon";
  return "upcoming";
}

export type Recurrence = { interval: number; unit: IntervalUnit } | null;

/**
 * When a recurring task is completed, the next occurrence is scheduled from
 * the date the work was actually done (not the original due date), so a late
 * aircon service does not leave the next one already overdue.
 */
export function nextDueDate(recurrence: Recurrence, completedOn: ISODate): ISODate | null {
  if (!recurrence) return null;
  return addInterval(completedOn, recurrence.interval, recurrence.unit);
}

// ---------------------------------------------------------------------------
// Household health — a deterministic summary, not a score.
// ---------------------------------------------------------------------------
export type HealthInputs = {
  overdueTasks: number;
  dueSoonTasks: number;
  expiringWarranties: number;
  assetsNeedingAttention: number;
};

export type HealthLevel = "good" | "attention" | "action";

export function householdHealth(i: HealthInputs): { level: HealthLevel; headline: string } {
  if (i.overdueTasks > 0 || i.assetsNeedingAttention > 0) {
    const parts: string[] = [];
    if (i.overdueTasks) parts.push(`${i.overdueTasks} overdue task${i.overdueTasks === 1 ? "" : "s"}`);
    if (i.assetsNeedingAttention) parts.push(`${i.assetsNeedingAttention} item${i.assetsNeedingAttention === 1 ? "" : "s"} need${i.assetsNeedingAttention === 1 ? "s" : ""} attention`);
    return { level: "action", headline: capitalise(parts.join(" and ")) };
  }
  if (i.dueSoonTasks > 0 || i.expiringWarranties > 0) {
    const parts: string[] = [];
    if (i.dueSoonTasks) parts.push(`${i.dueSoonTasks} task${i.dueSoonTasks === 1 ? "" : "s"} due soon`);
    if (i.expiringWarranties) parts.push(`${i.expiringWarranties} warrant${i.expiringWarranties === 1 ? "y" : "ies"} expiring`);
    return { level: "attention", headline: capitalise(parts.join(", ")) };
  }
  return { level: "good", headline: "Everything is on track" };
}

function capitalise(s: string) {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
