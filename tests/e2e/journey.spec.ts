import path from "node:path";
import { expect, test } from "@playwright/test";
import { signUp, todaySG, uid } from "./helpers";

/**
 * Critical journeys 1–12: sign up → household → template → washing machine →
 * inventory → floor-plan placement → persistence → receipt → recurring task →
 * dashboard → service expense → reporting period.
 */
test("a new household sets up their home end to end", async ({ page }) => {
  const email = `journey-${uid()}@example.com`;

  // 1. Sign up and create a household
  await signUp(page, "Priya Nair", email);
  await page.waitForURL("**/onboarding");
  await page.getByRole("button", { name: "Get started" }).click();
  await page.getByLabel("Home name").fill("Tampines flat");
  await page.getByLabel("Household name").fill("The Nair household");
  await expect(page.getByRole("radio", { name: "HDB flat" })).toBeChecked();
  await page.getByRole("radio", { name: "4-room" }).check();
  await page.getByRole("button", { name: "Continue" }).click();

  // 2. Choose a template
  await expect(page.getByText("Starter layouts are illustrative")).toBeVisible();
  await expect(page.getByRole("radio", { name: /HDB 4-room/ })).toBeChecked();
  await page.getByRole("button", { name: "Use this layout" }).click();

  // 3. Add a washing machine
  await expect(page.getByRole("heading", { name: "Add your first appliance" })).toBeVisible();
  await expect(page.getByLabel("Name")).toHaveValue("Washing machine");
  await page.getByLabel("Brand").fill("Samsung");
  await page.getByLabel("Room").selectOption({ label: "Service yard" });
  await page.getByLabel("Purchase date").fill(todaySG(-30));
  await page.getByLabel("Price (SGD)").fill("749");
  await page.getByRole("button", { name: "2y" }).click();
  await page.getByRole("button", { name: "Add appliance" }).click();
  await page.getByRole("button", { name: "Open my home" }).click();
  await page.waitForURL("**/home?welcome=1");
  await expect(page.getByText("This is your home")).toBeVisible();

  // 4. It appears in the inventory, with its warranty
  await page.goto("/assets");
  const row = page.getByRole("row", { name: /Washing machine/ });
  await expect(row).toContainText("Service yard");
  await expect(row).toContainText("Covered");

  // 5. Place it on the floor plan and save
  await page.goto("/home?edit=1");
  await expect(page.getByText("Not on the plan · 1")).toBeVisible();
  await page.getByRole("button", { name: "Place Washing machine on the plan" }).click();
  await expect(page.getByText("Not on the plan · 0")).toBeVisible();
  await expect(page.getByText("Unsaved changes")).toBeVisible();
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.getByText("Floor plan saved")).toBeVisible();

  // 6. Refresh: the position persists (view mode lists it inside its room)
  await page.goto("/home");
  const rooms = page.getByRole("complementary", { name: "Rooms and items" });
  await expect(rooms.getByRole("button", { name: "Washing machine" })).toBeVisible();
  await rooms.getByRole("button", { name: "Washing machine" }).click();
  const drawer = page.getByRole("dialog");
  await expect(drawer.getByText("Samsung")).toBeVisible();
  await expect(drawer.getByText("Service yard")).toBeVisible();

  // 7–8. Upload a receipt linked to the washing machine
  await drawer.getByRole("link", { name: "Full details" }).click();
  await page.waitForURL(/\/assets\/[0-9a-f-]{36}$/);
  const assetUrl = page.url();
  await page.getByRole("link", { name: "Upload" }).click();
  await page.waitForURL(/\/documents\?upload=receipt&asset=/);
  await page.locator('input[type="file"]').setInputFiles(path.join(__dirname, "fixtures/receipt.pdf"));
  await page.getByLabel("Title").fill("Samsung washer receipt");
  await expect(page.getByLabel("Link to item")).toHaveValue(new URL(assetUrl).pathname.split("/").pop()!);
  await page.getByRole("button", { name: "Upload", exact: true }).click();
  await expect(page.getByText("Document uploaded")).toBeVisible();
  await page.goto(assetUrl);
  await expect(page.getByRole("link", { name: /Samsung washer receipt/ })).toBeVisible();

  // 9. Create a recurring maintenance task
  await page.getByRole("button", { name: "Schedule" }).click();
  const dialog = page.getByRole("dialog", { name: "New maintenance task" });
  await dialog.getByLabel("Task").fill("Clean drum filter");
  await dialog.getByLabel("Due").fill(todaySG(3));
  await dialog.getByLabel("Repeats").selectOption({ label: "Monthly" });
  await dialog.getByRole("button", { name: "Schedule task" }).click();
  await expect(page.getByText("Task scheduled")).toBeVisible();

  // 10. It appears on the dashboard
  await page.goto("/overview");
  const upcoming = page.getByRole("list", { name: "Maintenance tasks" });
  await expect(upcoming.getByText("Clean drum filter")).toBeVisible();
  await expect(page.getByRole("link", { name: /Due in 14 days\s*1/ })).toBeVisible();

  // 11. Record the service with a cost
  await page.getByRole("button", { name: "Mark “Clean drum filter” as done" }).click();
  const done = page.getByRole("dialog", { name: "Mark as done" });
  await done.getByLabel("Cost (SGD)").fill("80");
  await done.getByLabel("Done by").fill("WashPro Services");
  await expect(done.getByText("Next one will be scheduled for")).toBeVisible();
  await done.getByRole("button", { name: "Mark as done" }).click();
  await expect(page.getByText(/Done\. Next one due/)).toBeVisible();

  // 12. The expense appears in this month's reporting period
  await page.goto("/expenses?period=month");
  const expenseRow = page.getByRole("row", { name: /Clean drum filter/ });
  await expect(expenseRow).toContainText("$80.00");
  await expect(expenseRow).toContainText("Servicing");
  const csv = await page.request.get("/api/expenses/export?period=month");
  expect(csv.status()).toBe(200);
  const body = await csv.text();
  expect(body).toContain('"Clean drum filter","Servicing","80.00","SGD","Washing machine","WashPro Services"');
  // The purchase was dated 30 days ago, so it belongs to an earlier month — but this year.
  expect(body).not.toContain("Purchase: Washing machine");
  const yearCsv = await (await page.request.get("/api/expenses/export?period=12m")).text();
  expect(yearCsv).toContain('"Purchase: Washing machine","Appliance purchases","749.00","SGD","Washing machine"');

  // The dashboard's spending reflects it too
  await page.goto("/overview");
  await expect(page.getByText("$80.00 this month")).toBeVisible();
});
