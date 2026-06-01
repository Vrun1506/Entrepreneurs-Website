import { test, expect } from "@playwright/test";

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
