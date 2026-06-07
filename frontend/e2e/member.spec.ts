import { test, expect } from "@playwright/test";
import { USERS } from "./fixtures";

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

// Changing the password reauthenticates with the current one first, so an
// unlocked, logged-in session can't silently reset the credential.
test("settings password change requires the correct current password", async ({ page }) => {
  const original = USERS.student.password;
  const next = "E2e-Student-Pw-456!";

  const current = page.getByLabel("Current password", { exact: true });
  const newPw = page.getByLabel("New password", { exact: true });
  const confirm = page.getByLabel("Confirm new password", { exact: true });
  const submit = page.getByRole("button", { name: "Update password" });

  await page.goto("/settings");

  // Wrong current password → rejected, credential untouched.
  await current.fill("not-the-password");
  await newPw.fill(next);
  await confirm.fill(next);
  await submit.click();
  await expect(page.getByText("Current password is incorrect.")).toBeVisible();

  // Correct current password → succeeds.
  await current.fill(original);
  await newPw.fill(next);
  await confirm.fill(next);
  await submit.click();
  await expect(page.getByText("Password updated.")).toBeVisible();

  // Restore the fixture password (fields clear only on success) so a local
  // re-run against a persistent stack still signs in during global-setup.
  // CI uses a fresh stack each run, so this is belt-and-braces.
  await current.fill(next);
  await newPw.fill(original);
  await confirm.fill(original);
  await submit.click();
  await expect(current).toHaveValue("");
});
