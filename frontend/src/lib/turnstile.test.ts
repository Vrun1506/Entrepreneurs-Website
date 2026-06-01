import { afterEach, describe, it, expect, vi } from "vitest";

// turnstile.ts reads TURNSTILE_SECRET_KEY at module load, so each case stubs
// the env then re-imports the module fresh.
async function load() {
  vi.resetModules();
  return import("./turnstile");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("verifyTurnstile", () => {
  it("skips the check (returns true) when no secret is configured", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "");
    const { verifyTurnstile } = await load();
    expect(await verifyTurnstile("anything")).toBe(true);
    expect(await verifyTurnstile(null)).toBe(true);
  });

  it("fails when configured but the token is missing", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    const { verifyTurnstile } = await load();
    expect(await verifyTurnstile(null)).toBe(false);
    expect(await verifyTurnstile(undefined)).toBe(false);
  });

  it("passes when siteverify returns success", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ success: true })));
    vi.stubGlobal("fetch", fetchMock);
    const { verifyTurnstile } = await load();
    expect(await verifyTurnstile("tok")).toBe(true);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("fails when siteverify returns success:false", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ success: false }))));
    const { verifyTurnstile } = await load();
    expect(await verifyTurnstile("tok")).toBe(false);
  });

  it("fails closed when the siteverify fetch throws", async () => {
    vi.stubEnv("TURNSTILE_SECRET_KEY", "secret");
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("network down"); }));
    const { verifyTurnstile } = await load();
    expect(await verifyTurnstile("tok")).toBe(false);
  });
});
