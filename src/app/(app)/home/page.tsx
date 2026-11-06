import type { Metadata } from "next";
import Link from "next/link";
import { House } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Panel } from "@/components/ui/misc";
import { withUser } from "@/lib/db";
import { addDays } from "@/lib/domain/dates";
import { DUE_SOON_DAYS } from "@/lib/domain/status";
import { requireHouseholdContext } from "@/lib/server/context";
import { listAssetOptions } from "@/features/assets/queries";
import { HomeTwin } from "@/features/home/home-twin";
import type { TwinAsset } from "@/features/home/edit-panels";
import { getFloors, getPrimaryProperty, loadFloorDoc } from "@/features/home/server";
import { listMembers } from "@/features/maintenance/queries";

export const metadata: Metadata = { title: "My Home" };

type SP = { floor?: string; edit?: string; asset?: string; welcome?: string };

export default async function HomePage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const ctx = await requireHouseholdContext();
  const hid = ctx.household.id;
  const today = ctx.today;
  const soon = addDays(today, DUE_SOON_DAYS);
  const warrantySoon = addDays(today, ctx.household.warranty_reminder_days);

  const data = await withUser(ctx.user.id, async (tx) => {
    const property = await getPrimaryProperty(tx, hid);
    if (!property) return null;
    const floors = await getFloors(tx, property.id);
    if (floors.length === 0) return { property, floors, floor: null };
    let floor = floors.find((f) => f.id === sp.floor) ?? floors[0];
    // Deep link to an asset on another floor: open that floor.
    if (sp.asset && /^[0-9a-f-]{36}$/i.test(sp.asset) && !sp.floor) {
      const [o] = await tx<{ floor_id: string }[]>`select floor_id from floor_plan_objects where asset_id = ${sp.asset}`;
      floor = floors.find((f) => f.id === o?.floor_id) ?? floor;
    }
    const [doc, assets, assetOptions, members] = await Promise.all([
      loadFloorDoc(tx, floor.id),
      tx<(TwinAsset & { status: string; overdue: number; due_soon: number; warranty: string | null })[]>`
        select a.id, a.name, a.category_id, a.room_id, r.name as room_name, a.status, o.floor_id as placed_floor_id,
               (select count(*)::int from maintenance_tasks t where t.asset_id = a.id and t.status = 'open' and t.due_on < ${today}) as overdue,
               (select count(*)::int from maintenance_tasks t where t.asset_id = a.id and t.status = 'open' and t.due_on between ${today} and ${soon}) as due_soon,
               (select max(expires_on) from warranties w where w.asset_id = a.id) as warranty
        from assets a
        left join rooms r on r.id = a.room_id
        left join floor_plan_objects o on o.asset_id = a.id
        where a.household_id = ${hid} and a.archived_at is null
        order by lower(a.name)
      `,
      listAssetOptions(tx, hid),
      listMembers(tx, hid),
    ]);
    const twinAssets: TwinAsset[] = assets.map((a) => {
      const danger = a.status === "needs_attention" || a.status === "in_repair" || a.overdue > 0;
      const expiring = a.warranty !== null && a.warranty >= today && a.warranty <= warrantySoon;
      const warning = !danger && (a.due_soon > 0 || expiring);
      const reason = a.status === "needs_attention" ? "Needs attention" : a.status === "in_repair" ? "In repair" : a.overdue > 0 ? `${a.overdue} overdue task${a.overdue > 1 ? "s" : ""}` : a.due_soon > 0 ? "Maintenance due soon" : expiring ? "Warranty expiring" : null;
      return { id: a.id, name: a.name, category_id: a.category_id, room_id: a.room_id, room_name: a.room_name, placed_floor_id: a.placed_floor_id, tone: danger ? "danger" : warning ? "warning" : "neutral", reason };
    });
    return { property, floors, floor, doc, assets: twinAssets, assetOptions, members };
  });

  if (!data || !data.floor) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        <Panel>
          <EmptyState icon={<House />} title="Your home isn’t set up yet" description="Choose a property type and a starting layout to create your floor plan." action={<Button asChild variant="primary"><Link href="/onboarding">Set up my home</Link></Button>} />
        </Panel>
      </div>
    );
  }

  return (
    <HomeTwin
      key={data.floor.id}
      property={data.property}
      isOwner={ctx.role === "owner"}
      floors={data.floors}
      floorId={data.floor.id}
      doc={data.doc!}
      assets={data.assets!}
      assetOptions={data.assetOptions!}
      members={data.members!}
      initialEdit={sp.edit === "1"}
      initialAssetId={sp.asset ?? null}
      welcome={sp.welcome === "1"}
    />
  );
}
