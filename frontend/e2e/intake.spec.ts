import { test, expect } from "@playwright/test";

// ════════════════════════════════════════════════════════════════════
// Foundry · Rebuilt intake (preview route)
//
// /onboarding/preview is admin-only and submits nothing — several of its
// fields have no column yet. These tests cover the two things that would
// otherwise only be caught by eye: that the nine screens are reachable in
// order, and that the gate actually gates.
// ════════════════════════════════════════════════════════════════════

test.describe("intake preview", () => {
  test("gate refuses to advance without its required fields", async ({ page }) => {
    await page.goto("/onboarding/preview");

    await expect(page.getByRole("heading", { name: "Who let you in?" })).toBeVisible();
    await expect(page.getByText("Screen 1 / 9")).toBeVisible();

    // Affiliation arrives already decided — it is set at signup and locked —
    // so the first thing that can fail here is the empty course.
    await page.getByRole("button", { name: /Continue/ }).click();
    await expect(page.getByText("Course is required.")).toBeVisible();
    await expect(page.getByRole("heading", { name: "Who let you in?" })).toBeVisible();

    await page.getByPlaceholder("MEng Computing").fill("MEng Computing");
    await page.getByLabel(/graduation year/i).selectOption({ index: 1 });
    await page.getByRole("button", { name: /Continue/ }).click();

    await expect(page.getByRole("heading", { name: "Put a face to it" })).toBeVisible();
    await expect(page.getByText("Screen 2 / 9")).toBeVisible();
  });

  test("photo is a hard requirement at the gate", async ({ page }) => {
    await page.goto("/onboarding/preview");

    await page.getByPlaceholder("MEng Computing").fill("MEng Computing");
    await page.getByLabel(/graduation year/i).selectOption({ index: 1 });
    await page.getByRole("button", { name: /Continue/ }).click();

    await page.getByRole("button", { name: /Finish the gate/ }).click();
    await expect(page.getByText("A photo is required to finish the gate.")).toBeVisible();
  });

  test("the rail lets you back to a visited screen but not ahead", async ({ page }) => {
    await page.goto("/onboarding/preview");

    // "Skills" is four screens ahead and must not be reachable yet.
    const rail = page.getByRole("navigation", { name: "Intake progress" });
    await expect(rail.getByRole("button", { name: /Skills/ })).toHaveCount(0);
  });
});
