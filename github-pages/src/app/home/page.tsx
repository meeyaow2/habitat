import * as React from "react";
import type { Metadata } from "next";
import { GuestHome } from "./guest-home";

export const metadata: Metadata = { title: "My home" };

export default function HomePage() {
  return (
    <React.Suspense fallback={<main className="grid min-h-dvh place-items-center bg-bg text-sm text-fg-muted">Opening your floor plan…</main>}>
      <GuestHome />
    </React.Suspense>
  );
}
