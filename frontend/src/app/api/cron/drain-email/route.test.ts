import { afterEach, describe, it, expect, vi } from "vitest";
import type { NextRequest } from "next/server";

// The drain route's request-auth surface is the security boundary for the
// service-role email queue. These assert the guard before any DB/Resend work
// (none of these cases reach createServiceClient).
async function load() {
  vi.resetModules();
  return import("./route");
}

function req(auth?: string): NextRequest {
  const headers: Record<string, string> = auth ? { authorization: auth } : {};
  return new Request("http://localhost/api/cron/drain-email", { headers }) as unknown as NextRequest;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("drain-email auth surface", () => {
  it("500s when CRON_SECRET is not configured", async () => {
    vi.stubEnv("CRON_SECRET", "");
    const { POST } = await load();
    const res = await POST(req("Bearer anything"));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/CRON_SECRET/);
  });

  it("403s on a wrong bearer token", async () => {
    vi.stubEnv("CRON_SECRET", "topsecret");
    const { POST } = await load();
    const res = await POST(req("Bearer wrong"));
    expect(res.status).toBe(403);
    expect((await res.json()).error).toBe("Forbidden");
  });

  it("403s when the Authorization header is absent", async () => {
    vi.stubEnv("CRON_SECRET", "topsecret");
    const { GET } = await load();
    const res = await GET(req());
    expect(res.status).toBe(403);
  });

  it("500s when authed but RESEND_API_KEY is missing (never touches the DB)", async () => {
    vi.stubEnv("CRON_SECRET", "topsecret");
    vi.stubEnv("RESEND_API_KEY", "");
    const { POST } = await load();
    const res = await POST(req("Bearer topsecret"));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/RESEND_API_KEY/);
  });
});
