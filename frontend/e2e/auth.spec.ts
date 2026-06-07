import { test, expect, type Page } from "@playwright/test";

// ════════════════════════════════════════════════════════════════════
// Foundry · Auth entry-flow E2E (logged-out)
//
// The signup/login surface has no other E2E coverage: the rest of the
// suite seeds users via the admin API and loads a storageState, so it
// never exercises the role chooser, client-side validation, or the
// "check your inbox" panels — exactly the paths that have bitten us
// (alum signup dead-end, unconfirmed-alum sign-in).
//
// GoTrue calls are mocked at the network boundary (`page.route`) so the
// outcomes are deterministic regardless of the ephemeral stack's email-
// confirmation setting. Everything else (validation, gating, panel
// rendering) is real client behaviour.
// ════════════════════════════════════════════════════════════════════

// Fulfil a GoTrue endpoint with a fixed JSON body, including the CORS
// preflight the browser fires before the cross-origin POST.
async function mockGoTrue(page: Page, urlGlob: string, body: unknown) {
  await page.route(urlGlob, async (route) => {
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-headers": "*",
      "access-control-allow-methods": "*",
    };
    if (route.request().method() === "OPTIONS") {
      await route.fulfill({ status: 204, headers: cors });
      return;
    }
    await route.fulfill({
      status: 200,
      headers: { ...cors, "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  });
}

test.describe("auth entry flows", () => {
  test("role chooser offers both student and alum", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("button", { name: /current Imperial student/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /Imperial alum/i })).toBeVisible();
  });

  test("student: a non-Imperial email is rejected client-side (no email sent)", async ({ page }) => {
    // The domain is checked before any network call, so this never reaches
    // GoTrue — assert that, then assert the error.
    let otpCalled = false;
    await page.route("**/auth/v1/otp**", (route) => { otpCalled = true; route.abort(); });

    await page.goto("/login");
    await page.getByRole("button", { name: /current Imperial student/i }).click();
    await page.getByRole("checkbox").check(); // T&C gates the submit button
    await page.locator("#email").fill("someone@gmail.com");
    await page.getByRole("button", { name: "Send verification link" }).click();

    await expect(page.getByText(/use your Imperial email/i)).toBeVisible();
    expect(otpCalled, "no OTP request should fire for a bad domain").toBe(false);
  });

  test("student: a valid Imperial email shows the check-your-inbox panel", async ({ page }) => {
    await mockGoTrue(page, "**/auth/v1/otp**", {});

    await page.goto("/login");
    await page.getByRole("button", { name: /current Imperial student/i }).click();
    await page.locator("#first-name").fill("Ada");
    await page.locator("#surname").fill("Lovelace");
    await page.locator("#email").fill("ada@imperial.ac.uk");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Send verification link" }).click();

    await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
    await expect(page.getByText("ada@imperial.ac.uk")).toBeVisible();
  });

  test("alum: the submit button is gated on the T&C checkbox", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /Imperial alum/i }).click();

    const submit = page.getByRole("button", { name: "Create account" });
    await expect(submit).toBeDisabled();
    await page.getByRole("checkbox").check();
    await expect(submit).toBeEnabled();
  });

  test("alum: mismatched passwords are rejected client-side", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /Imperial alum/i }).click();
    await page.locator("#first-name").fill("Grace");
    await page.locator("#surname").fill("Hopper");
    await page.locator("#email").fill("grace@example.com");
    await page.locator("#password").fill("password123");
    await page.locator("#repeat-password").fill("password456");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText(/passwords do not match/i)).toBeVisible();
  });

  test("alum: a password under 8 characters is rejected client-side", async ({ page }) => {
    await page.goto("/login");
    await page.getByRole("button", { name: /Imperial alum/i }).click();
    await page.locator("#first-name").fill("Grace");
    await page.locator("#surname").fill("Hopper");
    await page.locator("#email").fill("grace@example.com");
    await page.locator("#password").fill("short");
    await page.locator("#repeat-password").fill("short");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText(/at least 8 characters/i)).toBeVisible();
  });

  test("alum: a successful signup with no session shows check-your-inbox", async ({ page }) => {
    // "Confirm email" ON → GoTrue returns a user but no session. This is the
    // path that used to dump alums on '/' (fixed in this PR): assert they get
    // the check-your-inbox panel instead.
    await mockGoTrue(page, "**/auth/v1/signup**", {
      user: { id: "00000000-0000-0000-0000-000000000001", email: "newalum@example.com" },
      session: null,
    });

    await page.goto("/login");
    await page.getByRole("button", { name: /Imperial alum/i }).click();
    await page.locator("#first-name").fill("New");
    await page.locator("#surname").fill("Alum");
    await page.locator("#email").fill("newalum@example.com");
    await page.locator("#password").fill("password123");
    await page.locator("#repeat-password").fill("password123");
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
    await expect(page.getByText("newalum@example.com")).toBeVisible();
  });

  test("auth/confirm without a token bounces to /login", async ({ page }) => {
    // The token_hash verification route (used by cross-browser email links).
    // With no token it must fail closed back to /login, not error out — the
    // login page surfaces the reason from ?error=.
    await page.goto("/auth/confirm");
    await expect(page).toHaveURL(/\/login/);
    await expect(page.getByText(/invalid or has expired/i)).toBeVisible();
  });

  test("alum: forgot-password sends a reset link and shows confirmation", async ({ page }) => {
    await mockGoTrue(page, "**/auth/v1/recover**", {});

    // The mode toggle also resets the role chooser, so switch to sign-in mode
    // first (from the chooser), THEN pick alum — otherwise we bounce back to
    // the chooser and the forgot link never renders.
    await page.goto("/login");
    await page.getByRole("button", { name: "Sign in" }).click(); // toggle into sign-in mode
    await page.getByRole("button", { name: /Imperial alum/i }).click();
    await page.getByRole("button", { name: "Forgot your password?" }).click();

    await page.locator("#reset-email").fill("alum@example.com");
    await page.getByRole("button", { name: "Send reset link" }).click();

    await expect(page.getByRole("heading", { name: "Check your inbox" })).toBeVisible();
    await expect(page.getByText("alum@example.com")).toBeVisible();
  });

  test("reset-password without a recovery session bounces to /login", async ({ page }) => {
    // The page requires both a session and the pw-recovery marker cookie; with
    // neither it must fail closed so it can't be used to bypass the settings
    // reauth on password change.
    await page.goto("/reset-password");
    await expect(page).toHaveURL(/\/login/);
  });
});
