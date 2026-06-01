// Verify the Upstash `mutations` edge backstop (§4).
//
// The proxy middleware (src/lib/supabase/proxy.ts) rate-limits non-GET
// requests at 60/min/IP and returns HTTP 429 once the bucket is exhausted.
// This check runs in middleware BEFORE routing/auth, so a bare `POST /`
// trips it — no login, cookie, or CSRF token needed. Allowed POSTs fall
// through to a page route and come back 405 (Method Not Allowed), which is
// expected and fine; we only care that a 429 appears past the limit.
//
// Usage:
//   node scripts/verify-ratelimit.mjs https://your-deployment.vercel.app
//
// Exit 0 if a 429 was observed, 1 otherwise.

const base = process.argv[2]?.replace(/\/$/, "");
if (!base) {
  console.error("Usage: node scripts/verify-ratelimit.mjs <base-url>");
  process.exit(2);
}

const TOTAL = 75; // > 60 so the sliding window must trip within one minute
const CONCURRENCY = 15; // burst fast enough to land inside the 60s window

const statuses = [];
let firstBlockedAt = null;
let sent = 0;

async function fireOne(n) {
  try {
    const res = await fetch(`${base}/`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "text/plain" },
      body: "rl-probe",
    });
    statuses.push(res.status);
    if (res.status === 429 && firstBlockedAt === null) firstBlockedAt = n;
  } catch (e) {
    statuses.push(`ERR:${e.code ?? e.message}`);
  }
}

console.log(`Firing ${TOTAL} POST ${base}/ (concurrency ${CONCURRENCY})...`);
const queue = Array.from({ length: TOTAL }, (_, i) => i + 1);
while (queue.length) {
  const batch = queue.splice(0, CONCURRENCY).map((n) => fireOne(n));
  await Promise.all(batch);
  sent += batch.length;
}

const counts = statuses.reduce((acc, s) => ((acc[s] = (acc[s] ?? 0) + 1), acc), {});
console.log(`\nStatus distribution over ${sent} requests:`);
for (const [s, c] of Object.entries(counts).sort()) console.log(`  ${s}: ${c}`);

const blocked = counts["429"] ?? 0;
if (blocked > 0) {
  console.log(`\n✅ PASS — ${blocked} request(s) returned 429 (first blocked ~#${firstBlockedAt}).`);
  console.log("   Upstash `mutations` backstop is live and tripping.");
  process.exit(0);
} else {
  console.log("\n❌ FAIL — no 429 observed. Either the env vars aren't set on this");
  console.log("   deployment (rate limiting is a no-op), the deploy predates them,");
  console.log("   or the burst didn't cross 60 within the window. Redeploy after");
  console.log("   setting UPSTASH_REDIS_REST_URL/_TOKEN, then re-run.");
  process.exit(1);
}
