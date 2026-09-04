import { afterEach, describe, it, expect, vi } from "vitest";

const checkMock = vi.hoisted(() => vi.fn());
const captureMessageMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/ratelimit", () => ({ check: checkMock }));
vi.mock("@sentry/nextjs", () => ({ captureMessage: captureMessageMock }));

import { checkOtpVerifyRateLimit } from "./verifyOtpGate";

// This is the only throttle in front of supabase.auth.verifyOtp() — a
// 6-digit code with zero app-side guard is guessable. What matters here:
// it's keyed on the target email (not the caller, who can rotate IPs),
// it blocks once limited, and — like `submit`/the upload buckets — it
// fails CLOSED on a ratelimit-backend outage rather than silently letting
// guesses through.

afterEach(() => {
  vi.clearAllMocks();
});

describe("checkOtpVerifyRateLimit", () => {
  it("rejects a blank email without ever calling the rate limiter", async () => {
    const res = await checkOtpVerifyRateLimit("   ");
    expect(res.ok).toBe(false);
    expect(checkMock).not.toHaveBeenCalled();
  });

  it("keys the otpVerify bucket on the normalised target email", async () => {
    checkMock.mockResolvedValue("allowed");
    const res = await checkOtpVerifyRateLimit(" Person@Example.com ");
    expect(res.ok).toBe(true);
    expect(checkMock).toHaveBeenCalledWith("otpVerify", "person@example.com");
  });

  it("blocks once the per-email guess limit is hit", async () => {
    checkMock.mockResolvedValue("limited");
    const res = await checkOtpVerifyRateLimit("person@example.com");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toMatch(/too many attempts/i);
  });

  it("fails closed and reports to Sentry when the bucket is unreachable", async () => {
    checkMock.mockResolvedValue("unavailable");
    const res = await checkOtpVerifyRateLimit("person@example.com");
    expect(res.ok).toBe(false);
    expect(captureMessageMock).toHaveBeenCalledWith(
      expect.stringContaining("otpVerify"),
      expect.objectContaining({ level: "error" }),
    );
  });
});
