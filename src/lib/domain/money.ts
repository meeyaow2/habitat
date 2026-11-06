/** Money is always integer minor units. Never use floats for totals. */
export function formatMoney(cents: number | null | undefined, currency = "SGD", locale = "en-SG", opts?: { compact?: boolean }): string {
  if (cents === null || cents === undefined) return "—";
  const value = cents / 100;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    currencyDisplay: currency === "SGD" ? "narrowSymbol" : "symbol",
    minimumFractionDigits: opts?.compact && Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

/**
 * Parse user input such as "1,299.90", "$45" or "45.5" into cents.
 * Returns null for empty input and NaN for invalid input.
 */
export function parseMoneyToCents(input: string | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  const cleaned = String(input).trim().replace(/[\s,]/g, "").replace(/^(S\$|\$|SGD)/i, "");
  if (cleaned === "") return null;
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return Number.NaN;
  const [whole, fraction = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

export function centsToInput(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return "";
  return (cents / 100).toFixed(2);
}

export function sumCents(values: Array<number | null | undefined>): number {
  return values.reduce<number>((acc, v) => acc + (v ?? 0), 0);
}
