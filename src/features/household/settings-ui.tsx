"use client";

import * as React from "react";
import { Download, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter } from "@/components/ui/dialog";
import { Field } from "@/components/ui/field";
import { Input, NativeSelect } from "@/components/ui/input";
import { Avatar, Notice } from "@/components/ui/misc";
import { useAction } from "@/lib/client/use-action";
import { cn } from "@/lib/utils";
import { deleteAccountAction, setAiConsentAction, setEmailRemindersAction, updateHouseholdAction, updateProfileAction } from "./actions";

const COLOURS = ["sage", "slate", "clay", "sand", "teal", "plum"] as const;

export function ProfileForm({ name, colour }: { name: string; colour: string }) {
  const [v, setV] = React.useState({ displayName: name, avatarColor: colour as (typeof COLOURS)[number] });
  const save = useAction(updateProfileAction, { success: "Profile saved" });
  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save.run(v); }}>
      <Field label="Your name" htmlFor="pf-name" error={save.fieldErrors.displayName}>
        <Input value={v.displayName} onChange={(e) => setV({ ...v, displayName: e.target.value })} autoComplete="name" />
      </Field>
      <fieldset>
        <legend className="text-sm font-medium">Avatar colour</legend>
        <div className="mt-2 flex gap-2">
          {COLOURS.map((c) => (
            <label key={c} className={cn("cursor-pointer rounded-full p-0.5 ring-2 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ring", v.avatarColor === c ? "ring-accent" : "ring-transparent")}>
              <input type="radio" name="avatar" className="sr-only" checked={v.avatarColor === c} onChange={() => setV({ ...v, avatarColor: c })} aria-label={c} />
              <Avatar name={v.displayName} colour={c} />
            </label>
          ))}
        </div>
      </fieldset>
      <div><Button type="submit" variant="primary" loading={save.pending}>Save profile</Button></div>
    </form>
  );
}

export function HouseholdForm({ name, reminderDays, isOwner }: { name: string; reminderDays: number; isOwner: boolean }) {
  const [v, setV] = React.useState({ name, warrantyReminderDays: String(reminderDays) });
  const save = useAction(updateHouseholdAction, { success: "Household settings saved" });
  return (
    <form noValidate className="flex flex-col gap-4" onSubmit={(e) => { e.preventDefault(); save.run(v); }}>
      {!isOwner && <Notice tone="neutral">Only owners can change household settings.</Notice>}
      <Field label="Household name" htmlFor="hh-name" error={save.fieldErrors.name}>
        <Input value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} disabled={!isOwner} />
      </Field>
      <Field label="Warranty reminders" htmlFor="hh-reminder" hint="How far ahead Habitat flags warranties that are about to expire.">
        <NativeSelect value={v.warrantyReminderDays} onChange={(e) => setV({ ...v, warrantyReminderDays: e.target.value })} disabled={!isOwner}>
          {[14, 30, 60, 90, 120, 180].map((d) => <option key={d} value={d}>{d} days before expiry</option>)}
          {![14, 30, 60, 90, 120, 180].includes(Number(v.warrantyReminderDays)) && <option value={v.warrantyReminderDays}>{v.warrantyReminderDays} days</option>}
        </NativeSelect>
      </Field>
      {isOwner && <div><Button type="submit" variant="primary" loading={save.pending}>Save household</Button></div>}
    </form>
  );
}

export function EmailReminders({ enabled, mode }: { enabled: boolean; mode: "resend" | "outbox" | "disabled" }) {
  const set = useAction(setEmailRemindersAction, { success: "Preference saved" });
  return (
    <div className="flex flex-col gap-3 text-sm">
      <label className="flex items-start gap-2.5">
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={enabled} disabled={set.pending} onChange={(e) => set.run({ enabled: e.target.checked })} />
        <span>Email me a daily digest of overdue tasks and warranties that are about to expire.</span>
      </label>
      {mode === "disabled" && <Notice tone="neutral">Email isn’t set up on this server yet, so reminders appear only in the notification bell.</Notice>}
      {mode === "outbox" && <Notice tone="neutral">Development mode: emails are written to the server’s outbox folder, not sent.</Notice>}
    </div>
  );
}

export function AiConsent({ consented, configured }: { consented: boolean; configured: boolean }) {
  const set = useAction(setAiConsentAction, { success: "Preference saved" });
  return (
    <div className="flex flex-col gap-3 text-sm">
      <p className="text-fg-muted">
        Optional AI features (reading receipts, answering questions about your home) send the relevant document or records to the configured AI provider. Nothing is sent unless you turn this on.
      </p>
      {!configured && <Notice tone="neutral">No AI provider is configured on this server, so AI features are unavailable. Your choice is saved for when they are.</Notice>}
      <label className="flex items-start gap-2.5">
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--accent)]" checked={consented} disabled={set.pending} onChange={(e) => set.run({ consent: e.target.checked })} />
        <span>Allow Habitat to send my documents and household records to the AI provider when I use AI features.</span>
      </label>
    </div>
  );
}

export function DataControls({ isDemo }: { isDemo: boolean }) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, start] = React.useTransition();
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium">Export your data</p>
          <p className="text-sm text-fg-muted">A JSON file with every record in this household. Documents are listed, not included.</p>
        </div>
        <Button variant="secondary" asChild><a href="/api/export" download><Download aria-hidden /> Export JSON</a></Button>
      </div>
      <div className="flex flex-col gap-2 border-t border-line pt-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-medium text-danger">{isDemo ? "End demo now" : "Delete account"}</p>
          <p className="text-sm text-fg-muted">Removes your account immediately. Households where you’re the only member are deleted with all their records and files.</p>
        </div>
        <Button variant="danger-ghost" onClick={() => { setOpen(true); setText(""); setError(null); }}><Trash2 aria-hidden /> {isDemo ? "End demo" : "Delete account"}</Button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title="Delete your account?" size="sm">
          <form noValidate onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await deleteAccountAction(text); if (r && !r.ok) setError(r.error); }); }}>
            <DialogBody className="flex flex-col gap-3">
              <p className="text-sm text-fg-muted">This can’t be undone. Type <strong className="font-mono text-fg">DELETE</strong> to confirm.</p>
              {error && <Notice tone="danger">{error}</Notice>}
              <Field label="Confirmation" htmlFor="del-confirm"><Input value={text} onChange={(e) => setText(e.target.value)} autoComplete="off" /></Field>
            </DialogBody>
            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
              <Button type="submit" variant="danger" loading={pending} disabled={text !== "DELETE"}>Delete permanently</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
