import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { noHorizontalOverflow } from "./helpers";

// @axe-core/playwright ships types from a newer Playwright than the pinned runtime; the API used is identical.
type AxePage = ConstructorParameters<typeof AxeBuilder>[0]["page"];

const PUBLIC_PAGES = ["/", "/onboarding", "/home?guest=sample"];
const VIEWPORTS = [{ width: 390, height: 844 }, { width: 768, height: 1024 }, { width: 1440, height: 900 }];
const STARTER_PLANS = [
  ["HDB 2-room Flexi", "hdb_2_room"], ["HDB 3-room", "hdb_3_room"], ["HDB 4-room", "hdb_4_room"],
  ["HDB 5-room", "hdb_5_room"], ["Condo · 2 bedrooms", "condo_2br"], ["Condo · 3 bedrooms", "condo_3br"],
] as const;

type StoredPiece = { id: string; furnitureType: string; x: number; y: number; width: number; height: number };

async function samplePiece(page: Page, furnitureType: string, index = 0): Promise<StoredPiece> {
  return page.evaluate(({ furnitureType, index }) => {
    const sample = JSON.parse(localStorage.getItem("habitat.guest.sample.v1")!);
    return sample.doc.objects.filter((object: StoredPiece) => object.furnitureType === furnitureType)[index];
  }, { furnitureType, index });
}

async function dragFurniture(page: Page, piece: StoredPiece, target: { x: number; y: number }) {
  const points = await page.evaluate(({ piece, target }) => {
    const view = (window as unknown as { __habitatView: { x: number; y: number; scale: number } }).__habitatView;
    const rect = document.querySelector<HTMLElement>('[role="application"] canvas')!.getBoundingClientRect();
    const screen = (point: { x: number; y: number }) => ({ x: rect.left + view.x + point.x * view.scale, y: rect.top + view.y + point.y * view.scale });
    return { start: screen({ x: piece.x + piece.width / 2, y: piece.y + piece.height / 2 }), end: screen(target) };
  }, { piece, target });
  await page.mouse.move(points.start.x, points.start.y);
  await page.mouse.down();
  await page.mouse.move(points.end.x, points.end.y, { steps: 12 });
  await page.mouse.up();
}

test("guest setup and sample work without an account and stay separate", async ({ browser }) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Where should the sofa go?" })).toBeVisible();
  await page.getByRole("button", { name: "Open HDB 4-room" }).click();
  await expect(page).toHaveURL(/\/home\?guest=own&edit=1/);
  await expect.poll(() => page.evaluate(() => !!localStorage.getItem("habitat.guest.home.v1"))).toBe(true);
  await expect(page.getByRole("textbox", { name: "Home name" })).toHaveValue("My home");
  await page.getByRole("textbox", { name: "Home name" }).fill("Our flat");
  await page.getByRole("textbox", { name: "Home name" }).blur();
  await page.waitForTimeout(180);
  await page.reload();
  await expect(page.getByRole("textbox", { name: "Home name" })).toHaveValue("Our flat");
  const own = await page.evaluate(() => localStorage.getItem("habitat.guest.home.v1"));

  await page.goto("/");
  await page.getByRole("link", { name: "Try a furnished sample" }).click();
  await expect(page).toHaveURL(/\/home\?guest=sample/);
  await expect(page.getByText("4-room HDB sample", { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => !!localStorage.getItem("habitat.guest.sample.v1"))).toBe(true);
  await expect(page.getByText("Saved in this browser.").last()).toBeVisible();

  const bedBefore = await samplePiece(page, "bed_double");
  await dragFurniture(page, bedBefore, { x: 150, y: 310 });
  await expect.poll(async () => (await samplePiece(page, "bed_double")).y).not.toBe(bedBefore.y);
  const bedAfter = await samplePiece(page, "bed_double");

  const wardrobeBefore = await samplePiece(page, "wardrobe");
  await dragFurniture(page, wardrobeBefore, { x: 110, y: 30 });
  await expect.poll(async () => (await samplePiece(page, "wardrobe")).y).not.toBe(wardrobeBefore.y);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect.poll(async () => (await samplePiece(page, "wardrobe")).y).toBe(wardrobeBefore.y);
  await page.reload();
  await expect.poll(async () => (await samplePiece(page, "bed_double")).y).toBe(bedAfter.y);

  await page.getByRole("button", { name: "Reset sample" }).click();
  await page.getByRole("button", { name: "Reset sample" }).last().click();
  await expect.poll(() => page.evaluate(() => localStorage.getItem("habitat.guest.home.v1"))).toBe(own);
  await context.close();
});

test("all six starting-plan thumbnails open the same editable document", async ({ page }) => {
  for (const [label, key] of STARTER_PLANS) {
    await page.goto("/");
    const card = page.getByRole("button", { name: `Open ${label}` });
    const preview = await card.locator("svg[data-room-count]").evaluate((svg) => ({
      rooms: Number(svg.dataset.roomCount), objects: Number(svg.dataset.objectCount), openings: Number(svg.dataset.openingCount),
    }));
    await card.click();
    await expect(page).toHaveURL(/\/home\?guest=own&edit=1/);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("habitat.guest.home.v1")!).templateKey)).toBe(key);
    const editor = await page.evaluate(() => {
      const home = JSON.parse(localStorage.getItem("habitat.guest.home.v1")!);
      return { rooms: home.doc.rooms.length, objects: home.doc.objects.length, openings: home.doc.geometry.openings.length };
    });
    expect(editor, label).toEqual(preview);
  }
});

test("homepage keeps the first layouts in view on a phone", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  const firstCard = page.getByRole("button", { name: "Open HDB 2-room Flexi" });
  const secondCard = page.getByRole("button", { name: "Open HDB 3-room" });
  await expect(firstCard).toBeVisible();
  await expect(secondCard).toBeVisible();
  const [firstBox, secondBox] = await Promise.all([firstCard.boundingBox(), secondCard.boundingBox()]);
  expect(firstBox?.y).toBeLessThan(520);
  expect(secondBox?.y).toBe(firstBox?.y);
});

for (const viewport of VIEWPORTS) {
  test(`guest pages have no horizontal overflow at ${viewport.width}px`, async ({ page }) => {
    await page.setViewportSize(viewport);
    for (const path of PUBLIC_PAGES) {
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await noHorizontalOverflow(page);
    }
  });
}

test("guest pages have no serious or critical axe violations", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const path of PUBLIC_PAGES) {
    await page.goto(path);
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page: page as unknown as AxePage }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "wcag22aa"]).analyze();
    expect(results.violations.filter((violation) => violation.impact === "serious" || violation.impact === "critical").map((violation) => `${path}: ${violation.id}`)).toEqual([]);
  }
});

test("signed-out visitors are still sent to sign in for account-only pages", async ({ page }) => {
  await page.goto("/assets");
  await expect(page).toHaveURL(/\/sign-in/);
  const api = await page.request.get("/api/export");
  expect(api.status()).toBe(401);
});
