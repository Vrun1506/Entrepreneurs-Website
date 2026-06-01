import { test, expect } from "@playwright/test";

// Runs with the seeded admin storageState.

test("admin lands on the control panel", async ({ page }) => {
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.getByText("Foundry control panel")).toBeVisible();
});

test("admin can open each review queue", async ({ page }) => {
  for (const path of ["/admin/opportunities", "/admin/events", "/admin/vcs", "/admin/users"]) {
    const res = await page.goto(path);
    expect(res?.status(), `status for ${path}`).toBeLessThan(400);
    await expect(page, `stayed on ${path}`).toHaveURL(new RegExp(path.replace(/\//g, "\\/")));
  }
});
