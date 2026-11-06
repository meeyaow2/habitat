import "server-only";
import { env } from "@/lib/env";

/** AI features are off unless an operator configures a provider explicitly. */
export function aiConfigured(): boolean {
  return env.aiProvider === "anthropic" && Boolean(env.anthropicApiKey);
}

export const DEFAULT_MODEL = "claude-opus-5-5";

export function aiModel(): string {
  return env.aiModel || DEFAULT_MODEL;
}

export const AI_NOT_CONFIGURED =
  "AI features aren’t set up on this server. An administrator can enable them by setting AI_PROVIDER=anthropic and ANTHROPIC_API_KEY.";
