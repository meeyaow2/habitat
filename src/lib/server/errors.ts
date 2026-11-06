import "server-only";

/** Error safe to show to the user. */
export class UserFacingError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
  }
}

type PgError = { code?: string; hint?: string; message?: string; constraint_name?: string };

const HINT_MESSAGES: Record<string, string> = {
  last_owner: "A household needs at least one owner. Make someone else an owner first.",
  invitation_not_found: "This invitation link isn’t valid.",
  invitation_revoked: "This invitation was revoked by the household owner.",
  invitation_used: "This invitation has already been used.",
  invitation_expired: "This invitation has expired. Ask the owner to send a new one.",
  invitation_email_mismatch: "This invitation was sent to a different email address. Sign in with that address to accept it.",
};

/**
 * Convert any thrown error into a message that never leaks SQL, stack traces
 * or record contents. Unexpected errors are logged server-side with only the
 * error code and a short tag.
 */
export function toUserMessage(err: unknown, tag = "action"): string {
  if (err instanceof UserFacingError) return err.message;
  const pg = err as PgError;
  if (pg?.hint && HINT_MESSAGES[pg.hint]) return HINT_MESSAGES[pg.hint];
  switch (pg?.code) {
    case "42501":
      return "You don’t have permission to do that in this household.";
    case "23503":
      return "A linked record no longer exists. Refresh the page and try again.";
    case "23505":
      return "That already exists.";
    case "23514":
    case "22P02":
    case "22007":
    case "22008":
      return "One of the values isn’t valid. Check the form and try again.";
    case "40001":
    case "40P01":
      return "Someone else changed this at the same moment. Please try again.";
  }
  if (pg?.message?.includes("row-level security")) {
    return "You don’t have permission to do that in this household.";
  }
  console.error(`[habitat:${tag}] unexpected error`, pg?.code ?? (err as Error)?.name ?? "unknown");
  return "Something went wrong on our side. Your changes weren’t saved — please try again.";
}
