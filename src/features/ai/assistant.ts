import "server-only";
import type { AiProvider, ChatTurn } from "@/lib/ai/provider";
import { assistantSystemPrompt, buildAssistantTools, newCollector, type Reference, type TaskProposal, type ToolContext } from "./assistant-tools";

export type AssistantAnswer = { text: string; references: Reference[]; proposals: TaskProposal[]; refused: boolean };

/**
 * Pick the links to show under an answer. Only records that a tool actually
 * returned are eligible (so links can never point at invented records), and
 * only those the answer names, in the order they are mentioned.
 */
export function selectReferences(text: string, refs: Reference[], max = 8): Reference[] {
  const lower = text.toLowerCase();
  const named = refs
    .filter((r) => r.kind !== "expenses" && r.kind !== "history" && r.label.trim().length >= 3)
    .map((r) => ({ r, at: lower.indexOf(r.label.toLowerCase()) }))
    .filter((x) => x.at >= 0)
    .sort((a, b) => a.at - b.at)
    .map((x) => x.r);
  const generic = refs.filter((r) => r.kind === "expenses" || r.kind === "history");
  const seen = new Set<string>();
  return [...named, ...generic].filter((r) => (seen.has(r.href) ? false : (seen.add(r.href), true))).slice(0, max);
}

export async function answerQuestion(args: {
  provider: AiProvider;
  history: ChatTurn[];
  ctx: ToolContext & { householdName: string };
}): Promise<AssistantAnswer> {
  const collector = newCollector();
  const tools = buildAssistantTools(args.ctx, collector);
  const reply = await args.provider.converse({ system: assistantSystemPrompt(args.ctx), history: args.history, tools });
  if (reply.refused) return { text: "", references: [], proposals: [], refused: true };
  return {
    text: reply.text,
    references: selectReferences(reply.text, [...collector.references.values()]),
    proposals: collector.proposals,
    refused: false,
  };
}
