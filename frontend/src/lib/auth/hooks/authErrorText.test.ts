import { describe, it, expect } from "vitest";
import { friendlyAuthError, friendlyVerifyError } from "./authErrorText";

// friendlyAuthError/friendlyVerifyError exist specifically to stop a raw
// ?error= query param — attacker-controllable — from being rendered
// verbatim as page content (a phishing/content-spoof vector). The one
// thing that actually matters here is that arbitrary/unrecognised input
// never comes back out unchanged.

describe("friendlyAuthError", () => {
  it("never echoes attacker-controlled input back verbatim", () => {
    const payload = "<script>alert(document.cookie)</script>";
    const result = friendlyAuthError(payload);
    expect(result).not.toContain(payload);
    expect(result).not.toContain("<script>");
  });

  it("falls back to a generic message for unrecognised error text", () => {
    expect(friendlyAuthError("some_unmapped_provider_code")).toBe(
      "Something went wrong during sign-in. Please try again.",
    );
  });

  it("maps known cases to fixed, friendly copy", () => {
    expect(friendlyAuthError("Email not confirmed")).toMatch(/confirm your email/i);
    expect(friendlyAuthError("otp_expired")).toMatch(/invalid or has expired/i);
    expect(friendlyAuthError("invalid_request: missing_code")).toMatch(/invalid or has expired/i);
    expect(friendlyAuthError("PKCE code verifier mismatch")).toMatch(/same browser/i);
    expect(friendlyAuthError("access_denied")).toBe("Sign-in was cancelled.");
    expect(friendlyAuthError("rate limit exceeded")).toMatch(/too many attempts/i);
  });

  it("matching is case-insensitive", () => {
    expect(friendlyAuthError("ACCESS_DENIED")).toBe("Sign-in was cancelled.");
  });
});

describe("friendlyVerifyError", () => {
  it("never echoes attacker-controlled input back verbatim", () => {
    const payload = "<img src=x onerror=alert(1)>";
    expect(friendlyVerifyError(payload)).not.toContain(payload);
  });

  it("distinguishes code failures from link failures", () => {
    expect(friendlyVerifyError("token expired")).toMatch(/code has expired/i);
    expect(friendlyVerifyError("invalid token")).toMatch(/code is incorrect/i);
  });

  it("falls back to a generic message for unrecognised error text", () => {
    expect(friendlyVerifyError("boom")).toBe("We couldn't verify that code. Please try again.");
  });
});
