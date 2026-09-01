import { describe, it, expect, vi, afterEach } from "vitest";
import { allow, check, clientIp, failOpen } from "./ratelimit";

describe("clientIp", () => {
  // 173.245.48.1 is inside Cloudflare's published 173.245.48.0/20 — see
  // lib/cloudflareIps.ts. Vercel appends the real connecting peer as the
  // LAST x-forwarded-for hop, so this is what "genuinely came through
  // Cloudflare" looks like on the wire.
  it("trusts cf-connecting-ip when the verified peer is a real Cloudflare IP", () => {
    const h = new Headers({
      "cf-connecting-ip": "4.4.4.4",
      "x-forwarded-for": "1.2.3.4, 173.245.48.1",
    });
    expect(clientIp(h)).toBe("4.4.4.4");
  });

  // The exact bypass this closes: Vercel's own <project>.vercel.app domain
  // is never behind Cloudflare, so a request hitting it directly can set
  // cf-connecting-ip to anything. The verified peer there is Vercel's own
  // edge, not a Cloudflare IP — so the header must be ignored.
  it("ignores cf-connecting-ip when the verified peer is not a Cloudflare IP", () => {
    const h = new Headers({
      "cf-connecting-ip": "4.4.4.4",
      "x-forwarded-for": "1.2.3.4, 76.76.21.21",
    });
    expect(clientIp(h)).toBe("76.76.21.21");
  });

  it("uses the LAST hop of x-forwarded-for as the verified peer, not the first", () => {
    const h = new Headers({ "x-forwarded-for": "1.2.3.4, 5.6.7.8" });
    expect(clientIp(h)).toBe("5.6.7.8");
  });

  it("trims whitespace around hops", () => {
    const h = new Headers({ "x-forwarded-for": "  9.9.9.9 , 1.1.1.1  " });
    expect(clientIp(h)).toBe("1.1.1.1");
  });

  it("falls back to x-real-ip when there's no x-forwarded-for", () => {
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

describe("check", () => {
  it("reports 'allowed' when rate limiting is disabled (no Upstash env)", async () => {
    expect(await check("submit", "user-1")).toBe("allowed");
    expect(await check("mutations", "u:user-1")).toBe("allowed");
  });
});

// The distinction the three-valued decision exists for: an unreachable
// limiter and a member who really is posting too fast produce the same
// refusal on a fail-closed bucket, and must not produce the same message.
// Nothing else in the suite can reach this path, because the test env has no
// Upstash to fail — so it is built here.
describe("check when the limiter backend throws", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.doUnmock("@upstash/ratelimit");
    vi.doUnmock("@upstash/redis");
    vi.resetModules();
    vi.restoreAllMocks();
  });

  async function loadWithBrokenRedis() {
    vi.resetModules();
    vi.stubEnv("UPSTASH_REDIS_REST_URL", "https://example.upstash.io");
    vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "test-token");
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.doMock("@upstash/redis", () => ({ Redis: class {} }));
    vi.doMock("@upstash/ratelimit", () => ({
      Ratelimit: class {
        static slidingWindow = () => ({});
        limit() {
          return Promise.reject(new Error("ECONNREFUSED"));
        }
      },
    }));
    return import("./ratelimit");
  }

  it("says 'unavailable' rather than 'limited'", async () => {
    const rl = await loadWithBrokenRedis();
    expect(await rl.check("submit", "user-1")).toBe("unavailable");
    expect(await rl.check("mutations", "u:user-1")).toBe("unavailable");
  });

  it("still fails closed on submit and open on the mutation buckets", async () => {
    const rl = await loadWithBrokenRedis();
    expect(await rl.allow("submit", "user-1")).toBe(false);
    expect(await rl.allow("mutations", "u:user-1")).toBe(true);
    expect(await rl.allow("anonMutations", "ip:1.2.3.4")).toBe(true);
  });

  it("logs the outage — a swallowed error is how this went unnoticed", async () => {
    const rl = await loadWithBrokenRedis();
    await rl.check("submit", "user-1");
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('"submit" bucket is unreachable'),
      expect.any(Error),
    );
  });
});
