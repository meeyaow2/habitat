import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { withUser } from "@/lib/db";
import { getAppContext } from "@/lib/server/context";
import { listRooms } from "@/features/assets/queries";
import { getPrimaryProperty } from "@/features/home/server";
import { OnboardingFlow } from "@/features/onboarding/flow";
import { GuestSetup } from "@/features/guest/setup";

export const metadata: Metadata = { title: "Set up your home" };

export default async function OnboardingPage() {
  const ctx = await getAppContext();
  if (!ctx) return <GuestSetup />;

  // People who joined an existing household skip setup.
  if (ctx.household && ctx.role === "member") redirect("/overview");
  if (ctx.household && ctx.profile.onboarding_step === "done") redirect("/overview");

  const { property, rooms } = ctx.household
    ? await withUser(ctx.user.id, async (tx) => ({
        property: await getPrimaryProperty(tx, ctx.household!.id),
        rooms: await listRooms(tx, ctx.household!.id),
      }))
    : { property: null, rooms: [] };

  let step = ctx.profile.onboarding_step as "welcome" | "home" | "layout" | "appliance" | "explore";
  if (!ctx.household && step !== "welcome") step = "home";
  if (ctx.household && !property) step = "home";

  const firstName = (ctx.profile.display_name || "").split(" ")[0];
  return (
    <OnboardingFlow
      initialStep={step}
      defaults={{
        householdName: ctx.household?.name ?? (firstName ? `${firstName}’s household` : "My household"),
        propertyName: property?.name ?? "",
        propertyType: (property?.property_type as "hdb") ?? "hdb",
        hdbFlatType: property?.hdb_flat_type ?? "4_room",
      }}
      rooms={rooms}
    />
  );
}
