import type postgres from "postgres";
import { hashPassword } from "../src/lib/auth/password";
import { seedDemoHousehold } from "../src/features/demo/seed";

export const DEV_EMAIL = "dev@habitat.local";
export const DEV_PASSWORD = "habitat-dev-password";

/**
 * Local development account with the sample household. Local auth mode only:
 * with Supabase Auth, sign up through the app (or use demo mode) instead.
 */
export async function seedDevelopmentAccount(sql: postgres.Sql) {
  const [existing] = await sql`select id from auth.users where email = ${DEV_EMAIL}`;
  if (existing) {
    console.log(`Development account already exists: ${DEV_EMAIL}`);
    return;
  }
  const hash = await hashPassword(DEV_PASSWORD);
  const [user] = await sql<{ id: string }[]>`
    insert into auth.users (email, encrypted_password, raw_user_meta_data)
    values (${DEV_EMAIL}, ${hash}, ${sql.json({ display_name: "Alex Tan" })})
    returning id
  `;
  await sql.begin(async (tx) => {
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ sub: user.id, role: "authenticated" })}, true), set_config('role', 'authenticated', true)`;
    await seedDemoHousehold(tx, user.id, { name: "The Tan household" });
  });
  console.log(`✓ Seeded development account\n  email:    ${DEV_EMAIL}\n  password: ${DEV_PASSWORD}`);
}
