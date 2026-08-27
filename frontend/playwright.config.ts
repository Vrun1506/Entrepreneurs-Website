import { defineConfig, devices } from "@playwright/test";
import { storageStatePath } from "./e2e/fixtures";

// ════════════════════════════════════════════════════════════════════
// Foundry · E2E (Playwright)
//
// Runs against a production `next start` build pointed at an EPHEMERAL
// Supabase that CI spins up (`supabase start`) and destroys after the run
// — so the full write workflow exercises real migrations/RLS/RPCs with
// zero prod contact and guaranteed cleanup. Locally it reuses an already-
// running dev/preview server if one is up.
//
// Env it expects at runtime (CI exports these from `supabase status`):
//   NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY,
//   SUPABASE_SERVICE_ROLE_KEY (server actions + the seed in global-setup).
// ════════════════════════════════════════════════════════════════════

const PORT = Number(process.env.E2E_PORT ?? 3000);
const BASE_URL = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: "./e2e",
  // Listing flows are stateful (submit -> approve -> appears), so keep the
  // suite serial and single-worker for deterministic ordering.
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  // Seeds the ephemeral DB + writes per-role storageState before any spec.
  globalSetup: "./e2e/global-setup.ts",
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    // Logged-out surface + access control + auth entry flows.
    { name: "public", testMatch: /(public|auth)\.spec\.ts/, use: { ...devices["Desktop Chrome"] } },
    // Approved student session (from global-setup).
    {
      name: "member",
      testMatch: /member\.spec\.ts|workflow\.spec\.ts|dialog\.spec\.ts|a11y\.spec\.ts|validation\.spec\.ts|urlfilters\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: storageStatePath("student") },
    },
    // Admin session.
    {
      name: "admin",
      testMatch: /admin\.spec\.ts/,
      use: { ...devices["Desktop Chrome"], storageState: storageStatePath("admin") },
    },
    // Credential pipelines: email change, password change, password reset.
    // No storageState — these sign in and out as throwaway accounts they
    // create themselves, because what they assert on is whether a credential
    // moved, and that question cannot be asked from inside a session handed
    // to the test by global-setup.
    {
      name: "pipelines",
      testMatch: /pipelines\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
    // Live rate-limit enforcement. Deliberately NOT run by the main e2e job
    // (which scopes to public/member/admin) — it only runs in the isolated
    // `e2e-ratelimit` CI job that wires Upstash via an SRH sidecar, so the
    // process-wide limiter can't make the rest of the suite flaky.
    {
      name: "ratelimit",
      testMatch: /ratelimit\.spec\.ts/,
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "pnpm start",
    url: BASE_URL,
    // Never reuse. `reuseExistingServer: !CI` looks like a local convenience
    // and is a trap: a server already on this port was built against whatever
    // env it was built with, and Playwright cannot tell. That happened —
    // a stale `next-server` pointed at PRODUCTION Supabase was silently reused
    // while global-setup seeded the local stack, so every authed test failed
    // on a JWT the prod project could not verify. 35 failures, none of them
    // real, and 14 minutes to find out.
    //
    // With this false, an occupied port is an immediate, obvious error instead
    // of a suite that runs against the wrong database. Stop your dev server
    // first, or set E2E_PORT.
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
