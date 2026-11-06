import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat, betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { env } from "@/lib/env";
import { aiModel } from "./config";
import { EXTRACTION_SYSTEM_PROMPT, ExtractionSchema } from "./extraction";
import type { AiProvider, AssistantReply, ExtractionInput } from "./provider";

/**
 * Anthropic implementation. Notes:
 * - Server-side refusal fallbacks are enabled (`fallbacks: "default"`), so a
 *   safety decline on the primary model is retried on a suitable model in the
 *   same call; a final `refusal` stop reason is still handled.
 * - The tool runner is used with `thread: false` so conversations are not
 *   retained server-side between turns (message threads are not ZDR eligible).
 * - Effort is set explicitly: `low` for extraction (a reading task), `medium`
 *   for the assistant.
 */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

function client() {
  return new Anthropic({ apiKey: env.anthropicApiKey, maxRetries: 2, timeout: 120_000 });
}

const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;

export const anthropicProvider: AiProvider = {
  name: "anthropic",

  async extract({ bytes, mime }: ExtractionInput) {
    const data = Buffer.from(bytes).toString("base64");
    const source =
      mime === "application/pdf"
        ? ({ type: "document", source: { type: "base64", media_type: "application/pdf", data } } as const)
        : IMAGE_TYPES.includes(mime as (typeof IMAGE_TYPES)[number])
          ? ({ type: "image", source: { type: "base64", media_type: mime as (typeof IMAGE_TYPES)[number], data } } as const)
          : null;
    if (!source) throw new Error("unsupported_media");

    const model = aiModel();
    const response = await client().beta.messages.parse({
      model,
      max_tokens: 16000,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "low", format: betaZodOutputFormat(ExtractionSchema) },
      system: EXTRACTION_SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: [source, { type: "text", text: "Describe this document using the required fields." }],
        },
      ],
    });
    if (response.stop_reason === "refusal") throw new Error("refused");
    if (response.stop_reason === "max_tokens" || !response.parsed_output) throw new Error("unparseable");
    return { raw: response.parsed_output, model: response.model };
  },

  async converse({ system, history, tools }): Promise<AssistantReply> {
    const runnable = tools.map((t) =>
      betaZodTool({ name: t.name, description: t.description, inputSchema: t.schema, run: (input) => t.run(input) }),
    );
    const final = await client().beta.messages.toolRunner({
      model: aiModel(),
      max_tokens: 16000,
      max_iterations: 8,
      thread: false,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
      output_config: { effort: "medium" },
      system,
      tools: runnable,
      messages: history.map((m) => ({ role: m.role, content: m.content })),
    });
    if (final.stop_reason === "refusal") return { text: "", refused: true };
    const text = final.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n\n")
      .trim();
    return { text, refused: false };
  },
};
