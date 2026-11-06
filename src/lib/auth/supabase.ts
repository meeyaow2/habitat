import "server-only";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import type { AuthResult, SessionUser } from "./types";

/**
 * Supabase Auth adapter. Session cookies are managed by @supabase/ssr; the
 * proxy (src/proxy.ts) refreshes them. Database access still goes through
 * `withUser`, so RLS applies with the verified user id.
 */
export async function supabaseServerClient() {
  const store = await cookies();
  return createServerClient(env.supabaseUrl!, env.supabaseAnonKey!, {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (toSet) => {
        try {
          for (const { name, value, options } of toSet) store.set(name, value, options);
        } catch {
          // Called from a Server Component: the proxy refreshes cookies instead.
        }
      },
    },
  });
}

export async function getSupabaseSessionUser(): Promise<SessionUser | null> {
  const supabase = await supabaseServerClient();
  // getUser() validates the token with Supabase Auth; never trust getSession() alone.
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null, isAnonymous: data.user.is_anonymous ?? false };
}

export async function supabaseSignUp(email: string, password: string, displayName: string): Promise<AuthResult> {
  const supabase = await supabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { data: { display_name: displayName }, emailRedirectTo: `${env.appUrl}/overview` },
  });
  if (error || !data.user) return { ok: false, error: error?.message ?? "Sign up failed. Please try again." };
  if (!data.session) {
    return { ok: false, error: "Check your inbox to confirm your email address, then sign in." };
  }
  return { ok: true, userId: data.user.id };
}

export async function supabaseSignIn(email: string, password: string): Promise<AuthResult> {
  const supabase = await supabaseServerClient();
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error || !data.user) return { ok: false, error: "That email and password don’t match an account." };
  return { ok: true, userId: data.user.id };
}

export async function supabaseCreateAnonymousUser(): Promise<AuthResult> {
  const supabase = await supabaseServerClient();
  const { data, error } = await supabase.auth.signInAnonymously({
    options: { data: { display_name: "Demo visitor", is_demo: true } },
  });
  if (error || !data.user) {
    return { ok: false, error: "Demo mode needs anonymous sign-ins enabled in Supabase Auth settings." };
  }
  return { ok: true, userId: data.user.id };
}

export async function supabaseSignOut() {
  const supabase = await supabaseServerClient();
  await supabase.auth.signOut();
}

export async function supabaseDeleteUser(userId: string) {
  if (!env.supabaseServiceRoleKey) throw new Error("SUPABASE_SERVICE_ROLE_KEY is required to delete accounts.");
  const admin = createClient(env.supabaseUrl!, env.supabaseServiceRoleKey, { auth: { persistSession: false } });
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) throw error;
  await supabaseSignOut();
}
