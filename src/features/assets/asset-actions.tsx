"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import * as React from "react";
import { Archive, ArchiveRestore, CalendarPlus, CircleCheck, Hammer, MapPin, MoreHorizontal, Pencil, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { useAction } from "@/lib/client/use-action";
import { RecordEventDialog } from "@/features/maintenance/complete-dialog";
import { emptyTask, TaskFormDialog } from "@/features/maintenance/task-form";
import type { AssetOption, MemberOption, RoomOption } from "@/features/shared/options";
import { archiveAssetAction, deleteAssetAction, setAssetStatusAction } from "./actions";
import { AssetFormDialog, type AssetFormValues } from "./asset-form";

export function AssetActions({
  asset,
  form,
  rooms,
  assets,
  members,
  canDelete,
}: {
  asset: { id: string; name: string; status: string; archived: boolean; placed: boolean };
  form: AssetFormValues;
  rooms: RoomOption[];
  assets: AssetOption[];
  members: MemberOption[];
  canDelete: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState<null | "edit" | "task" | "repair" | "delete">(null);
  const archive = useAction(archiveAssetAction, { success: asset.archived ? "Item restored" : "Item archived" });
  const del = useAction(deleteAssetAction, { success: `Deleted ${asset.name}` });
  const status = useAction(setAssetStatusAction, { success: "Status updated" });

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setOpen("edit")}><Pencil aria-hidden /> Edit</Button>
        {!asset.archived && (
          <>
            <Button variant="secondary" onClick={() => setOpen("task")}><CalendarPlus aria-hidden /> Schedule</Button>
            <Button variant="secondary" onClick={() => setOpen("repair")} className="hidden sm:inline-flex"><Hammer aria-hidden /> Record repair</Button>
            <Button variant="secondary" asChild>
              <Link href={`/home?asset=${asset.id}${asset.placed ? "" : "&edit=1"}`}><MapPin aria-hidden /> {asset.placed ? "Show on plan" : "Place on plan"}</Link>
            </Button>
          </>
        )}
        <Menu>
          <MenuTrigger asChild>
            <Button variant="secondary" size="icon" aria-label="More actions"><MoreHorizontal aria-hidden /></Button>
          </MenuTrigger>
          <MenuContent>
            <MenuItem className="sm:hidden" onSelect={() => setOpen("repair")}><Hammer /> Record repair</MenuItem>
            {asset.status === "needs_attention" || asset.status === "in_repair" ? (
              <MenuItem onSelect={() => status.run({ id: asset.id, status: "active" })}><CircleCheck /> Mark as working normally</MenuItem>
            ) : (
              <MenuItem onSelect={() => status.run({ id: asset.id, status: "needs_attention" })}><TriangleAlert /> Flag as needing attention</MenuItem>
            )}
            <MenuItem onSelect={() => archive.run({ id: asset.id, archived: !asset.archived })}>
              {asset.archived ? <><ArchiveRestore /> Restore</> : <><Archive /> Archive</>}
            </MenuItem>
            {canDelete && (
              <>
                <MenuSeparator />
                <MenuItem tone="danger" onSelect={() => setOpen("delete")}><Trash2 /> Delete permanently</MenuItem>
              </>
            )}
          </MenuContent>
        </Menu>
      </div>

      <AssetFormDialog open={open === "edit"} onOpenChange={(o) => setOpen(o ? "edit" : null)} rooms={rooms} initial={form} assetId={asset.id} />
      <TaskFormDialog open={open === "task"} onOpenChange={(o) => setOpen(o ? "task" : null)} assets={assets} members={members} initial={emptyTask({ assetId: asset.id })} />
      <RecordEventDialog open={open === "repair"} onOpenChange={(o) => setOpen(o ? "repair" : null)} assets={assets} defaultAssetId={asset.id} />
      <ConfirmDialog
        open={open === "delete"}
        onOpenChange={(o) => setOpen(o ? "delete" : null)}
        title={`Delete ${asset.name}?`}
        confirmLabel="Delete permanently"
        description={
          <div className="space-y-2">
            <p>This can’t be undone. If you might need its history, archive it instead.</p>
            <ul className="list-disc space-y-1 pl-5">
              <li><strong className="font-medium text-fg">Removed:</strong> the item, its floor-plan marker, warranties and scheduled tasks.</li>
              <li><strong className="font-medium text-fg">Kept:</strong> expenses and service history (with the item’s name), and documents (unlinked, still in your library).</li>
            </ul>
          </div>
        }
        onConfirm={async () => {
          const ok = await del.run({ id: asset.id });
          if (ok) router.push("/assets");
        }}
      />
    </>
  );
}
