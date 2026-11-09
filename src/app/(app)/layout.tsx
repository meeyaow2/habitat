import { cookies } from "next/headers";
import { AppShell } from "@/components/shell/app-shell";
import { withUser } from "@/lib/db";
import { aiConfigured } from "@/lib/ai/config";
import { getAppContext } from "@/lib/server/context";
import { listNotifications, syncNotifications } from "@/features/notifications/server";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getAppContext();
  // Public guest-capable pages (notably /home) render their own lightweight shell.
  // Other app pages still enforce household access inside their page loaders.
  if (!ctx?.household || !ctx.role) return children;
  const household = ctx.household;
  const collapsed = (await cookies()).get("habitat_sidebar")?.value === "collapsed";
  const notifications = await withUser(ctx.user.id, async (tx) => {
    await syncNotifications(tx, { householdId: household.id, userId: ctx.user.id, today: ctx.today, reminderDays: household.warranty_reminder_days });
    return listNotifications(tx, ctx.user.id, household.id);
  });
  return (
    <AppShell
      user={{
        name: ctx.profile.display_name || "You",
        colour: ctx.profile.avatar_color,
        email: ctx.user.email,
        isDemo: ctx.profile.is_demo,
      }}
      household={{ id: household.id, name: household.name }}
      memberships={ctx.memberships}
      initialCollapsed={collapsed}
      notifications={notifications}
      ai={{ configured: aiConfigured(), consented: !!ctx.profile.ai_consent_at }}
    >
      {children}
    </AppShell>
  );
}
