import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/brand";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/misc";
import { adminSql } from "@/lib/db";
import { getAppContext } from "@/lib/server/context";
import { hashToken } from "@/features/household/tokens";
import { AcceptInviteButton } from "./accept";

export const metadata: Metadata = { title: "Join a household", robots: { index: false } };

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const ctx = await getAppContext();
  // Minimal, non-sensitive preview: the household name and inviter's first name only.
  const [inv] = /^[\w-]{20,100}$/.test(token)
    ? await adminSql()<{ household: string; inviter: string | null; email: string; expired: boolean; used: boolean }[]>`
        select h.name as household, split_part(p.display_name, ' ', 1) as inviter, i.email,
               i.expires_at < now() as expired, (i.accepted_at is not null or i.revoked_at is not null) as used
        from household_invitations i join households h on h.id = i.household_id left join profiles p on p.id = i.invited_by
        where i.token_hash = ${hashToken(token)}`
    : [];
  const next = `/invite/${token}`;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="px-4 py-5 sm:px-8"><Wordmark /></header>
      <main className="flex flex-1 items-start justify-center px-4 pt-10">
        <div className="w-full max-w-md rounded-lg border border-line bg-surface p-6 shadow-sm">
          {!inv ? (
            <Notice tone="danger" title="Invitation not found">This link isn’t valid. Ask the person who invited you to send a new one.</Notice>
          ) : inv.used || inv.expired ? (
            <Notice tone="warning" title={inv.expired && !inv.used ? "Invitation expired" : "Invitation no longer valid"}>Ask {inv.inviter ?? "the household owner"} to send a new invitation.</Notice>
          ) : (
            <>
              <h1 className="text-2xl font-semibold tracking-tight">Join {inv.household}</h1>
              <p className="mt-2 text-fg-muted">{inv.inviter ?? "A household owner"} invited you to share their home on Habitat.</p>
              {!ctx || ctx.user.isAnonymous ? (
                <div className="mt-6 flex flex-col gap-2">
                  <p className="text-sm text-fg-muted">Sign in or create an account with the invited email address to accept.</p>
                  <Button asChild variant="primary"><Link href={`/sign-up?next=${encodeURIComponent(next)}`}>Create an account</Link></Button>
                  <Button asChild variant="secondary"><Link href={`/sign-in?next=${encodeURIComponent(next)}`}>I already have an account</Link></Button>
                </div>
              ) : (
                <div className="mt-6"><AcceptInviteButton token={token} /></div>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
}
