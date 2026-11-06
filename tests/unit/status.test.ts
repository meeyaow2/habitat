import { describe, expect, it } from "vitest";
import { householdHealth, nextDueDate, taskTiming, warrantyState } from "@/lib/domain/status";

describe("warranty state", () => {
  const today = "2026-11-06";
  it("classifies against the reminder window", () => {
    expect(warrantyState(null, today, 60)).toBe("none");
    expect(warrantyState("2026-11-05", today, 60)).toBe("expired");
    expect(warrantyState("2026-11-06", today, 60)).toBe("expiring");
    expect(warrantyState("2027-01-05", today, 60)).toBe("expiring");
    expect(warrantyState("2027-01-06", today, 60)).toBe("active");
    expect(warrantyState("2026-12-01", today, 14)).toBe("active");
  });
});

describe("task timing", () => {
  const today = "2026-11-06";
  it("flags overdue, due soon and upcoming open tasks", () => {
    expect(taskTiming({ due_on: "2026-11-05", status: "open" }, today)).toBe("overdue");
    expect(taskTiming({ due_on: "2026-11-06", status: "open" }, today)).toBe("due_soon");
    expect(taskTiming({ due_on: "2026-11-20", status: "open" }, today)).toBe("due_soon");
    expect(taskTiming({ due_on: "2026-11-21", status: "open" }, today)).toBe("upcoming");
    expect(taskTiming({ due_on: "2026-01-01", status: "completed" }, today)).toBe("done");
  });
});

describe("recurrence", () => {
  it("schedules the next occurrence from the completion date", () => {
    expect(nextDueDate({ interval: 3, unit: "month" }, "2026-11-20")).toBe("2027-02-20");
    expect(nextDueDate({ interval: 1, unit: "month" }, "2026-01-31")).toBe("2026-02-28");
    expect(nextDueDate({ interval: 2, unit: "week" }, "2026-11-06")).toBe("2026-11-20");
    expect(nextDueDate(null, "2026-11-06")).toBeNull();
  });
});

describe("household health", () => {
  it("summarises deterministically", () => {
    expect(householdHealth({ overdueTasks: 0, dueSoonTasks: 0, expiringWarranties: 0, assetsNeedingAttention: 0 })).toEqual({ level: "good", headline: "Everything is on track" });
    expect(householdHealth({ overdueTasks: 0, dueSoonTasks: 2, expiringWarranties: 1, assetsNeedingAttention: 0 })).toEqual({ level: "attention", headline: "2 tasks due soon, 1 warranty expiring" });
    expect(householdHealth({ overdueTasks: 1, dueSoonTasks: 4, expiringWarranties: 0, assetsNeedingAttention: 2 })).toEqual({ level: "action", headline: "1 overdue task and 2 items need attention" });
  });
});
