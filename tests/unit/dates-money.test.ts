import { describe, expect, it } from "vitest";
import { addDays, addInterval, daysBetween, describeInterval, endOfMonth, isISODate, relativeDays, todayIn } from "@/lib/domain/dates";
import { centsToInput, formatMoney, parseMoneyToCents, sumCents } from "@/lib/domain/money";

describe("dates", () => {
  it("validates ISO calendar dates strictly", () => {
    expect(isISODate("2026-02-28")).toBe(true);
    expect(isISODate("2026-02-30")).toBe(false);
    expect(isISODate("2026-2-3")).toBe(false);
    expect(isISODate(null)).toBe(false);
  });

  it("clamps month arithmetic to the last valid day", () => {
    expect(addInterval("2026-01-31", 1, "month")).toBe("2026-02-28");
    expect(addInterval("2028-01-31", 1, "month")).toBe("2028-02-29");
    expect(addInterval("2026-08-31", 3, "month")).toBe("2026-11-30");
    expect(addInterval("2024-02-29", 1, "year")).toBe("2025-02-28");
    expect(addInterval("2026-12-15", 1, "month")).toBe("2027-01-15");
    expect(addInterval("2026-03-10", -3, "month")).toBe("2025-12-10");
  });

  it("does day and week arithmetic across month and year boundaries", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addInterval("2026-11-06", 2, "week")).toBe("2026-11-20");
    expect(daysBetween("2026-11-06", "2026-11-27")).toBe(21);
    expect(daysBetween("2026-11-06", "2026-11-03")).toBe(-3);
    expect(endOfMonth("2026-02-10")).toBe("2026-02-28");
  });

  it("computes today in Singapore regardless of server timezone", () => {
    // 2026-11-05 17:30 UTC is already 6 Nov in Singapore (UTC+8).
    expect(todayIn("Asia/Singapore", new Date("2026-11-05T17:30:00Z"))).toBe("2026-11-06");
    expect(todayIn("UTC", new Date("2026-11-05T17:30:00Z"))).toBe("2026-11-05");
  });

  it("describes relative days and intervals in plain language", () => {
    expect(relativeDays("2026-11-06", "2026-11-06")).toBe("today");
    expect(relativeDays("2026-11-07", "2026-11-06")).toBe("tomorrow");
    expect(relativeDays("2026-11-03", "2026-11-06")).toBe("3 days ago");
    expect(relativeDays("2027-05-06", "2026-11-06")).toBe("in 6 months");
    expect(describeInterval(1, "month")).toBe("Monthly");
    expect(describeInterval(3, "month")).toBe("Every 3 months");
  });
});

describe("money", () => {
  it("parses user input into integer cents without float errors", () => {
    expect(parseMoneyToCents("1,299.90")).toBe(129990);
    expect(parseMoneyToCents("$45")).toBe(4500);
    expect(parseMoneyToCents("S$0.1")).toBe(10);
    expect(parseMoneyToCents("19.99")).toBe(1999); // 19.99*100 = 1998.9999… as a float
    expect(parseMoneyToCents("")).toBeNull();
    expect(parseMoneyToCents("12.345")).toBeNaN();
    expect(parseMoneyToCents("-5")).toBeNaN();
    expect(parseMoneyToCents("abc")).toBeNaN();
  });

  it("formats SGD and round-trips through the form", () => {
    expect(formatMoney(129990, "SGD")).toBe("$1,299.90");
    expect(formatMoney(null)).toBe("—");
    expect(centsToInput(129990)).toBe("1299.90");
    expect(parseMoneyToCents(centsToInput(1999))).toBe(1999);
  });

  it("sums cents exactly", () => {
    expect(sumCents([10, 20, null, undefined, 70])).toBe(100);
    expect(sumCents(Array(10).fill(10))).toBe(100); // 0.1 * 10 in floats would drift
  });
});
