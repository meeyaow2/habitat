/**
 * Column decoding shared by the app and tests:
 *  - `date` stays a plain YYYY-MM-DD string (never a JS Date), so calendar
 *    dates are never shifted by timezone conversion.
 *  - int8 becomes a number. Money columns are capped below 10^12 by
 *    constraints, well inside Number.MAX_SAFE_INTEGER.
 */
export const pgTypes = {
  date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
  bigint: { to: 20, from: [20], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
};
