// Post-deploy production smoke — read-only. Hits the live site and asserts
// the key routes are up and the app shell renders. NO writes, so it
// never touches real data / analytics. This is deploy-time health, not
// continuous uptime monitoring (that's an external monitor's job).
//
// Usage: PROD_BASE_URL=https://www.imperialentrepreneurs.com node scripts/prod-smoke.mjs

// Default to www: the apex 307s to www, where the CSP header and canonical
// app shell actually live. Hitting the apex would smoke-test the redirect, not
// the app.
const BASE = (process.env.PROD_BASE_URL ?? "https://www.imperialentrepreneurs.com").replace(/\/$/, "");

// [path, optional substring that must appear in the body]
//
// Public pages carry a marker, and it is deliberately a piece of content the
// page would be broken without — the controller's registered name on the legal
// pages, the first door of the login chooser — not just a word from the shared
// layout, which would still be there if the page body vanished.
const PUBLIC_CHECKS = [
  ["/", "Foundry"],
  ["/login", "Current student"],
  ["/contact", "Get in touch"],
  ["/privacy", "IC Founders"],
  ["/terms", "IC Founders"],
  ["/cookies", "Cookie Policy"],
];

// Gated pages, logged out. These are status-only on purpose: what they prove
// is that the route resolves and the server is alive, NOT that the gate works.
// Some 307 to /login; the ones with a loading.tsx answer 200 with the skeleton
// and deliver the redirect inside the RSC stream, so the status code alone
// can't tell you which happened. The gate itself is covered by the RLS suite
// and the Playwright specs, which can actually hold a session.
const GATED_CHECKS = [
  "/home",
  "/members",
  "/events",
  "/opportunities",
  "/vcs",
  "/calendar",
  "/messaging",
  "/my-activity",
  "/my-bookmarks",
  "/my-submissions",
  "/profile",
  "/settings",
  // The directory used to live at /community and people have shared filtered
  // links to it, so the alias is load-bearing.
  "/community",
];

const CHECKS = [...PUBLIC_CHECKS, ...GATED_CHECKS.map((path) => [path, null])];

// Cloudflare managed-challenges the first request from a cold datacenter IP,
// which is exactly what a CI runner is: the response is a 403 carrying
// `cf-mitigated: challenge` and never reaches Vercel at all. Subsequent
// requests from the same run sail through, so retrying is enough to tell an
// edge warm-up apart from real downtime — a host that is genuinely blocked
// keeps being challenged and still fails the run.
const CHALLENGE_RETRIES = 2;

async function fetchLive(url) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { redirect: "follow", headers: { "user-agent": "foundry-prod-smoke" } });
    if (!res.headers.get("cf-mitigated") || attempt >= CHALLENGE_RETRIES) return res;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
}

let failed = 0;

for (const [path, marker] of CHECKS) {
  const url = BASE + path;
  try {
    const res = await fetchLive(url);
    const body = await res.text();
    const statusOk = res.status >= 200 && res.status < 400;
    const markerOk = !marker || body.includes(marker);
    if (statusOk && markerOk) {
      console.log(`✓ ${res.status} ${path}${marker ? ` (found "${marker}")` : ""}`);
    } else {
      failed++;
      console.error(`✗ ${res.status} ${path}${marker && !markerOk ? ` (missing "${marker}")` : ""}`);
      // Who refused, and why. A bare status code sends you hunting through the
      // app for a fault that lives at the edge: an absent x-vercel-id means the
      // request never got past Cloudflare.
      const header = (name) => res.headers.get(name) ?? "-";
      console.error(`    server=${header("server")} cf-ray=${header("cf-ray")} cf-mitigated=${header("cf-mitigated")} x-vercel-id=${header("x-vercel-id")}`);
      console.error(`    body: ${body.replace(/\s+/g, " ").trim().slice(0, 300)}`);
    }
  } catch (err) {
    failed++;
    console.error(`✗ ERR ${path} — ${err instanceof Error ? err.message : String(err)}`);
  }
}

if (failed > 0) {
  console.error(`\nProd smoke FAILED: ${failed}/${CHECKS.length} checks failed against ${BASE}`);
  process.exit(1);
}
console.log(`\nProd smoke passed: ${CHECKS.length}/${CHECKS.length} checks OK against ${BASE}`);
