import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Browser, type BrowserContext } from "@playwright/test";
import { noHorizontalOverflow } from "./helpers";

// @axe-core/playwright ships types from a newer Playwright than the pinned runtime; the API used is identical.
type AxePage = ConstructorParameters<typeof AxeBuilder>[0]["page"];

const PAGES = ["/overview", "/home", "/assets", "/maintenance", "/documents", "/expenses", "/household", "/settings"];
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 768, height: 1024 },
  { width: 1024, height: 768 },
  { width: 1440, height: 900 },
  { width: 1920, height: 1080 },
];

let ctx: BrowserContext;

async function demoContext(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/");
  await page.getByRole("button", { name: "Explore a sample home" }).click();
  await page.waitForURL("**/home");
  await page.close();
  return context;
}

test.describe.serial("demo mode, responsive layout and accessibility", () => {
  test.beforeAll(async ({ browser }) => {
    ctx = await demoContext(browser);
  });
  test.afterAll(() => ctx.close());

  test("demo mode opens a clearly labelled sample home", async () => {
    const page = await ctx.newPage();
    await page.goto("/home");
    await expect(page.getByText("Demo household")).toBeVisible();
    await expect(page.getByRole("complementary", { name: "Rooms and items" }).getByRole("button", { name: /^Washing machine/ }).first()).toBeVisible();
    await page.goto("/overview");
    await expect(page.getByText("Household status")).toBeVisible();
    await page.goto("/household");
    await expect(page.getByText("Invitations are turned off in demo mode.")).toBeVisible();
    await page.close();
  });

  for (const vp of VIEWPORTS) {
    test(`no horizontal overflow at ${vp.width}px`, async () => {
      const page = await ctx.newPage();
      await page.setViewportSize(vp);
      for (const p of PAGES) {
        await page.goto(p);
        await page.waitForLoadState("networkidle");
        await test.step(p, () => noHorizontalOverflow(page));
      }
      await page.close();
    });
  }

  test("primary pages have no serious or critical axe violations", async () => {
    const page = await ctx.newPage();
    for (const p of [...PAGES, "/home?edit=1"]) {
      await page.goto(p);
      await page.waitForLoadState("networkidle");
      const results = await new AxeBuilder({ page: page as unknown as AxePage }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
      const serious = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
      expect(serious.map((v) => `${p}: ${v.id} — ${v.nodes.length} node(s): ${v.nodes[0]?.target.join(" ")}`)).toEqual([]);
    }
    await page.close();
  });

  test("public pages are accessible too", async ({ page }) => {
    for (const p of ["/", "/sign-in", "/sign-up"]) {
      await page.goto(p);
      const results = await new AxeBuilder({ page: page as unknown as AxePage }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      expect(results.violations.filter((v) => v.impact === "serious" || v.impact === "critical").map((v) => `${p}: ${v.id}`)).toEqual([]);
    }
  });
});

test("signed-out visitors are sent to sign in", async ({ page }) => {
  await page.goto("/assets");
  await expect(page).toHaveURL(/\/sign-in/);
  const api = await page.request.get("/api/export");
  expect(api.status()).toBe(401);
});
