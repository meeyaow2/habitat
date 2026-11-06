"use server";

import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { flattenIssues } from "@/lib/server/action";
import { toUserMessage } from "@/lib/server/errors";
import { clientKey, rateLimit } from "@/lib/server/rate-limit";
import { signInSchema, signUpSchema } from "@/lib/validation/schemas";
import { seedDemoHousehold } from "@/features/demo/seed";
import { withUser } from "@/lib/db";

export type AuthFormState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  values?: { email?: string; displayName?: string };
};

function safeNext(next: FormDataEntryValue | null): string {
  const value = typeof next === "string" ? next : "";
  // Only allow internal relative paths (no protocol-relative //evil.com).
  return value.startsWith("/") && !value.startsWith("//") ? value : "/overview";
}

export async function signUpAction(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const raw = { displayName: form.get("displayName"), email: form.get("email"), password: form.get("password") };
  const values = { email: String(raw.email ?? ""), displayName: String(raw.displayName ?? "") };
  const parsed = signUpSchema.safeParse(raw);
  if (!parsed.success) return { error: "Please check the highlighted fields.", fieldErrors: flattenIssues(parsed.error), values };
  try {
    rateLimit(`signup:${await clientKey()}`, 8, 15 * 60_000);
    const result = await auth.signUp(parsed.data.email, parsed.data.password, parsed.data.displayName);
    if (!result.ok) return { error: result.error, fieldErrors: result.field ? { [result.field]: result.error } : undefined, values };
  } catch (err) {
    return { error: toUserMessage(err, "sign-up"), values };
  }
  redirect(safeNext(form.get("next")) === "/overview" ? "/onboarding" : safeNext(form.get("next")));
}

export async function signInAction(_: AuthFormState, form: FormData): Promise<AuthFormState> {
  const raw = { email: form.get("email"), password: form.get("password") };
  const values = { email: String(raw.email ?? "") };
  const parsed = signInSchema.safeParse(raw);
  if (!parsed.success) return { error: "Please check the highlighted fields.", fieldErrors: flattenIssues(parsed.error), values };
  try {
    rateLimit(`signin:${await clientKey()}`, 10, 10 * 60_000);
    rateLimit(`signin-email:${parsed.data.email}`, 6, 10 * 60_000);
    const result = await auth.signIn(parsed.data.email, parsed.data.password);
    if (!result.ok) return { error: result.error, values };
  } catch (err) {
    return { error: toUserMessage(err, "sign-in"), values };
  }
  redirect(safeNext(form.get("next")));
}

export async function signOutAction() {
  await auth.signOut();
  redirect("/");
}

/**
 * Demo mode: creates an isolated, anonymous, short-lived account with sample
 * data. Demo households are flagged `is_demo`, are visible only to that
 * visitor (normal RLS), and are deleted by `npm run db:cleanup-demo`.
 */
export async function startDemoAction(): Promise<void> {
  let ok = false;
  try {
    rateLimit(`demo:${await clientKey()}`, 5, 60 * 60_000);
    const result = await auth.createAnonymous();
    if (!result.ok) throw new Error(result.error);
    await withUser(result.userId, (tx) => seedDemoHousehold(tx, result.userId));
    ok = true;
  } catch (err) {
    console.error("[habitat:demo] failed to start demo", (err as Error)?.message?.slice(0, 120));
  }
  redirect(ok ? "/home" : "/?demo=unavailable");
}
