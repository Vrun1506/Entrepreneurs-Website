import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// The cache module reads its env at import time, so each case re-imports
// with a fresh module registry.
const ENV = { UPSTASH_REDIS_REST_URL: "https://example.upstash.io", UPSTASH_REDIS_REST_TOKEN: "t" };

const store = new Map<string, unknown>();
const redis = {
  get: vi.fn(async (k: string) => (store.has(k) ? store.get(k) : null)),
  set: vi.fn(async (k: string, v: unknown) => { store.set(k, v); return "OK"; }),
  del: vi.fn(async (...ks: string[]) => { ks.forEach((k) => store.delete(k)); return ks.length; }),
};

// A class, not vi.fn(() => redis): the module is constructed with `new`,
// and an arrow function is not a constructor.
vi.mock("@upstash/redis", () => ({ Redis: class { constructor() { return redis; } } }));
vi.mock("server-only", () => ({}));

async function load(env: Record<string, string | undefined> = ENV) {
  vi.resetModules();
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return import("./cache");
}

beforeEach(() => { store.clear(); vi.clearAllMocks(); });
afterEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL;
  delete process.env.UPSTASH_REDIS_REST_TOKEN;
  delete process.env.UPSTASH_CACHE_REDIS_REST_URL;
  delete process.env.UPSTASH_CACHE_REDIS_REST_TOKEN;
});

describe("cached()", () => {
  it("runs the loader on a miss and serves the stored value on a hit", async () => {
    const { cached } = await load();
    const loader = vi.fn(async () => [{ id: "1" }]);

    expect(await cached("vcs", loader)).toEqual([{ id: "1" }]);
    expect(await cached("vcs", loader)).toEqual([{ id: "1" }]);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("does not store an empty result — that is usually a failed query", async () => {
    const { cached } = await load();
    const loader = vi.fn(async () => [] as unknown[]);

    await cached("vcs", loader, { isCacheable: (v) => v.length > 0 });
    await cached("vcs", loader, { isCacheable: (v) => v.length > 0 });
    expect(loader).toHaveBeenCalledTimes(2);
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("skip bypasses both the read and the write, so an admin can't populate a shared key", async () => {
    const { cached } = await load();
    await cached("directory", async () => "admin-view", { skip: true });
    expect(redis.get).not.toHaveBeenCalled();
    expect(redis.set).not.toHaveBeenCalled();
  });

  it("falls back to the loader when Redis read fails", async () => {
    const { cached } = await load();
    redis.get.mockRejectedValueOnce(new Error("upstash down"));
    expect(await cached("vcs", async () => "live")).toBe("live");
  });

  it("still returns the value when the Redis write fails", async () => {
    const { cached } = await load();
    redis.set.mockRejectedValueOnce(new Error("upstash down"));
    expect(await cached("vcs", async () => "live")).toBe("live");
  });

  it("is a pass-through when no Upstash env is configured", async () => {
    const { cached, cacheEnabled } = await load({
      UPSTASH_REDIS_REST_URL: undefined, UPSTASH_REDIS_REST_TOKEN: undefined,
    });
    expect(cacheEnabled).toBe(false);
    expect(await cached("vcs", async () => "live")).toBe("live");
    expect(redis.get).not.toHaveBeenCalled();
  });
});

describe("invalidate()", () => {
  it("drops the key so the next read re-runs the loader", async () => {
    const { cached, invalidate } = await load();
    const loader = vi.fn(async () => "v1");

    await cached("vcs", loader);
    await invalidate("vcs");
    await cached("vcs", loader);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("only drops the keys it is given", async () => {
    const { cached, invalidate } = await load();
    const dir = vi.fn(async () => "dir");
    const vcs = vi.fn(async () => "vcs");

    await cached("directory", dir);
    await cached("vcs", vcs);
    await invalidate("vcs");
    await cached("directory", dir);
    await cached("vcs", vcs);

    expect(dir).toHaveBeenCalledTimes(1);
    expect(vcs).toHaveBeenCalledTimes(2);
  });

  it("does not throw when Redis is unreachable — the write has already committed", async () => {
    const { invalidate } = await load();
    redis.del.mockRejectedValueOnce(new Error("upstash down"));
    await expect(invalidate("vcs")).resolves.toBeUndefined();
  });
});

describe("configuration", () => {
  it("reports when the cache is sharing the rate limiter's database", async () => {
    const shared = await load();
    expect(shared.cacheSharesRateLimitDb).toBe(true);

    const split = await load({
      ...ENV,
      UPSTASH_CACHE_REDIS_REST_URL: "https://cache.upstash.io",
      UPSTASH_CACHE_REDIS_REST_TOKEN: "t2",
    });
    expect(split.cacheSharesRateLimitDb).toBe(false);
  });
});
