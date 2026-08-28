import { test, expect } from "@playwright/test";

// ════════════════════════════════════════════════════════════════════
// Foundry · /home + the app shell
//
// Covers the two things most likely to regress silently: that the rail
// reaches every destination it claims to, and that the sections degrade
// to an honest empty state rather than a blank page when the seeded DB
// has no listings.
// ════════════════════════════════════════════════════════════════════

test.describe("home", () => {
  test("greets the member and renders every listing section", async ({ page }) => {
    await page.goto("/home");

    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();

    for (const name of ["Events", "Opportunities", "VCs and Grants"]) {
      await expect(page.getByRole("heading", { name, exact: true })).toBeVisible();
    }

    // Either real cards or the empty state — never nothing.
    const events = page.locator("section", { hasText: "Foundry gatherings" });
    await expect(events.locator("li, p").first()).toBeVisible();
  });

  test("each section offers a way through to its full page", async ({ page }) => {
    await page.goto("/home");

    for (const [label, href] of [
      ["View all Events", "/events"],
      ["View all Opportunities", "/opportunities"],
      ["View all VCs and Grants", "/vcs"],
    ] as const) {
      await expect(page.getByRole("link", { name: label })).toHaveAttribute("href", href);
    }
  });

  test("the newest-members strip moved here, and off the directory", async ({ page }) => {
    await page.goto("/home");
    await expect(page.getByRole("heading", { name: /newest members/i })).toBeVisible();

    // The member search that used to sit under the greeting is gone: the
    // directory owns searching, and one box that navigates away was a
    // second, worse entry point to it.
    await expect(page.getByRole("searchbox")).toHaveCount(0);

    await page.goto("/members");
    await expect(page.getByRole("heading", { name: /newest members/i })).toHaveCount(0);
  });

  test("messaging is reachable and says so plainly", async ({ page }) => {
    await page.goto("/home");
    await page.getByRole("navigation", { name: "Main" })
      .getByRole("link", { name: "Messaging" }).click();

    await expect(page).toHaveURL(/\/messaging$/);
    await expect(page.getByRole("heading", { name: "Coming Soon!" })).toBeVisible();
  });

  test("the rail links to every destination it lists", async ({ page }) => {
    await page.goto("/home");
    const nav = page.getByRole("navigation", { name: "Main" });

    for (const [label, href] of [
      ["Home", "/home"],
      ["Members", "/members"],
      ["Messaging", "/messaging"],
      ["Opportunities", "/opportunities"],
      ["Events", "/events"],
      ["Grants & VCs", "/vcs"],
      ["Calendar", "/calendar"],
      ["My activity", "/my-activity"],
      ["My submissions", "/my-submissions"],
    ] as const) {
      await expect(nav.getByRole("link", { name: label })).toHaveAttribute("href", href);
    }

    await expect(nav.getByRole("link", { name: "Home" })).toHaveAttribute(
      "aria-current",
      "page",
    );
  });

  test("collapsing the rail persists across a reload", async ({ page }) => {
    await page.goto("/home");
    const nav = page.getByRole("navigation", { name: "Main" });

    await expect(nav.getByRole("link", { name: "Members" })).toBeVisible();
    await page.getByRole("button", { name: "Collapse navigation" }).click();

    // Labels go, the destinations stay reachable by their accessible name.
    await expect(page.getByRole("button", { name: "Expand navigation" })).toBeVisible();

    await page.reload();
    await expect(page.getByRole("button", { name: "Expand navigation" })).toBeVisible();
  });

  test("the old /community route still lands, filters intact", async ({ page }) => {
    // Filtered directory views are links people have already shared, so the
    // redirect has to carry the query — not just the path.
    await page.goto("/community?role=alum&gradMin=2020");
    await expect(page).toHaveURL(/\/members\?.*role=alum/);
    await expect(page).toHaveURL(/gradMin=2020/);
  });

});
