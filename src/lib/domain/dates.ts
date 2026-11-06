/**
 * Calendar-date helpers. Habitat stores due dates, purchase dates and warranty
 * dates as plain `YYYY-MM-DD` strings (Postgres `date`), and does arithmetic on
 * them in UTC so results never drift with the server's timezone.
 */
export type ISODate = string; // YYYY-MM-DD
export type IntervalUnit = "day" | "week" | "month" | "year";

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isISODate(value: unknown): value is ISODate {
  if (typeof value !== "string" || !ISO_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function toUTC(date: ISODate): Date {
  return new Date(`${date}T00:00:00Z`);
}

function fromUTC(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

/** Today's calendar date in the given IANA timezone. */
export function todayIn(timeZone = "Asia/Singapore", now: Date = new Date()): ISODate {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("year")}-${get("month")}-${get("day")}`;
}

export function addDays(date: ISODate, days: number): ISODate {
  const d = toUTC(date);
  d.setUTCDate(d.getUTCDate() + days);
  return fromUTC(d);
}

/**
 * Add a calendar interval. Months and years clamp to the last valid day, so
 * 31 Jan + 1 month = 28/29 Feb rather than rolling into March.
 */
export function addInterval(date: ISODate, amount: number, unit: IntervalUnit): ISODate {
  if (unit === "day") return addDays(date, amount);
  if (unit === "week") return addDays(date, amount * 7);
  const d = toUTC(date);
  const months = unit === "month" ? amount : amount * 12;
  const day = d.getUTCDate();
  const target = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(day, lastDay));
  return fromUTC(target);
}

/** Whole days from `a` to `b` (positive when b is later). */
export function daysBetween(a: ISODate, b: ISODate): number {
  return Math.round((toUTC(b).getTime() - toUTC(a).getTime()) / 86_400_000);
}

export function startOfMonth(date: ISODate): ISODate {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonth(date: ISODate): ISODate {
  const d = toUTC(startOfMonth(date));
  return fromUTC(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

export function formatDate(date: ISODate | null | undefined, locale = "en-SG", opts?: Intl.DateTimeFormatOptions): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", year: "numeric", timeZone: "UTC", ...opts }).format(toUTC(date));
}

export function formatMonth(date: ISODate, locale = "en-SG"): string {
  return new Intl.DateTimeFormat(locale, { month: "short", year: "numeric", timeZone: "UTC" }).format(toUTC(date));
}

/** "in 3 days", "2 days ago", "today", "tomorrow". */
export function relativeDays(date: ISODate, today: ISODate): string {
  const diff = daysBetween(today, date);
  if (diff === 0) return "today";
  if (diff === 1) return "tomorrow";
  if (diff === -1) return "yesterday";
  if (diff > 0) {
    if (diff < 45) return `in ${diff} days`;
    const months = Math.round(diff / 30);
    return months < 18 ? `in ${months} months` : `in ${Math.round(diff / 365)} years`;
  }
  const ago = -diff;
  if (ago < 45) return `${ago} days ago`;
  const months = Math.round(ago / 30);
  return months < 18 ? `${months} months ago` : `${Math.round(ago / 365)} years ago`;
}

export function describeInterval(amount: number, unit: IntervalUnit): string {
  if (amount === 1) return { day: "Daily", week: "Weekly", month: "Monthly", year: "Yearly" }[unit];
  return `Every ${amount} ${unit}s`;
}

export function formatDateTime(iso: string | Date, locale = "en-SG", timeZone = "Asia/Singapore"): string {
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "short", hour: "numeric", minute: "2-digit", timeZone }).format(new Date(iso));
}
