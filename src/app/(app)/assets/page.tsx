import type { Metadata } from "next";
import { PageHeader } from "@/components/ui/misc";
import { withUser } from "@/lib/db";
import { requireHouseholdContext } from "@/lib/server/context";
import { AssetBrowser } from "@/features/assets/asset-browser";
import { listAssets, listRooms, type AssetFilters } from "@/features/assets/queries";
import { AddAssetButton } from "@/features/overview/quick-actions";
import { CATEGORY_IDS } from "@/lib/domain/categories";
import { NewAssetOnLoad } from "@/features/assets/new-on-load";

export const metadata: Metadata = { title: "Appliances & Assets" };

type SP = Record<string, string | undefined>;

function parseFilters(sp: SP): AssetFilters {
  const pick = <T extends string>(v: string | undefined, allowed: readonly T[]) => (v && allowed.includes(v as T) ? (v as T) : undefined);
  return {
    q: sp.q?.slice(0, 100),
    category: pick(sp.category, CATEGORY_IDS),
    room: sp.room && /^([0-9a-f-]{36}|none)$/i.test(sp.room) ? sp.room : undefined,
    status: pick(sp.status, ["attention", "active", "needs_attention", "in_repair", "retired"] as const),
    warranty: pick(sp.warranty, ["active", "expiring", "expired", "none"] as const),
    archived: sp.archived === "1",
    sort: pick(sp.sort, ["name", "recent", "warranty", "due", "cost"] as const),
  };
}

export default async function AssetsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const ctx = await requireHouseholdContext();
  const sp = await searchParams;
  const filters = parseFilters(sp);
  const { assets, rooms, all } = await withUser(ctx.user.id, async (tx) => ({
    assets: await listAssets(tx, ctx.household.id, ctx.today, ctx.household.warranty_reminder_days, filters),
    rooms: await listRooms(tx, ctx.household.id),
    all: await tx<{ category_id: string; n: number }[]>`
      select category_id, count(*)::int as n from assets where household_id = ${ctx.household.id} and archived_at is null group by 1`,
  }));
  const categoryCounts = Object.fromEntries(all.map((r) => [r.category_id, r.n]));
  const totalActive = all.reduce((s, r) => s + r.n, 0);

  return (
    <div className="mx-auto max-w-[1240px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader
        title="Appliances & Assets"
        description="Everything in your home that has a warranty, needs upkeep, or is worth keeping a record of."
        actions={<AddAssetButton rooms={rooms} label="Add item" />}
      />
      <AssetBrowser
        assets={assets}
        rooms={rooms}
        today={ctx.today}
        reminderDays={ctx.household.warranty_reminder_days}
        currency={ctx.household.currency}
        totalActive={totalActive}
        categoryCounts={categoryCounts}
      />
      {sp.new === "1" && <NewAssetOnLoad rooms={rooms} />}
    </div>
  );
}
