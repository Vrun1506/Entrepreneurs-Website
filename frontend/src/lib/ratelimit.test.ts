import { describe, it, expect } from "vitest";
import { allow, clientIp, failOpen } from "./ratelimit";

describe("clientIp", () => {
  it("prefers cf-connecting-ip over x-forwarded-for (spoof-resistant behind Cloudflare)", () => {
    const h = new Headers({ "cf-connecting-ip": "4.4.4.4", "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(clientIp(h)).toBe("4.4.4.4");
  });

  it("takes the first hop from x-forwarded-for", () => {
    const h = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(clientIp(h)).toBe("1.2.3.4");
  });

  it("trims whitespace around the first hop", () => {
    const h = new Headers({ "x-forwarded-for": "  9.9.9.9 , 1.1.1.1" });
    expect(clientIp(h)).toBe("9.9.9.9");
  });

  it("falls back to x-real-ip", () => {
    const h = new Headers({ "x-real-ip": "8.8.8.8" });
    expect(clientIp(h)).toBe("8.8.8.8");
  });

  it("returns 'unknown' when no proxy headers are present", () => {
    expect(clientIp(new Headers())).toBe("unknown");
  });
});

describe("allow", () => {
  it("allows everything when rate limiting is disabled (no Upstash env)", async () => {
    // The test env has no UPSTASH_REDIS_REST_* vars, so the limiter is off and
    // allow() must fail open (the documented behaviour).
    expect(await allow("submit", "user-1")).toBe(true);
    expect(await allow("mutations", "1.2.3.4")).toBe(true);
  });
});

describe("failOpen (behaviour when the limiter backend is unreachable)", () => {
  it("fails OPEN for the coarse mutations backstop (availability)", () => {
    expect(failOpen("mutations")).toBe(true);
  });

  it("fails CLOSED for the security-sensitive submit bucket", () => {
    expect(failOpen("submit")).toBe(false);
  });
});
