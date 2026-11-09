"use client";

import * as React from "react";
import { useSearchParams } from "next/navigation";
import { GuestEditor } from "@/features/guest/editor";
import { createOwnGuestHome, createSampleGuestHome } from "@/features/guest/data";

export function GuestHome() {
  const searchParams = useSearchParams();
  const kind = searchParams.get("guest") === "own" ? "own" : "sample";
  const initialHome = React.useMemo(
    () => kind === "own" ? createOwnGuestHome("hdb_4_room") : createSampleGuestHome(),
    [kind],
  );

  return <GuestEditor key={kind} initialHome={initialHome} initialEdit={searchParams.get("edit") === "1"} />;
}
