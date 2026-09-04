"use server";

import * as Sentry from "@sentry/nextjs";
import { check } from "@/lib/ratelimit";
import { ok, err, type Result } from "@/lib/result";

// Pre-check gate in front of every client-side supabase.auth.verifyOtp()
// call (student/alum sign-in codes, email-change confirmation). verifyOtp
// has to run on the browser client — it's what sets the session cookie —
// so it never passes through proxy.ts's `mutations`/`anonMutations`
// backstop, and unlike every other auth call in this app it carries no
// captchaToken. Without this, a 6-digit code is guessable with zero
// app-side throttle.
//
// Keyed on the email being verified, not the caller: that's the actual
// attack surface — an attacker rotating IPs still can't rotate the target
// address they're guessing against.
export async function checkOtpVerifyRateLimit(email: string): Promise<Result> {
  const key = email.trim().toLowerCase();
  if (!key) return err("Enter your email first.");

  const decision = await check("otpVerify", key);
  if (decision === "limited") {
    return err("Too many attempts. Please wait a few minutes and try again.");
  }
  if (decision === "unavailable") {
    // otpVerify fails closed, like `submit` and the upload buckets — an
    // outage must not become a way to bypass the per-email guess limit.
    Sentry.captureMessage(
      "otpVerify rate-limit bucket unreachable — code verification is being refused (fail-closed)",
      { level: "error", tags: { bucket: "otpVerify", surface: "verifyOtpGate" } },
    );
    return err("We can't verify codes right now. Please try again in a few minutes.");
  }
  return ok();
}
