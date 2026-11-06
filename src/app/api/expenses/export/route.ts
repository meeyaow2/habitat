import { NextResponse, type NextRequest } from "next/server";
import { withUser } from "@/lib/db";
import { getAppContext } from "@/lib/server/context";
import { EXPENSE_LABELS, listExpenses, periodRange } from "@/features/expenses/queries";

/** Neutralise spreadsheet formula injection and quote every cell. */
function cell(value: unknown): string {
  let s = value === null || value === undefined ? "" : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export async function GET(req: NextRequest) {
  const ctx = await getAppContext();
  if (!ctx?.household) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const sp = req.nextUrl.searchParams;
  const period = sp.get("period") ?? "year";
  const range = periodRange(period, ctx.today);
  const category = sp.get("category");
  const asset = sp.get("asset");
  const rows = await withUser(ctx.user.id, (tx) =>
    listExpenses(tx, ctx.household!.id, {
      from: range.from,
      to: range.to,
      category: category && EXPENSE_LABELS[category] ? category : undefined,
      assetId: asset && /^[0-9a-f-]{36}$/i.test(asset) ? asset : undefined,
    }),
  );
  const header = ["Date", "Description", "Category", "Amount", "Currency", "Item", "Paid to"];
  const lines = [
    header.map(cell).join(","),
    ...rows.map((r) =>
      [r.incurred_on, r.description, EXPENSE_LABELS[r.category], (r.amount_cents / 100).toFixed(2), r.currency, r.asset_name, r.vendor].map(cell).join(","),
    ),
  ];
  return new NextResponse("﻿" + lines.join("\r\n") + "\r\n", {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="habitat-expenses-${ctx.today}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
