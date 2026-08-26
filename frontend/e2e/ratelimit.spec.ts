import { test, expect } from "@playwright/test";
import { storageStatePath, type Role } from "./fixtures";

// Live rate-limit enforcement. Runs ONLY in the isolated `e2e-ratelimit` CI
// job, where Upstash is wired via an SRH sidecar so `rateLimitEnabled` is
// true. The anonymous contact-submit bucket is 10/hr per IP; from CI all
// requests share one loopback identity, so a flood from one client should
// trip the limiter and surface the "too frequently" message.
//
// This proves the integration genuinely throttles over real HTTP — it does
// NOT prove prod wiring (Vercel UPSTASH_* env) or Cloudflare's edge shield.

test("anonymous contact-submit bucket throttles a flood from one client", async ({ page }) => {
  await page.goto("/contact");

  const throttle = page.getByText(/too frequently/i);
  const success = page.getByText(/we[’']ve received your message/i);

  let sawSuccess = false;
  let sawThrottle = false;

  // The bucket allows 10/hr; 15 attempts is a comfortable margin to see the
  // transition from accepted to throttled.
  for (let i = 0; i < 15 && !sawThrottle; i++) {
    await page.locator("#email").fill(`flood${i}@example.com`);
    await page.locator("#subject").fill(`flood ${i}`);
    await page.locator("#message").fill("Rate-limit enforcement probe.");
    await page.getByRole("button", { name: "Send message" }).click();

    // Each submit resolves to exactly one of the two banners.
    await expect(throttle.or(success).first()).toBeVisible();
    if (await throttle.isVisible()) sawThrottle = true;
    else sawSuccess = true;
  }

  expect(sawSuccess, "expected at least one submit to be accepted before throttling").toBe(true);
  expect(sawThrottle, "expected the submit bucket to throttle within 15 rapid submits").toBe(true);
});

// Campus NAT. Imperial students on campus share one public IP, so keying the
// mutations bucket on IP made it a *campus* bucket — 60 mutations a minute for
// everyone in the building combined, and onboarding is a server action. This
// asserts the fix: signed-in traffic is keyed on the account, so several
// accounts bursting from one IP are not throttled by each other.
//
// From CI every request carries the same (loopback) IP, which is exactly the
// shape being tested. 3 accounts x 25 non-GET requests = 75 from one IP, well
// past the old 60/min per-IP ceiling and well under the new 60/min per-account
// one. Under the pre-fix code this test fails; that is the point of it.
//
// POST to "/" is the cheapest probe that still runs the proxy: the page has no
// POST handler, so Next answers 405 — but only *after* the limiter has had its
// say. Any status other than 429 means the request was not throttled.
test("a mutation burst from one IP across several accounts is not throttled", async ({
  playwright,
  baseURL,
}) => {
  test.setTimeout(90_000);

  const roles: Role[] = ["student", "admin", "reauth"];
  const sessions = await Promise.all(
    roles.map((role) =>
      playwright.request.newContext({ baseURL, storageState: storageStatePath(role) }),
    ),
  );

  try {
    for (let i = 0; i < 25; i++) {
      const responses = await Promise.all(sessions.map((s) => s.post("/")));
      responses.forEach((res, n) => {
        expect(
          res.status(),
          `round ${i + 1} as ${roles[n]}: throttled at ${i * roles.length + n + 1} ` +
            `mutations from one IP — the bucket is still keyed on the IP, not the account`,
        ).not.toBe(429);
      });
    }
  } finally {
    await Promise.all(sessions.map((s) => s.dispose()));
  }
});

// The other half of the same change: genuinely anonymous mutations still key on
// IP, because there is no better identity — but on their own bucket, at a
// ceiling that is a flood guard rather than a per-person limit. 75 anonymous
// non-GET requests would trip the old shared 60/min bucket; the anon bucket is
// 300/min, so they must all get through.
test("anonymous mutations get the higher flood-guard ceiling, not the per-user one", async ({
  playwright,
  baseURL,
}) => {
  test.setTimeout(90_000);

  const anon = await playwright.request.newContext({ baseURL });
  try {
    for (let i = 0; i < 75; i++) {
      const res = await anon.post("/");
      expect(
        res.status(),
        `anonymous request ${i + 1} was throttled — anonymous traffic is still ` +
          `sharing the 60/min per-user bucket`,
      ).not.toBe(429);
    }
  } finally {
    await anon.dispose();
  }
});
