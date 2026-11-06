import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { authMode } from "@/lib/env";
import * as local from "./local";
import * as supa from "./supabase";
import type { AuthResult, SessionUser } from "./types";

export type { SessionUser, AuthResult };

/** The verified user for this request, or null. Memoised per request. */
export const getSessionUser = cache(async (): Promise<SessionUser | null> => {
  return authMode() === "supabase" ? supa.getSupabaseSessionUser() : local.getLocalSessionUser();
});

export async function requireSessionUser(): Promise<SessionUser> {
  const user = await getSessionUser();
  if (!user) redirect("/sign-in");
  return user;
}

export const auth = {
  signUp: (email: string, password: string, name: string) =>
    authMode() === "supabase" ? supa.supabaseSignUp(email, password, name) : local.localSignUp(email, password, name),
  signIn: (email: string, password: string) =>
    authMode() === "supabase" ? supa.supabaseSignIn(email, password) : local.localSignIn(email, password),
  createAnonymous: () =>
    authMode() === "supabase" ? supa.supabaseCreateAnonymousUser() : local.localCreateAnonymousUser(),
  signOut: () => (authMode() === "supabase" ? supa.supabaseSignOut() : local.localSignOut()),
  deleteUser: (id: string) => (authMode() === "supabase" ? supa.supabaseDeleteUser(id) : local.localDeleteUser(id)),
};
