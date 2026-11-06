import { cookies } from "next/headers";
import { AppShell } from "@/components/shell/app-shell";
import { withUser } from "@/lib/db";
import { aiConfigured } from "@/lib/ai/config";
import { requireHouseholdContext } from "@/lib/server/context";
import { listNotifications, syncNotifications } from "@/features/notifications/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await requireHouseholdContext();
  const collapsed = (await cookies()).get("habitat_sidebar")?.value === "collapsed";
  const notifications = await withUser(ctx.user.id, async (tx) => {
    await syncNotifications(tx, { householdId: ctx.household.id, userId: ctx.user.id, today: ctx.today, reminderDays: ctx.household.warranty_reminder_days });
    return listNotifications(tx, ctx.user.id, ctx.household.id);
  });
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
      notifications={notifications}
      ai={{ configured: aiConfigured(), consented: !!ctx.profile.ai_consent_at }}
    >
      {children}
    </AppShell>
  );
}
