import "server-only";
import type { RawExtraction } from "./extraction";

/**
 * Provider seam. The app depends on this interface; the Anthropic
 * implementation lives in ./anthropic.ts. Tests inject a stub provider — the
 * product itself never substitutes fake results for a missing provider.
 */
export type ExtractionInput = { bytes: Uint8Array; mime: string; filename: string | null };

export type AssistantTool = {
  name: string;
  description: string;
  /** Zod schema for the tool input. */
  schema: import("zod").ZodType;
  run: (input: unknown) => Promise<string>;
};

export type ChatTurn = { role: "user" | "assistant"; content: string };

export type AssistantReply = { text: string; refused: boolean };

export interface AiProvider {
  readonly name: string;
  extract(input: ExtractionInput): Promise<{ raw: RawExtraction; model: string }>;
  converse(args: { system: string; history: ChatTurn[]; tools: AssistantTool[] }): Promise<AssistantReply>;
}
