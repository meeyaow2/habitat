"use client";

import dynamic from "next/dynamic";
import type { FloorDoc } from "@/features/home/model";

const Viewer3D = dynamic(() => import("@/features/home/viewer-3d").then((m) => m.Viewer3D), {
  ssr: false,
  loading: () => <div className="skeleton h-[calc(100dvh-180px)] min-h-[420px] w-full" aria-label="Loading 3D preview" />,
});

export function Viewer3DLoader(props: { doc: FloorDoc; pins: Record<string, { assetId: string; name: string; tone: "neutral" | "warning" | "danger" }> }) {
  return <Viewer3D {...props} />;
}
