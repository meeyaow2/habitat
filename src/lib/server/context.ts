import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { getSessionUser, type SessionUser } from "@/lib/auth";
import { withUser } from "@/lib/db";
import { todayIn, type ISODate } from "@/lib/domain/dates";

export type Role = "owner" | "member";

export type Profile = {
  id: string;
  display_name: string;
  avatar_color: string;
  locale: string;
  currency: string;
  timezone: string;
  is_demo: boolean;
  active_household_id: string | null;
  onboarding_step: string;
  onboarding_completed_at: string | null;
  ai_consent_at: string | null;
};

export type Household = {
  id: string;
  name: string;
  currency: string;
  locale: string;
  warranty_reminder_days: number;
  is_demo: boolean;
};

export type Membership = { id: string; name: string; role: Role };

export type AppContext = {
  user: SessionUser;
  profile: Profile;
  household: Household | null;
  role: Role | null;
  memberships: Membership[];
  today: ISODate;
};

/** Loads the signed-in user's profile and active household. Memoised per request. */
export const getAppContext = cache(async (): Promise<AppContext | null> => {
  const user = await getSessionUser();
  if (!user) return null;

  return withUser(user.id, async (tx) => {
    const [profile] = await tx<Profile[]>`
      select id, display_name, avatar_color, locale, currency, timezone, is_demo,
             active_household_id, onboarding_step, onboarding_completed_at, ai_consent_at
      from profiles where id = ${user.id}
    `;
    if (!profile) return null;

    const memberships = await tx<Membership[]>`
      select h.id, h.name, m.role
      from household_members m join households h on h.id = m.household_id
      where m.user_id = ${user.id}
      order by m.joined_at
    `;

    const activeId =
      memberships.find((m) => m.id === profile.active_household_id)?.id ?? memberships[0]?.id ?? null;

    let household: Household | null = null;
    if (activeId) {
      [household] = await tx<Household[]>`
        select id, name, currency, locale, warranty_reminder_days, is_demo from households where id = ${activeId}
      `;
    }

    return {
      user,
      profile,
      household: household ?? null,
      role: memberships.find((m) => m.id === activeId)?.role ?? null,
      memberships: [...memberships],
      today: todayIn(profile.timezone),
    };
  });
});

export type HouseholdContext = AppContext & { household: Household; role: Role };

/** For pages inside the app: requires sign-in and a household. */
export async function requireHouseholdContext(): Promise<HouseholdContext> {
  const ctx = await getAppContext();
  if (!ctx) redirect("/sign-in");
  if (!ctx.household || !ctx.role) redirect("/onboarding");
  return ctx as HouseholdContext;
}
