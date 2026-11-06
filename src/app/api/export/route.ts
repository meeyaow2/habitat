import { NextResponse } from "next/server";
import { withUser } from "@/lib/db";
import { getAppContext } from "@/lib/server/context";
import { rateLimit } from "@/lib/server/rate-limit";

/** Full export of the active household's records, read under RLS. */
export async function GET() {
  const ctx = await getAppContext();
  if (!ctx?.household) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  try {
    rateLimit(`export:${ctx.user.id}`, 10, 60 * 60_000);
  } catch {
    return NextResponse.json({ error: "Too many exports. Try again later." }, { status: 429 });
  }
  const hid = ctx.household.id;
  const data = await withUser(ctx.user.id, async (tx) => {
    const t = async (name: string, rows: PromiseLike<readonly unknown[]>) => [name, [...(await rows)]] as const;
    return Object.fromEntries(
      await Promise.all([
        t("household", tx`select id, name, currency, locale, warranty_reminder_days, created_at from households where id = ${hid}`),
        t("members", tx`select p.display_name, m.role, m.joined_at from household_members m join profiles p on p.id = m.user_id where m.household_id = ${hid}`),
        t("properties", tx`select * from properties where household_id = ${hid}`),
        t("floors", tx`select * from floors where household_id = ${hid}`),
        t("rooms", tx`select * from rooms where household_id = ${hid}`),
        t("floor_plan_objects", tx`select * from floor_plan_objects where household_id = ${hid}`),
        t("assets", tx`select * from assets where household_id = ${hid}`),
        t("warranties", tx`select * from warranties where household_id = ${hid}`),
        t("maintenance_tasks", tx`select * from maintenance_tasks where household_id = ${hid}`),
        t("maintenance_events", tx`select * from maintenance_events where household_id = ${hid}`),
        t("expenses", tx`select * from expenses where household_id = ${hid}`),
        t("documents", tx`select id, asset_id, kind, title, mime_type, size_bytes, original_filename, document_date, notes, created_at from documents where household_id = ${hid}`),
        t("activity", tx`select actor_id, action, entity_type, entity_id, summary, created_at from activity_logs where household_id = ${hid} order by created_at`),
      ]),
    );
  });
  return new NextResponse(JSON.stringify({ exported_at: new Date().toISOString(), format: "habitat-export/1", ...data }, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="habitat-export-${ctx.today}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
