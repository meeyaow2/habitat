"use client";

import Link from "next/link";
import * as React from "react";
import { ArrowUp, CalendarPlus, Check, RotateCcw, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Notice } from "@/components/ui/misc";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { describeInterval, formatDate } from "@/lib/domain/dates";
import { useAction } from "@/lib/client/use-action";
import { cn } from "@/lib/utils";
import { setAiConsentAction } from "@/features/household/actions";
import { createTaskAction } from "@/features/maintenance/actions";
import { askHabitatAction } from "./assistant-actions";
import type { AssistantAnswer } from "./assistant";
import type { TaskProposal } from "./assistant-tools";

type Turn = { role: "user"; content: string } | { role: "assistant"; content: string; answer: AssistantAnswer | null; error?: string };

const SUGGESTIONS = [
  "Which appliances need servicing?",
  "What maintenance tasks are overdue?",
  "Which warranties expire in the next two months?",
  "How much did we spend on aircon servicing last year?",
  "Where is my refrigerator receipt?",
  "How many appliances are out of warranty?",
];

/** Minimal, safe rendering: paragraphs and "- " lists; no HTML from the model. */
function AnswerText({ text }: { text: string }) {
  const blocks = text.replace(/\*\*(.+?)\*\*/g, "$1").split(/\n{2,}/);
  return (
    <div className="flex flex-col gap-2">
      {blocks.map((b, i) => {
        const lines = b.split("\n").filter(Boolean);
        if (lines.length && lines.every((l) => /^\s*([-•*]|\d+\.)\s+/.test(l))) {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {lines.map((l, j) => <li key={j}>{l.replace(/^\s*([-•*]|\d+\.)\s+/, "")}</li>)}
            </ul>
          );
        }
        return <p key={i} className="whitespace-pre-line">{b}</p>;
      })}
    </div>
  );
}

function ProposalCard({ p }: { p: TaskProposal }) {
  const [done, setDone] = React.useState(false);
  const create = useAction(createTaskAction, { success: "Task scheduled" });
  return (
    <div className="rounded-md border border-line bg-surface p-3">
      <p className="text-xs font-medium text-fg-subtle">Suggested task — not created yet</p>
      <p className="mt-0.5 text-sm font-medium">{p.title}</p>
      <p className="text-xs text-fg-muted">
        {p.assetName ? `${p.assetName} · ` : ""}due {formatDate(p.dueOn)}
        {p.recurrenceInterval && p.recurrenceUnit ? ` · ${describeInterval(p.recurrenceInterval, p.recurrenceUnit).toLowerCase()}` : ""}
      </p>
      <div className="mt-2">
        {done ? (
          <span className="inline-flex items-center gap-1 text-sm font-medium text-success"><Check className="size-4" aria-hidden /> Scheduled</span>
        ) : (
          <Button
            size="sm"
            variant="soft"
            loading={create.pending}
            onClick={async () => {
              const ok = await create.run({ title: p.title, description: null, assetId: p.assetId, assignedTo: null, dueOn: p.dueOn, priority: "normal", recurrenceInterval: p.recurrenceInterval, recurrenceUnit: p.recurrenceUnit, source: "user" });
              if (ok) setDone(true);
            }}
          >
            <CalendarPlus aria-hidden /> Create this task
          </Button>
        )}
      </div>
    </div>
  );
}

