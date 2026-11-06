import { expect, type Page } from "@playwright/test";

export const uid = () => Math.random().toString(36).slice(2, 8);

/** Today's date in Singapore as YYYY-MM-DD (matches the app's household timezone). */
export function todaySG(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86_400_000);
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Singapore", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

export async function signUp(page: Page, name: string, email: string, next?: string) {
  await page.goto(next ? `/sign-up?next=${encodeURIComponent(next)}` : "/sign-up");
  await page.getByLabel("Your name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-battery");
  await page.getByRole("button", { name: "Create account" }).click();
}

/** Full onboarding: HDB 4-room template, skips the first appliance. */
export async function signUpWithHome(page: Page, name: string, email: string) {
  await signUp(page, name, email);
  await page.waitForURL("**/onboarding");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByLabel("Home name").fill(`${name}’s flat`);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByRole("heading", { name: "Choose a starting layout" })).toBeVisible();
  await page.getByRole("button", { name: "Use this layout" }).click();
  await expect(page.getByRole("heading", { name: "Add your first appliance" })).toBeVisible();
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "Open my home" }).click();
  await page.waitForURL("**/home?welcome=1");
}

export async function noHorizontalOverflow(page: Page) {
  const { scroll, client } = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth }));
  expect(scroll, "page should not scroll horizontally").toBeLessThanOrEqual(client + 1);
}
