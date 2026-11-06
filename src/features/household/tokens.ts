import "server-only";
import { createHash } from "node:crypto";

export const INVITE_DAYS = 7;

/** Only the SHA-256 of an invitation token is stored; the token itself is shown once. */
export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
