import "server-only";
import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { adminSql } from "@/lib/db";
import { env } from "@/lib/env";
import { hashPassword, verifyPassword } from "./password";
import type { AuthResult, SessionUser } from "./types";

/**
 * Local authentication adapter, used when Supabase is not configured.
 * Users live in the `auth.users` table provided by db/local-compat.sql, so the
 * rest of the system (profiles trigger, RLS via auth.uid()) is identical.
 */
const COOKIE = "habitat_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function key() {
  return new TextEncoder().encode(env.sessionSecret);
}

async function setSessionCookie(userId: string, maxAge = MAX_AGE_SECONDS) {
  const token = await new SignJWT({ role: "authenticated" })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${maxAge}s`)
    .setJti(randomUUID())
    .sign(key());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge,
  });
}

export async function getLocalSessionUser(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (!payload.sub) return null;
    const [user] = await adminSql()<{ id: string; email: string | null; is_anonymous: boolean }[]>`
      select id, email, is_anonymous from auth.users where id = ${payload.sub}
    `;
    return user ? { id: user.id, email: user.email, isAnonymous: user.is_anonymous } : null;
  } catch {
    return null;
  }
}

export async function localSignUp(email: string, password: string, displayName: string): Promise<AuthResult> {
  const sql = adminSql();
  const normalized = email.trim().toLowerCase();
  const [existing] = await sql`select 1 from auth.users where email = ${normalized}`;
  if (existing) {
    return { ok: false, error: "An account with this email already exists. Try signing in.", field: "email" };
  }
  const hash = await hashPassword(password);
  const [user] = await sql<{ id: string }[]>`
    insert into auth.users (email, encrypted_password, raw_user_meta_data, last_sign_in_at)
    values (${normalized}, ${hash}, ${sql.json({ display_name: displayName })}, now())
    returning id
  `;
  await setSessionCookie(user.id);
  return { ok: true, userId: user.id };
}

export async function localSignIn(email: string, password: string): Promise<AuthResult> {
  const sql = adminSql();
  const [user] = await sql<{ id: string; encrypted_password: string | null }[]>`
    select id, encrypted_password from auth.users where email = ${email.trim().toLowerCase()}
  `;
  const valid = await verifyPassword(password, user?.encrypted_password ?? null);
  if (!user || !valid) {
    return { ok: false, error: "That email and password don’t match an account." };
  }
  await sql`update auth.users set last_sign_in_at = now() where id = ${user.id}`;
  await setSessionCookie(user.id);
  return { ok: true, userId: user.id };
}

export async function localCreateAnonymousUser(): Promise<AuthResult> {
  const [user] = await adminSql()<{ id: string }[]>`
    insert into auth.users (is_anonymous, raw_user_meta_data)
    values (true, ${adminSql().json({ display_name: "Demo visitor", is_demo: true })})
    returning id
  `;
  await setSessionCookie(user.id, env.demoMaxAgeHours * 3600);
  return { ok: true, userId: user.id };
}

export async function localSignOut() {
  (await cookies()).delete(COOKIE);
}

export async function localDeleteUser(userId: string) {
  await adminSql()`delete from auth.users where id = ${userId}`;
  await localSignOut();
}
