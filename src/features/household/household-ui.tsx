"use client";

import * as React from "react";
import { toast } from "sonner";
import { Check, Copy, LogOut, Mail, MoreHorizontal, UserMinus, UserPlus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { Avatar, Notice } from "@/components/ui/misc";
import { Menu, MenuContent, MenuItem, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { useAction } from "@/lib/client/use-action";
import { changeRoleAction, inviteMemberAction, leaveHouseholdAction, removeMemberAction, revokeInvitationAction } from "./actions";
import { useOnOpen } from "@/lib/client/use-on-change";

export function InviteButton({ disabled }: { disabled?: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"member" | "owner">("member");
  const [link, setLink] = React.useState<string | null>(null);
  const [emailed, setEmailed] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const invite = useAction(inviteMemberAction, { silent: true });
  useOnOpen(open, () => { setEmail(""); setRole("member"); setLink(null); setCopied(false); });
  return (
    <>
      <Button variant="primary" onClick={() => setOpen(true)} disabled={disabled}><UserPlus aria-hidden /> Invite someone</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Invite to your household" description="They’ll need to sign in with this email address to accept." size="sm">
          {link ? (
            <>
              <DialogBody className="flex flex-col gap-3">
                <Notice tone="success" icon={<Check />}>Invitation created for {email}. It expires in 7 days.</Notice>
                <p className="text-sm text-fg-muted">
                  {emailed ? "We’ve emailed them the invitation. You can also share this private link directly — it’s shown only once." : "Email delivery isn’t set up on this server, so share this private link with them directly. It’s shown only once."}
                </p>
                <div className="flex gap-2">
                  <Input readOnly value={link} aria-label="Invitation link" onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
                  <Button
                    variant="secondary"
                    onClick={async () => {
                      try { await navigator.clipboard.writeText(link); setCopied(true); } catch { toast.error("Copy failed — select the link and copy it manually."); }
                    }}
                  >
                    {copied ? <Check aria-hidden /> : <Copy aria-hidden />} {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </DialogBody>
              <DialogFooter><Button variant="primary" onClick={() => setOpen(false)}>Done</Button></DialogFooter>
            </>
          ) : (
            <form
              noValidate
              onSubmit={async (e) => {
                e.preventDefault();
                const res = await invite.run({ email, role });
                if (res) {
                  setLink(res.data.url);
                  setEmailed(res.data.emailed);
                }
              }}
            >
              <DialogBody className="flex flex-col gap-4">
                {invite.error && !invite.fieldErrors.email && <Notice tone="danger">{invite.error}</Notice>}
                <Field label="Email" htmlFor="inv-email" error={invite.fieldErrors.email}>
                  <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="off" />
                </Field>
                <Field label="Role" htmlFor="inv-role" hint={role === "owner" ? "Owners can manage the property, members and invitations." : "Members can add items, record maintenance and update their tasks."}>
                  <NativeSelect value={role} onChange={(e) => setRole(e.target.value as "member")}>
                    <option value="member">Member</option>
                    <option value="owner">Owner</option>
                  </NativeSelect>
                </Field>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" variant="primary" loading={invite.pending}><Mail aria-hidden /> Create invitation</Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

export function MemberRow({ m, isOwner, isSelf, ownerCount }: { m: { user_id: string; display_name: string; avatar_color: string; role: string; joined: string }; isOwner: boolean; isSelf: boolean; ownerCount: number }) {
  const role = useAction(changeRoleAction, { success: "Role updated" });
  const remove = useAction(removeMemberAction, { success: "Member removed" });
  const [confirm, setConfirm] = React.useState<null | "remove" | "leave">(null);
  const [leaveError, setLeaveError] = React.useState<string | null>(null);
  return (
    <li className="flex items-center gap-3 px-4 py-3 sm:px-5">
      <Avatar name={m.display_name} colour={m.avatar_color} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{m.display_name || "Member"}{isSelf && <span className="font-normal text-fg-muted"> (you)</span>}</p>
        <p className="text-xs text-fg-muted">Joined {m.joined}</p>
      </div>
      <Badge tone={m.role === "owner" ? "accent" : "neutral"} className="capitalize">{m.role}</Badge>
      {(isOwner || isSelf) && (
        <Menu>
          <MenuTrigger className="grid size-8 place-items-center rounded-md text-fg-subtle hover:bg-surface-muted hover:text-fg" aria-label={`Manage ${m.display_name}`}>
            <MoreHorizontal className="size-4" />
          </MenuTrigger>
          <MenuContent>
            {isOwner && m.role === "member" && <MenuItem onSelect={() => role.run({ userId: m.user_id, role: "owner" })}>Make owner</MenuItem>}
            {isOwner && m.role === "owner" && (!isSelf || ownerCount > 1) && <MenuItem onSelect={() => role.run({ userId: m.user_id, role: "member" })}>Change to member</MenuItem>}
            {isOwner && !isSelf && (<><MenuSeparator /><MenuItem tone="danger" onSelect={() => setConfirm("remove")}><UserMinus /> Remove from household</MenuItem></>)}
            {isSelf && <MenuItem tone="danger" onSelect={() => setConfirm("leave")}><LogOut /> Leave household</MenuItem>}
          </MenuContent>
        </Menu>
      )}
      <ConfirmDialog open={confirm === "remove"} onOpenChange={(o) => setConfirm(o ? "remove" : null)} title={`Remove ${m.display_name}?`} description="They lose access immediately. Records they created stay with the household." confirmLabel="Remove member" onConfirm={async () => { await remove.run({ userId: m.user_id }); }} />
      <ConfirmDialog
        open={confirm === "leave"}
        onOpenChange={(o) => { setConfirm(o ? "leave" : null); setLeaveError(null); }}
        title="Leave this household?"
        description={<>You’ll lose access to its home, records and documents.{leaveError && <span className="mt-2 block font-medium text-danger">{leaveError}</span>}</>}
        confirmLabel="Leave household"
        onConfirm={async () => {
          const res = await leaveHouseholdAction();
          if (res && !res.ok) { setLeaveError(res.error); throw new Error(res.error); }
        }}
      />
    </li>
  );
}

export function RevokeInviteButton({ id, email }: { id: string; email: string }) {
  const revoke = useAction(revokeInvitationAction, { success: "Invitation revoked" });
  return <Button size="sm" variant="ghost" loading={revoke.pending} onClick={() => revoke.run({ id })} aria-label={`Revoke invitation for ${email}`}>Revoke</Button>;
}
