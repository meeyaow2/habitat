import type { Metadata } from "next";
import { History, ShieldCheck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Avatar, EmptyState, Notice, PageHeader, Panel, PanelHeader } from "@/components/ui/misc";
import { withUser } from "@/lib/db";
import { formatDate, formatDateTime } from "@/lib/domain/dates";
import { requireHouseholdContext } from "@/lib/server/context";
import { InviteButton, MemberRow, RevokeInviteButton } from "@/features/household/household-ui";
import { listMembers } from "@/features/maintenance/queries";

export const metadata: Metadata = { title: "Household" };

export default async function HouseholdPage() {
  const ctx = await requireHouseholdContext();
  const isOwner = ctx.role === "owner";
  const data = await withUser(ctx.user.id, async (tx) => ({
    members: await listMembers(tx, ctx.household.id),
    // RLS returns invitations only to owners.
    invites: [...(await tx<{ id: string; email: string; role: string; expires_at: Date; created_at: Date; accepted_at: Date | null; revoked_at: Date | null }[]>`
      select id, email, role, expires_at, created_at, accepted_at, revoked_at from household_invitations
      where household_id = ${ctx.household.id} order by created_at desc limit 20`)],
    activity: [...(await tx<{ id: number; summary: string; created_at: Date; actor_name: string | null; actor_colour: string | null }[]>`
      select l.id, l.summary, l.created_at, p.display_name as actor_name, p.avatar_color as actor_colour
      from activity_logs l left join profiles p on p.id = l.actor_id
      where l.household_id = ${ctx.household.id} order by l.created_at desc, l.id desc limit 60`)],
  }));
  const ownerCount = data.members.filter((m) => m.role === "owner").length;
  const now = new Date();
  const pending = data.invites.filter((i) => !i.accepted_at && !i.revoked_at && new Date(i.expires_at) > now);
  const past = data.invites.filter((i) => !pending.includes(i)).slice(0, 6);

  return (
    <div className="mx-auto max-w-[1100px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
      <PageHeader title={ctx.household.name} eyebrow="Household" description="Everyone here shares the same home, items, documents and history." actions={isOwner && <InviteButton disabled={ctx.profile.is_demo} />} />
      {ctx.profile.is_demo && <Notice tone="warning" className="mb-6">Invitations are turned off in demo mode.</Notice>}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-7">
          <Panel>
            <PanelHeader title="Members" description={`${data.members.length} ${data.members.length === 1 ? "person" : "people"}`} />
            <ul className="divide-y divide-line border-t border-line">
              {data.members.map((m) => (
                <MemberRow key={m.user_id} m={{ ...m, joined: formatDate(new Date(m.joined_at).toISOString().slice(0, 10)) }} isOwner={isOwner} isSelf={m.user_id === ctx.user.id} ownerCount={ownerCount} />
              ))}
            </ul>
          </Panel>

          {isOwner && (
            <Panel>
              <PanelHeader title="Invitations" description="Links expire after 7 days and only work for the invited email." />
              {pending.length === 0 && past.length === 0 ? (
                <p className="px-4 pb-5 text-sm text-fg-muted sm:px-5">No invitations yet.</p>
              ) : (
                <ul className="divide-y divide-line border-t border-line">
                  {pending.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium">{i.email}</p>
                        <p className="text-xs text-fg-muted">Invited as {i.role} · expires {formatDateTime(i.expires_at)}</p>
                      </div>
                      <Badge tone="info">Pending</Badge>
                      <RevokeInviteButton id={i.id} email={i.email} />
                    </li>
                  ))}
                  {past.map((i) => (
                    <li key={i.id} className="flex items-center gap-3 px-4 py-3 text-fg-muted sm:px-5">
                      <p className="min-w-0 flex-1 truncate text-sm">{i.email}</p>
                      <Badge tone={i.accepted_at ? "success" : "neutral"}>{i.accepted_at ? "Accepted" : i.revoked_at ? "Revoked" : "Expired"}</Badge>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          )}

          <Panel>
            <PanelHeader title="What each role can do" />
            <div className="grid gap-4 px-4 pb-5 text-sm sm:grid-cols-2 sm:px-5">
              <div>
                <p className="flex items-center gap-1.5 font-medium"><ShieldCheck className="size-4 text-accent" aria-hidden /> Owner</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-fg-muted">
                  <li>Everything a member can do</li>
                  <li>Manage property settings and layout resets</li>
                  <li>Invite, remove and change roles</li>
                  <li>Edit or delete any record</li>
                </ul>
              </div>
              <div>
                <p className="font-medium">Member</p>
                <ul className="mt-1.5 list-disc space-y-1 pl-5 text-fg-muted">
                  <li>See all household records</li>
                  <li>Add and edit items; edit the floor plan</li>
                  <li>Record maintenance, repairs and expenses</li>
                  <li>Update tasks they created or are assigned</li>
                </ul>
              </div>
            </div>
            <p className="border-t border-line px-4 py-3 text-xs text-fg-subtle sm:px-5">Permissions are enforced by the database, not just hidden in the interface.</p>
          </Panel>
        </div>

        <Panel className="min-w-0 lg:col-span-5" id="activity">
          <PanelHeader title="Activity" description="Shared history of changes" />
          {data.activity.length === 0 ? (
            <EmptyState compact icon={<History />} title="No activity yet" />
          ) : (
            <ol className="px-4 pb-4 sm:px-5">
              {data.activity.map((a) => (
                <li key={a.id} className="flex gap-2.5 py-1.5">
                  <Avatar name={a.actor_name} colour={a.actor_colour ?? undefined} size="sm" className="mt-0.5" />
                  <p className="min-w-0 text-sm leading-5">
                    <span className="font-medium">{a.actor_name?.split(" ")[0] ?? "Someone"}</span> <span className="text-fg-muted">{a.summary}</span>
                    <span className="block text-[11px] text-fg-subtle">{formatDateTime(a.created_at)}</span>
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Panel>
      </div>
    </div>
  );
}
