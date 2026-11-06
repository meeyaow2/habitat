import "server-only";
import { z } from "zod";
import { withUser, type Tx } from "@/lib/db";
import { getAppContext, type HouseholdContext } from "./context";
import { toUserMessage, UserFacingError } from "./errors";

export type ActionResult<T = undefined> =
  | { ok: true; data: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

type Handler<S extends z.ZodType, T> = (args: {
  input: z.infer<S>;
  tx: Tx;
  ctx: HouseholdContext;
}) => Promise<T>;

/**
 * Wrap a server action: authenticate, require a household, validate input
 * with Zod on the server, run the handler inside an RLS-scoped transaction,
 * and map failures to safe messages.
 */
export function householdAction<S extends z.ZodType, T>(schema: S, handler: Handler<S, T>, tag = "action") {
  return async (raw: unknown): Promise<ActionResult<T>> => {
    const ctx = await getAppContext();
    if (!ctx) return { ok: false, error: "Your session has ended. Please sign in again." };
    if (!ctx.household || !ctx.role) return { ok: false, error: "Create a household first." };

    const parsed = schema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: "Please check the highlighted fields.", fieldErrors: flattenIssues(parsed.error) };
    }

    try {
      const data = await withUser(ctx.user.id, (tx) =>
        handler({ input: parsed.data, tx, ctx: ctx as HouseholdContext }),
      );
      return { ok: true, data };
    } catch (err) {
      if (err instanceof UserFacingError && err.field) {
        return { ok: false, error: err.message, fieldErrors: { [err.field]: err.message } };
      }
      return { ok: false, error: toUserMessage(err, tag) };
    }
  };
}

export function flattenIssues(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

/** Throw if the caller is not an owner (the database enforces this too). */
export function assertOwner(ctx: HouseholdContext) {
  if (ctx.role !== "owner") throw new UserFacingError("Only household owners can do that.");
}
