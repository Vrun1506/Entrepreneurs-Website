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

test("public contact form submits anonymously and confirms success", async ({ page }) => {
  // Turnstile is unconfigured in CI, so the anonymous path submits straight
  // through to the server action, which enqueues to outbound_email via the
  // service client — a real write, all on the ephemeral stack.
  await page.goto("/contact");
  await page.locator("#email").fill("e2e-visitor@example.com");
  await page.locator("#subject").fill("E2E hello");
  await page.locator("#message").fill("Automated contact submission from the E2E suite.");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(/we[’']ve received your message/i)).toBeVisible();
});

// ─── CSP: the header is present with a nonce, and the app hydrates clean ───
// This is the pre-deploy gate for enforce-mode CSP: if a directive were too
// strict, Next's inline hydration scripts would be refused and we'd see a
// "Content Security Policy" console violation here before it ever ships.
test("home page carries a nonce-based CSP and hydrates with zero violations", async ({ page }) => {
  const violations: string[] = [];
  const isCspViolation = (text: string) =>
    /content security policy|refused to (execute|load|connect|apply|create)/i.test(text);
  page.on("console", (msg) => {
    if (msg.type() === "error" && isCspViolation(msg.text())) violations.push(msg.text());
  });
  page.on("pageerror", (err) => {
    if (isCspViolation(err.message)) violations.push(err.message);
  });

  const res = await page.goto("/", { waitUntil: "networkidle" });
  const csp = res?.headers()["content-security-policy"];
  expect(csp, "CSP header present").toBeTruthy();
  expect(csp!, "CSP carries a per-request nonce").toMatch(/'nonce-[A-Za-z0-9+/=]+'/);
  expect(csp!).toContain("'strict-dynamic'");

  expect(violations, `CSP violations on /: ${violations.join(" | ")}`).toEqual([]);
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
