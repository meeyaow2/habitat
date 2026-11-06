"use client";

import { usePathname, useRouter } from "next/navigation";
import * as React from "react";
import type { RoomOption } from "@/features/shared/options";
import { AssetFormDialog } from "./asset-form";

/** Opens the add-item dialog when arriving via ?new=1 (e.g. from the setup checklist). */
export function NewAssetOnLoad({ rooms }: { rooms: RoomOption[] }) {
  const [open, setOpen] = React.useState(true);
  const router = useRouter();
  const pathname = usePathname();
  return (
    <AssetFormDialog
      open={open}
      rooms={rooms}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) router.replace(pathname, { scroll: false });
      }}
    />
  );
}
