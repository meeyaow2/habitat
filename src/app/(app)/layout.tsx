import { cookies } from "next/headers";
import { AppShell } from "@/components/shell/app-shell";
import { requireHouseholdContext } from "@/lib/server/context";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireHouseholdContext();
  const collapsed = (await cookies()).get("habitat_sidebar")?.value === "collapsed";
  return (
    <AppShell
      user={{
        name: ctx.profile.display_name || "You",
        colour: ctx.profile.avatar_color,
        email: ctx.user.email,
        isDemo: ctx.profile.is_demo,
      }}
      household={{ id: ctx.household.id, name: ctx.household.name }}
      memberships={ctx.memberships}
      initialCollapsed={collapsed}
    >
      {children}
    </AppShell>
  );
}
