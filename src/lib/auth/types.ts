export type SessionUser = {
  id: string;
  email: string | null;
  isAnonymous: boolean;
};

export type AuthResult = { ok: true; userId: string } | { ok: false; error: string; field?: "email" | "password" };