export function AskHabitat({ open, onOpenChange, configured, consented }: { open: boolean; onOpenChange: (o: boolean) => void; configured: boolean; consented: boolean }) {
  const [turns, setTurns] = React.useState<Turn[]>([]);
  const [draft, setDraft] = React.useState("");
  const [pending, startTransition] = React.useTransition();
  const consent = useAction(setAiConsentAction, { silent: true });
  const endRef = React.useRef<HTMLDivElement>(null);
  const inputRef = React.useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [turns, pending]);

  const ask = (question: string) => {
    const q = question.trim();
    if (!q || pending) return;
    // Send only answered exchanges (failed answers are dropped with their question) so roles alternate.
    const history: { role: "user" | "assistant"; content: string }[] = [];
    turns.forEach((t, i) => {
      const next = turns[i + 1];
      if (t.role === "user" && next?.role === "assistant" && !next.error) {
        history.push({ role: "user", content: t.content }, { role: "assistant", content: next.content });
      }
    });
    history.push({ role: "user", content: q });
    setTurns((t) => [...t, { role: "user", content: q }]);
    setDraft("");
    startTransition(async () => {
      let res: Awaited<ReturnType<typeof askHabitatAction>>;
      try {
        res = await askHabitatAction(history.slice(-19));
      } catch {
        res = { ok: false, error: "We couldn’t reach Habitat. Check your connection and try again." };
      }
      setTurns((t) => [
        ...t,
        res.ok
          ? { role: "assistant", content: res.data.refused ? "I can’t help with that request." : res.data.text || "I couldn’t find an answer in your records.", answer: res.data }
          : { role: "assistant", content: res.error, answer: null, error: res.error },
      ]);
      inputRef.current?.focus();
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={<span className="inline-flex items-center gap-2"><Sparkles className="size-4 text-accent" aria-hidden /> Ask Habitat</span>}
        description="Answers come from your household’s own records."
        className="md:w-[460px]"
        headerExtra={turns.length > 0 ? <Button variant="ghost" size="icon-sm" aria-label="Start a new conversation" onClick={() => setTurns([])}><RotateCcw aria-hidden /></Button> : undefined}
      >
        {!configured ? (
          <div className="p-5">
            <Notice tone="neutral" title="Not set up on this server">
              Ask Habitat needs an AI provider. An administrator can enable it by setting <code>AI_PROVIDER=anthropic</code> and <code>ANTHROPIC_API_KEY</code>.
            </Notice>
          </div>
        ) : !consented ? (
          <div className="flex flex-col gap-4 p-5 text-sm">
            <p className="flex items-start gap-2"><ShieldCheck className="mt-0.5 size-4 shrink-0 text-accent" aria-hidden /> To answer, Ask Habitat sends the household records it needs — item names, dates, tasks and expenses — to the AI provider. Document contents are never sent. Conversations aren’t stored by Habitat.</p>
            <div className="flex gap-2">
              <Button variant="primary" loading={consent.pending} onClick={() => consent.run({ consent: true })}>Allow and continue</Button>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>Not now</Button>
            </div>
            {consent.error && <Notice tone="danger">{consent.error}</Notice>}
            <p className="text-xs text-fg-subtle">You can turn this off any time in Settings.</p>
          </div>
        ) : (
          <div className="flex h-full min-h-[60dvh] flex-col md:min-h-full">
            <div className="flex-1 space-y-4 px-5 py-4" aria-live="polite">
              {turns.length === 0 && (
                <div>
                  <p className="text-sm text-fg-muted">Try asking:</p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {SUGGESTIONS.map((s) => (
                      <li key={s}>
                        <button type="button" onClick={() => ask(s)} className="w-full rounded-md border border-line bg-surface px-3 py-2 text-left text-sm hover:border-line-strong hover:bg-surface-muted">{s}</button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {turns.map((t, i) =>
                t.role === "user" ? (
                  <div key={i} className="ml-8 rounded-lg bg-accent-soft px-3 py-2 text-sm text-accent-soft-fg"><span className="sr-only">You asked: </span>{t.content}</div>
                ) : (
                  <div key={i} className="mr-4 flex flex-col gap-2 text-sm">
                    <span className="sr-only">Ask Habitat answered: </span>
                    {t.error ? <Notice tone="warning">{t.content}</Notice> : <AnswerText text={t.content} />}
                    {t.answer && t.answer.references.length > 0 && (
                      <div className="flex flex-wrap gap-1.5" aria-label="Records used">
                        {t.answer.references.map((r) => (
                          <Link key={r.href} href={r.href} onClick={() => onOpenChange(false)} className="rounded-sm border border-line bg-surface px-2 py-1 text-xs text-fg-muted hover:border-line-strong hover:text-fg">{r.label}</Link>
                        ))}
                      </div>
                    )}
                    {t.answer?.proposals.map((p, j) => <ProposalCard key={j} p={p} />)}
                  </div>
                ),
              )}
              {pending && (
                <p className="flex items-center gap-2 text-sm text-fg-muted" role="status">
                  <span className="size-1.5 animate-pulse rounded-full bg-accent" aria-hidden /> Looking through your records…
                </p>
              )}
              <div ref={endRef} />
            </div>
            <form
              className="sticky bottom-0 border-t border-line bg-surface p-3"
              onSubmit={(e) => {
                e.preventDefault();
                ask(draft);
              }}
            >
              <div className={cn("flex items-end gap-2 rounded-md border border-line-input bg-surface px-2 py-1.5 focus-within:border-accent focus-within:ring-3 focus-within:ring-accent/20")}>
                <label htmlFor="ask-input" className="sr-only">Ask a question about your home</label>
                <textarea
                  id="ask-input"
                  ref={inputRef}
                  rows={1}
                  value={draft}
                  maxLength={2000}
                  onChange={(e) => setDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) {
                      e.preventDefault();
                      ask(draft);
                    }
                  }}
                  placeholder="e.g. When was the aircon last serviced?"
                  className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-1 py-1.5 text-base outline-none placeholder:text-fg-subtle"
                />
                <Button type="submit" variant="primary" size="icon-sm" aria-label="Send question" disabled={!draft.trim() || pending}><ArrowUp aria-hidden /></Button>
              </div>
              <p className="mt-1.5 text-[11px] text-fg-subtle">AI can make mistakes — check the linked records. For electrical, gas or structural problems, use a qualified technician.</p>
            </form>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
