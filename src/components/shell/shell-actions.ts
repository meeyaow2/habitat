"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { withUser } from "@/lib/db";
import { getAppContext } from "@/lib/server/context";

export async function switchHouseholdAction(householdId: string) {
  const ctx = await getAppContext();
  if (!ctx) redirect("/sign-in");
  const id = z.guid().parse(householdId);
  if (!ctx.memberships.some((m) => m.id === id)) return;
  await withUser(ctx.user.id, (tx) => tx`update profiles set active_household_id = ${id} where id = ${ctx.user.id}`);
  redirect("/overview");
}

export async function setSidebarCollapsedAction(collapsed: boolean) {
  (await cookies()).set("habitat_sidebar", collapsed ? "collapsed" : "expanded", {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
  });
}
