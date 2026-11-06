import type { Metadata } from "next";
import { PageHeader, Panel, PanelHeader } from "@/components/ui/misc";
import { authMode, env, storageMode } from "@/lib/env";
import { requireHouseholdContext } from "@/lib/server/context";
import { AiConsent, DataControls, HouseholdForm, ProfileForm } from "@/features/household/settings-ui";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const ctx = await requireHouseholdContext();
  const aiConfigured = env.aiProvider === "anthropic" && !!env.anthropicApiKey;
  return (
    <div className="mx-auto max-w-3xl px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader title="Settings" />
      <div className="flex flex-col gap-6">
        <Panel>
          <PanelHeader title="Profile" description={ctx.profile.is_demo ? "Demo visitor" : ctx.user.email ?? undefined} />
          <div className="px-4 pb-5 sm:px-5"><ProfileForm name={ctx.profile.display_name} colour={ctx.profile.avatar_color} /></div>
        </Panel>
        <Panel>
          <PanelHeader title="Household" />
          <div className="px-4 pb-5 sm:px-5"><HouseholdForm name={ctx.household.name} reminderDays={ctx.household.warranty_reminder_days} isOwner={ctx.role === "owner"} /></div>
        </Panel>
        <Panel>
          <PanelHeader title="Region" />
          <dl className="grid grid-cols-1 gap-3 px-4 pb-5 text-sm sm:grid-cols-3 sm:px-5">
            <div><dt className="text-fg-muted">Currency</dt><dd className="font-medium">{ctx.household.currency}</dd></div>
            <div><dt className="text-fg-muted">Date format</dt><dd className="font-medium">{ctx.profile.locale} (e.g. 6 Nov 2026)</dd></div>
            <div><dt className="text-fg-muted">Time zone</dt><dd className="font-medium">{ctx.profile.timezone}</dd></div>
          </dl>
          <p className="border-t border-line px-4 py-3 text-xs text-fg-subtle sm:px-5">Stored per household and profile. Additional currencies and locales are on the roadmap; amounts are never converted.</p>
        </Panel>
        <Panel>
          <PanelHeader title="AI features" />
          <div className="px-4 pb-5 sm:px-5"><AiConsent consented={!!ctx.profile.ai_consent_at} configured={aiConfigured} /></div>
        </Panel>
        <Panel>
          <PanelHeader title="Privacy & data" description="Habitat never asks for your street address. Floor plans and documents are never public." />
          <div className="px-4 pb-5 sm:px-5"><DataControls isDemo={ctx.profile.is_demo} /></div>
          <dl className="grid grid-cols-1 gap-1 border-t border-line px-4 py-3 text-xs text-fg-subtle sm:grid-cols-2 sm:px-5">
            <div>Sign-in: {authMode() === "supabase" ? "Supabase Auth" : "Local accounts"}</div>
            <div>Document storage: {storageMode() === "supabase" ? "Supabase Storage (private bucket)" : "Private server storage"}</div>
          </dl>
        </Panel>
      </div>
    </div>
  );
}
