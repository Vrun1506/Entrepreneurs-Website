import { defineConfig, devices } from "@playwright/test";

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
  use: {
    baseURL: BASE_URL,
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "public", use: { ...devices["Desktop Chrome"] } },
  ],
  webServer: {
    command: "pnpm start",
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});
