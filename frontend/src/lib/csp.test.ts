import { describe, it, expect, vi, afterEach } from "vitest";
import { buildCsp, generateNonce } from "./csp";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("generateNonce", () => {
  it("produces a unique base64 string each call", () => {
    const a = generateNonce();
    const b = generateNonce();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9+/=]+$/);
    // 16 random bytes -> 24 base64 chars (incl. padding).
    expect(a.length).toBe(24);
  });
});

describe("buildCsp", () => {
  it("embeds the nonce and strict-dynamic in script-src", () => {
    const csp = buildCsp("ABC123");
    expect(csp).toContain("script-src 'self' 'nonce-ABC123' 'strict-dynamic'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).toContain("upgrade-insecure-requests");
  });

  it("derives Supabase https + wss origins from the env URL", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://abcxyz.supabase.co");
    const csp = buildCsp("n");
    expect(csp).toContain("https://abcxyz.supabase.co");
    expect(csp).toContain("wss://abcxyz.supabase.co");
  });

  it("allows the PostHog host + its sibling assets host", () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_HOST", "https://eu.i.posthog.com");
    const csp = buildCsp("n");
    expect(csp).toContain("https://eu.i.posthog.com");
    expect(csp).toContain("https://eu-assets.i.posthog.com");
  });

  it("allows the Sentry ingest origin parsed from the DSN", () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://abc123@o4509.ingest.de.sentry.io/123");
    const csp = buildCsp("n");
    expect(csp).toContain("https://o4509.ingest.de.sentry.io");
  });

  it("always allows the Turnstile host in frame-src and connect-src", () => {
    const csp = buildCsp("n");
    expect(csp).toContain("frame-src https://challenges.cloudflare.com");
    expect(csp).toMatch(/connect-src[^;]*https:\/\/challenges\.cloudflare\.com/);
  });

  it("omits unset optional origins without leaving empty tokens", () => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "");
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");
    const csp = buildCsp("n");
    // No double spaces or dangling 'null' from filtered-out origins.
    expect(csp).not.toContain("  ");
    expect(csp).not.toContain("null");
  });
});
