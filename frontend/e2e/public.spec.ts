import { test, expect } from "@playwright/test";

// ─── Public routes: render without auth (the "endpoints are alive" proof) ──
const PUBLIC_ROUTES = ["/", "/login", "/contact", "/privacy", "/terms"];

for (const path of PUBLIC_ROUTES) {
  test(`public route ${path} renders a 2xx/3xx page`, async ({ page }) => {
    const res = await page.goto(path, { waitUntil: "domcontentloaded" });
    expect(res, `no response for ${path}`).not.toBeNull();
    expect(res!.status(), `status for ${path}`).toBeLessThan(400);
    await expect(page.locator("body")).toBeVisible();
  });
}

test("login page exposes an auth entry point", async ({ page }) => {
  await page.goto("/login");
  // Don't over-couple to copy: any interactive control (role buttons, Google,
  // email field) proves the auth UI mounted.
  await expect(page.locator("button, input").first()).toBeVisible();
});

test("contact form renders its inputs when logged out", async ({ page }) => {
  await page.goto("/contact");
  await expect(page.locator("#email")).toBeVisible();
  await expect(page.locator("#subject")).toBeVisible();
  await expect(page.locator("#message")).toBeVisible();
});

// ─── Access control: gated routes bounce logged-out visitors to /login ─────
const GATED_ROUTES = [
  "/community",
  "/opportunities",
  "/events",
  "/vcs",
  "/my-submissions",
  "/my-bookmarks",
  "/settings",
];

for (const path of GATED_ROUTES) {
  test(`gated route ${path} redirects to /login when logged out`, async ({ page }) => {
    await page.goto(path);
    await expect(page).toHaveURL(/\/login/);
  });
}

// /admin is deliberately different: the admin layout calls notFound() for
// non-admins, so its very existence is hidden behind a 404 rather than a
// login redirect. Assert that, and that no admin content leaks.
test("/admin is hidden behind a 404 when logged out (no content leak)", async ({ page }) => {
  const res = await page.goto("/admin");
  expect(res?.status()).toBe(404);
  await expect(page.getByText("Foundry control panel")).toHaveCount(0);
});
