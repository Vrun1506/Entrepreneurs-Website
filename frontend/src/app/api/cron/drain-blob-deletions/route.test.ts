import { afterEach, describe, it, expect, vi } from "vitest";
import type { NextRequest } from "next/server";

// This route is the last hop of a compliance path: rows reaching it are the
// image bytes of posts a member has been told are deleted. Two things are
// worth pinning — the auth surface, and the 404-as-success rule, which is
// the difference between a queue that drains and one that wedges with the
// bytes already gone.
async function load() {
  vi.resetModules();
  return import("./route");
}

function req(auth?: string): NextRequest {
  const headers: Record<string, string> = auth ? { authorization: auth } : {};
  return new Request("http://localhost/api/cron/drain-blob-deletions", {
    headers,
  }) as unknown as NextRequest;
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("drain-blob-deletions auth surface", () => {
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
  });

  it("403s when the Authorization header is absent", async () => {
    vi.stubEnv("CRON_SECRET", "topsecret");
    const { GET } = await load();
    expect((await GET(req())).status).toBe(403);
  });

  it.each([
    ["UPLOAD_GATEWAY_URL", { UPLOAD_GATEWAY_URL: "", GATEWAY_SERVICE_TOKEN: "t" }],
    ["GATEWAY_SERVICE_TOKEN", { UPLOAD_GATEWAY_URL: "https://g.test", GATEWAY_SERVICE_TOKEN: "" }],
  ])("500s when authed but %s is missing, without touching the DB", async (name, env) => {
    vi.stubEnv("CRON_SECRET", "topsecret");
    for (const [k, v] of Object.entries(env)) vi.stubEnv(k, v);
    const { POST } = await load();
    const res = await POST(req("Bearer topsecret"));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(new RegExp(name));
  });
});

describe("drain-blob-deletions delete semantics", () => {
  /** Stubs the service client so the route runs against a single queued row. */
  function stubQueue(rows: unknown[]) {
    const updates: Record<string, unknown>[] = [];
    vi.doMock("@/lib/supabase/service", () => ({
      createServiceClient: () => ({
        rpc: async () => ({ data: rows, error: null }),
        from: () => ({
          update: (patch: Record<string, unknown>) => {
            updates.push(patch);
            return { eq: async () => ({ error: null }) };
          },
        }),
      }),
    }));
    return updates;
  }

  const ROW = { id: "row-1", blob_key: "k.webp", attempts: 0, max_attempts: 6 };

  it("treats a 404 from the gateway as a successful deletion", async () => {
    // A key can legitimately be absent: a retried batch, a key the account
    // lifecycle rule collected first, or an upload that never completed.
    // Counting that as a failure would retry the row to its dead-letter
    // state while the bytes are in fact destroyed — a queue that looks
    // broken precisely when it has done its job.
    vi.stubEnv("CRON_SECRET", "topsecret");
    vi.stubEnv("UPLOAD_GATEWAY_URL", "https://gateway.test");
    vi.stubEnv("GATEWAY_SERVICE_TOKEN", "svc");
    const updates = stubQueue([ROW]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("", { status: 404 })));

    const { POST } = await load();
    const res = await POST(req("Bearer topsecret"));

    expect(await res.json()).toMatchObject({ drained: 1, succeeded: 1 });
    expect(updates[0]).toHaveProperty("deleted_at");
  });

  it("retries a 5xx with backoff rather than burying the row", async () => {
    vi.stubEnv("CRON_SECRET", "topsecret");
    vi.stubEnv("UPLOAD_GATEWAY_URL", "https://gateway.test");
    vi.stubEnv("GATEWAY_SERVICE_TOKEN", "svc");
    const updates = stubQueue([ROW]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("boom", { status: 503 })));

    const { POST } = await load();
    const res = await POST(req("Bearer topsecret"));

    expect(await res.json()).toMatchObject({ drained: 1, succeeded: 0, transient_failed: 1 });
    expect(updates[0]).toMatchObject({ attempts: 1 });
    expect(updates[0]).not.toHaveProperty("deleted_at");
  });

  it("buries a 4xx that is not 404, so it can be found later", async () => {
    // A key we could not destroy is exactly what someone should be able to
    // find, because it means bytes survive that a member was told were gone.
    vi.stubEnv("CRON_SECRET", "topsecret");
    vi.stubEnv("UPLOAD_GATEWAY_URL", "https://gateway.test");
    vi.stubEnv("GATEWAY_SERVICE_TOKEN", "svc");
    const updates = stubQueue([ROW]);
    vi.stubGlobal("fetch", vi.fn(async () => new Response("nope", { status: 400 })));

    const { POST } = await load();
    const res = await POST(req("Bearer topsecret"));

    expect(await res.json()).toMatchObject({ permanent_failed: 1 });
    expect(updates[0]).toMatchObject({ attempts: ROW.max_attempts });
  });

  it("does nothing and reports zero when the queue is empty", async () => {
    vi.stubEnv("CRON_SECRET", "topsecret");
    vi.stubEnv("UPLOAD_GATEWAY_URL", "https://gateway.test");
    vi.stubEnv("GATEWAY_SERVICE_TOKEN", "svc");
    stubQueue([]);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const { POST } = await load();
    const res = await POST(req("Bearer topsecret"));

    expect(await res.json()).toMatchObject({ drained: 0 });
    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
