// Post-deploy production smoke — read-only. Hits the live site and asserts
// the key public routes are up and the app shell renders. NO writes, so it
// never touches real data / analytics. This is deploy-time health, not
// continuous uptime monitoring (that's an external monitor's job).
//
// Usage: PROD_BASE_URL=https://www.imperialentrepreneurs.com node scripts/prod-smoke.mjs

// Default to www: the apex 307s to www, where the CSP header and canonical
// app shell actually live. Hitting the apex would smoke-test the redirect, not
// the app.
const BASE = (process.env.PROD_BASE_URL ?? "https://www.imperialentrepreneurs.com").replace(/\/$/, "");

// [path, optional substring that must appear in the body]
const CHECKS = [
  ["/", "Foundry"],
  ["/login", null],
  ["/contact", null],
  ["/privacy", null],
  ["/terms", null],
  // Gated route: logged-out it should still respond (redirect to /login),
  // which proves the auth gate + server are alive, not 5xx.
  ["/members", null],
  // The directory used to live at /community and people have shared filtered
  // links to it, so the 307 alias is load-bearing. Followed here, it lands on
  // the same /login as the line above — the point is that it still resolves.
  ["/community", null],
];

let failed = 0;

for (const [path, marker] of CHECKS) {
  const url = BASE + path;
  try {
    const res = await fetch(url, { redirect: "follow", headers: { "user-agent": "foundry-prod-smoke" } });
    const body = marker ? await res.text() : "";
    const statusOk = res.status >= 200 && res.status < 400;
    const markerOk = !marker || body.includes(marker);
    if (statusOk && markerOk) {
      console.log(`✓ ${res.status} ${path}${marker ? ` (found "${marker}")` : ""}`);
    } else {
      failed++;
      console.error(`✗ ${res.status} ${path}${marker && !markerOk ? ` (missing "${marker}")` : ""}`);
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
