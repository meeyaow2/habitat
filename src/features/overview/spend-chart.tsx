import { formatMonth, type ISODate } from "@/lib/domain/dates";
import { formatMoney } from "@/lib/domain/money";

/**
 * Six-month maintenance spending. Single series, direct labels, no gridlines.
 * Purchases are excluded (they would dwarf upkeep costs); a data table is
 * provided for screen readers.
 */
export function SpendChart({ months, currency }: { months: { month: ISODate; maintenance: number }[]; currency: string }) {
  const max = Math.max(...months.map((m) => m.maintenance), 1);
  const h = 120;
  return (
    <figure className="px-4 pb-4 sm:px-5">
      <div className="flex h-[156px] items-end gap-2 sm:gap-3" aria-hidden>
        {months.map((m, i) => {
          const bar = Math.round((m.maintenance / max) * h);
          const current = i === months.length - 1;
          return (
            <div key={m.month} className="flex min-w-0 flex-1 flex-col items-center gap-1.5" title={`${formatMonth(m.month)}: ${formatMoney(m.maintenance, currency)}`}>
              <span className={`text-[11px] tabular-nums ${current ? "font-semibold text-fg" : "text-fg-subtle"}`}>
                {m.maintenance ? formatMoney(m.maintenance, currency, "en-SG", { compact: true }).replace(".00", "") : ""}
              </span>
              <div
                className={`w-full max-w-10 rounded-t-[3px] ${current ? "bg-accent" : "bg-[#b9cbbf]"}`}
                style={{ height: Math.max(bar, m.maintenance ? 3 : 1), opacity: m.maintenance ? 1 : 0.5 }}
              />
              <span className="text-[11px] text-fg-muted">{formatMonth(m.month).split(" ")[0]}</span>
            </div>
          );
        })}
      </div>
      <table className="sr-only">
        <caption>Maintenance spending by month</caption>
        <tbody>
          {months.map((m) => (
            <tr key={m.month}>
              <th scope="row">{formatMonth(m.month)}</th>
              <td>{formatMoney(m.maintenance, currency)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
