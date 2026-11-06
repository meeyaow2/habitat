import { expect, test } from "@playwright/test";
import { signUpWithHome, uid } from "./helpers";

/** Journeys 13–14: a household member sees shared records; outsiders see nothing. */
test("invited members share records; other accounts cannot access them", async ({ browser }) => {
  const ownerCtx = await browser.newContext();
  const owner = await ownerCtx.newPage();
  await signUpWithHome(owner, "Wei Ling", `owner-${uid()}@example.com`);

  // Owner adds an item
  await owner.goto("/assets?new=1");
  const add = owner.getByRole("dialog", { name: "Add an appliance or item" });
  await add.getByLabel("Category").selectOption({ label: "Refrigerator" });
  await add.getByLabel("Brand").fill("Mitsubishi");
  await add.getByRole("button", { name: "Add item" }).click();
  await expect(owner.getByText("Added Refrigerator")).toBeVisible();
  await owner.getByRole("link", { name: "Refrigerator" }).click();
  await owner.waitForURL(/\/assets\/[0-9a-f-]{36}$/);
  const assetPath = new URL(owner.url()).pathname;

  // Owner invites a member
  const memberEmail = `member-${uid()}@example.com`;
  await owner.goto("/household");
  await owner.getByRole("button", { name: "Invite someone" }).click();
  await owner.getByLabel("Email").fill(memberEmail);
  await owner.getByRole("button", { name: "Create invitation" }).click();
  const link = await owner.getByLabel("Invitation link").inputValue();
  expect(link).toMatch(/\/invite\/[\w-]{40,}/);
  const invitePath = new URL(link).pathname;

  // A stranger with the link but a different email cannot use it
  const strangerCtx = await browser.newContext();
  const stranger = await strangerCtx.newPage();
  await signUpWithHome(stranger, "Stranger", `stranger-${uid()}@example.com`);
  await stranger.goto(invitePath);
  await stranger.getByRole("button", { name: "Join household" }).click();
  await expect(stranger.getByText("This invitation was sent to a different email address")).toBeVisible();

  // Journey 14: the stranger cannot open the owner's records
  const res = await stranger.goto(assetPath);
  expect(res?.status()).toBe(404);
  await stranger.goto("/assets");
  await expect(stranger.getByText("Refrigerator")).toHaveCount(0);
  const exportJson = await (await stranger.request.get("/api/export")).json();
  expect(JSON.stringify(exportJson)).not.toContain("Mitsubishi");

  // Journey 13: the invited member signs up with the invited email and joins
  const memberCtx = await browser.newContext();
  const member = await memberCtx.newPage();
  await member.goto(invitePath);
  await expect(member.getByRole("heading", { name: /Join/ })).toBeVisible();
  await member.getByRole("link", { name: "Create an account" }).click();
  await member.getByLabel("Your name").fill("Jun Hao");
  await member.getByLabel("Email").fill(memberEmail);
  await member.getByLabel("Password").fill("correct-horse-battery");
  await member.getByRole("button", { name: "Create account" }).click();
  await member.waitForURL(`**${invitePath}`);
  await member.getByRole("button", { name: "Join household" }).click();
  await member.waitForURL("**/overview");

  await member.goto(assetPath);
  await expect(member.getByRole("heading", { name: "Refrigerator" })).toBeVisible();
  // Members can't delete an owner's item, invite people, or reset the layout
  await member.getByRole("button", { name: "More actions" }).click();
  await expect(member.getByRole("menuitem", { name: "Delete permanently" })).toHaveCount(0);
  await member.keyboard.press("Escape");
  await member.goto("/household");
  await expect(member.getByRole("button", { name: "Invite someone" })).toHaveCount(0);
  await expect(member.getByText("Jun Hao (you)")).toBeVisible();

  // The invitation is single-use
  await owner.goto("/household");
  await expect(owner.getByText("Accepted")).toBeVisible();
  await stranger.goto(invitePath);
  await expect(stranger.getByText("Invitation no longer valid")).toBeVisible();

  await Promise.all([ownerCtx.close(), strangerCtx.close(), memberCtx.close()]);
});
