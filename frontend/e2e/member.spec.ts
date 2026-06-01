import { test, expect } from "@playwright/test";

// Runs with the seeded approved-student storageState. These assert that the
// minted session is genuinely accepted by the server gates — if the cookie
// were wrong, requireApprovedUser would bounce to /login.

test("approved student reaches the community directory (not bounced to /login)", async ({ page }) => {
  await page.goto("/community");
  await expect(page).toHaveURL(/\/community/);
});

test("student can open the opportunities, events and vcs tabs", async ({ page }) => {
  for (const path of ["/opportunities", "/events", "/vcs"]) {
    await page.goto(path);
    await expect(page, `stayed on ${path}`).toHaveURL(new RegExp(path.replace("/", "\\/")));
  }
});

test("student can open settings", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(/\/settings/);
});

test("non-admin student gets a 404 on /admin (existence stays hidden)", async ({ page }) => {
  const res = await page.goto("/admin");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("Foundry control panel")).toHaveCount(0);
});
