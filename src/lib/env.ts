import "server-only";

/**
 * Server-side configuration. Read once, validated lazily so that `next build`
 * does not require secrets. Nothing in this module is exposed to the client.
 */
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable ${name}. See .env.example.`);
  }
  return value;
}

export const env = {
  get databaseUrl() {
    return required("DATABASE_URL");
  },
  get sessionSecret() {
    const value = required("SESSION_SECRET");
    if (value.length < 32 && process.env.NODE_ENV === "production") {
      throw new Error("SESSION_SECRET must be at least 32 characters in production.");
    }
    return value;
  },
  get appUrl() {
    return process.env.APP_URL ?? "http://localhost:3000";
  },
  supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL || undefined,
  supabaseAnonKey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || undefined,
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || undefined,
  localStorageDir: process.env.LOCAL_STORAGE_DIR || ".data/uploads",
  aiProvider: (process.env.AI_PROVIDER || "").toLowerCase(),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY || undefined,
  aiModel: process.env.AI_MODEL || undefined,
  demoMaxAgeHours: Number(process.env.DEMO_MAX_AGE_HOURS ?? 24),
};

export type AuthMode = "supabase" | "local";

export function authMode(): AuthMode {
  return env.supabaseUrl && env.supabaseAnonKey ? "supabase" : "local";
}

export function storageMode(): "supabase" | "local" {
  return env.supabaseUrl && env.supabaseServiceRoleKey ? "supabase" : "local";
}
