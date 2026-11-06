import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { withUser } from "@/lib/db";
import { requireHouseholdContext } from "@/lib/server/context";
import { getFloors, getPrimaryProperty, loadFloorDoc } from "@/features/home/server";
import { Viewer3DLoader } from "./loader";

export const metadata: Metadata = { title: "3D preview" };

export default async function ThreeDPage({ searchParams }: { searchParams: Promise<{ floor?: string }> }) {
  const sp = await searchParams;
  const ctx = await requireHouseholdContext();
  const data = await withUser(ctx.user.id, async (tx) => {
    const property = await getPrimaryProperty(tx, ctx.household.id);
    if (!property) return null;
    const floors = await getFloors(tx, property.id);
    const floor = floors.find((f) => f.id === sp.floor) ?? floors[0];
    if (!floor) return null;
    const doc = await loadFloorDoc(tx, floor.id);
    const assets = await tx<{ id: string; name: string; status: string; overdue: number }[]>`
      select a.id, a.name, a.status,
             (select count(*)::int from maintenance_tasks t where t.asset_id = a.id and t.status = 'open' and t.due_on < ${ctx.today}) as overdue
      from assets a where a.household_id = ${ctx.household.id} and a.archived_at is null`;
    return { property, floor, floors, doc, assets };
  });
  if (!data) return <p className="p-8">Set up your home first.</p>;
  const pins = Object.fromEntries(
    data.assets.map((a) => [a.id, { name: a.name, tone: (a.status === "needs_attention" || a.status === "in_repair" || a.overdue > 0 ? "danger" : "neutral") as "danger" | "neutral" }]),
  );
  return (
    <div className="px-4 py-4 sm:px-6">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Link href={`/home?floor=${data.floor.id}`} className="inline-flex items-center gap-1 text-sm text-fg-muted hover:text-fg"><ChevronLeft className="size-4" aria-hidden /> Floor plan</Link>
        <h1 className="text-lg font-semibold">{data.property.name} · {data.floor.name}</h1>
        <Badge tone="info">Preview</Badge>
        <p className="w-full text-xs text-fg-muted sm:ml-auto sm:w-auto">Generated from your 2D plan. Edit the layout in the floor plan; walls are shown low so you can see inside.</p>
      </div>
      <Viewer3DLoader doc={data.doc} wallHeight={data.floor.wall_height_cm} pins={pins} />
    </div>
  );
}
