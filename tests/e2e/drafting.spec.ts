import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { signUpWithHome, uid } from "./helpers";

/**
 * CAD-style drafting: a person draws their own home from scratch on a new
 * level — walls by typed lengths, a door and a window, a room, a dimension —
 * saves, reloads, sees it in 3D and exports DXF.
 */
type V = { scale: number; x: number; y: number };
const view = (page: Page) => page.evaluate(() => (window as unknown as { __habitatView: V }).__habitatView);
async function toScreen(page: Page, p: { x: number; y: number }) {
  return page.evaluate((p) => {
    const w = window as unknown as { __habitatView: V; __habitatStage: { container: () => HTMLElement } };
    const r = w.__habitatStage.container().getBoundingClientRect();
    return { x: r.left + p.x * w.__habitatView.scale + w.__habitatView.x, y: r.top + p.y * w.__habitatView.scale + w.__habitatView.y };
  }, p);
}

test("draw a room from scratch with walls, a door, a window and a dimension", async ({ page }) => {
  await signUpWithHome(page, "Drafter", `drafter-${uid()}@example.com`);
  await page.goto("/home?edit=1");
  await page.waitForFunction(() => "__habitatStage" in window);

  // New blank level
  await page.getByRole("button", { name: "Add a level" }).first().click();
  await page.getByLabel("Level name").fill("Studio");
  await page.getByRole("button", { name: "Add level" }).click();
  await page.waitForURL(/floor=.*edit=1/);
  await expect(page.getByText("Draw your home:")).toBeVisible();
  await page.waitForFunction(() => "__habitatStage" in window);

  // Walls: start at a known world point, then type lengths.
  const canvas = page.getByRole("application");
  await canvas.focus();
  await page.keyboard.press("w");
  const origin = { x: 500, y: 400 };
  const s0 = await toScreen(page, origin);
  await page.mouse.move(s0.x, s0.y);
  await page.mouse.click(s0.x, s0.y);
  await expect(page.getByText(/WALL\s+Specify next point/)).toBeVisible();
  const legs: [number, number, string][] = [[1, 0, "4"], [0, 1, "3"], [-1, 0, "400cm"], [0, -1, "3m"]];
  let cur = { ...origin };
  for (const [dx, dy, len] of legs) {
    const sc = await toScreen(page, cur);
    await page.mouse.move(sc.x + dx * 80, sc.y + dy * 80, { steps: 3 });
    await page.keyboard.type(len);
    await page.keyboard.press("Enter");
    const cm = len.endsWith("cm") ? parseFloat(len) : parseFloat(len) * 100;
    cur = { x: cur.x + dx * cm, y: cur.y + dy * cm };
  }
  await expect(page.getByRole("button", { name: "Undo" })).toBeEnabled();

  // Door on the top wall, window on the right wall
  await canvas.focus();
  await page.keyboard.press("d");
  let p = await toScreen(page, { x: origin.x + 200, y: origin.y });
  await page.mouse.click(p.x, p.y);
  await expect(page.getByRole("heading", { name: "Door" })).toBeVisible();
  await canvas.focus();
  await page.keyboard.press("n");
  p = await toScreen(page, { x: origin.x + 400, y: origin.y + 150 });
  await page.mouse.click(p.x, p.y);
  await expect(page.getByRole("heading", { name: "Window" })).toBeVisible();

  // Room by snapping to the corners
  await canvas.focus();
  await page.keyboard.press("r");
  for (const [dx, dy] of [[0, 0], [400, 0], [400, 300], [0, 300], [0, 0]]) {
    const c = await toScreen(page, { x: origin.x + dx, y: origin.y + dy });
    await page.mouse.move(c.x + 2, c.y + 2, { steps: 2 });
    await page.mouse.click(c.x + 2, c.y + 2);
  }
  await expect(page.getByRole("heading", { name: "Room" })).toBeVisible();
  await expect(page.getByText("12.0 m²").first()).toBeVisible();

  // Dimension along the top wall
  await canvas.focus();
  await page.keyboard.press("m");
  for (const [dx, dy] of [[0, 0], [400, 0], [200, -60]]) {
    const c = await toScreen(page, { x: origin.x + dx, y: origin.y + dy });
    await page.mouse.move(c.x, c.y, { steps: 2 });
    await page.mouse.click(c.x, c.y);
  }
  await page.keyboard.press("v");

  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Drawing saved")).toBeVisible();

  // Reload: the drawing summary reflects what persisted
  await page.reload();
  await page.waitForFunction(() => "__habitatStage" in window);
  const props = page.getByRole("complementary", { name: "Properties" });
  await expect(props.getByText("Walls").locator("..").getByText("4", { exact: true })).toBeVisible();
  await expect(props.getByText("Doors & windows").locator("..").getByText("2", { exact: true })).toBeVisible();
  await expect(props.getByText(/12\.0 m²/)).toBeVisible();

  // 3D renders from the same drawing
  await page.getByRole("radio", { name: "2D and 3D side by side" }).click();
  await expect(page.getByLabel("3D view of the drawing")).toBeVisible();

  // DXF export
  await page.getByRole("button", { name: "Drawing options" }).click();
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("menuitem", { name: /DXF for AutoCAD/ }).click()]);
  const dxf = readFileSync((await download.path())!, "utf8");
  expect(download.suggestedFilename()).toMatch(/studio\.dxf$/);
  expect(dxf).toContain("AC1009");
  expect(dxf.match(/LINE\r\n8\r\nWALLS/g)?.length ?? 0).toBeGreaterThanOrEqual(16);
  expect(dxf).toContain("ARC\r\n8\r\nDOORS");
  expect(dxf).toContain("4.00 m");
  void view;
});
