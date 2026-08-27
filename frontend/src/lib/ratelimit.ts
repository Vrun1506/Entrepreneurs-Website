import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";

// ════════════════════════════════════════════════════════════════════
// Upstash rate limiting — app layer (precision). Cloudflare's edge is
// the flood/DDoS shield; this is per-identity abuse control.
//
// ENV-GATED: with no UPSTASH_REDIS_REST_* env, every check returns
// success=true, so local dev, CI, `next build`, and unconfigured
// deploys behave exactly as before. It only "turns on" once the two
// env vars are set.
//
// NAT: Imperial students on campus share one public IP, so an IP bucket
// is a campus bucket. Mutations are therefore keyed on the signed-in user
// wherever there is one — abuse belongs to an account, not to a building.
// Only genuinely anonymous traffic falls back to IP, and it gets its own
// far higher ceiling because that key stands for thousands of people.
// ════════════════════════════════════════════════════════════════════

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

export const rateLimitEnabled = Boolean(url && token);

const redis = rateLimitEnabled ? new Redis({ url: url!, token: token! }) : null;

export type RateBucket = "mutations" | "anonMutations" | "submit";

// Factory per bucket. slidingWindow chosen for smooth limiting; analytics
// off to keep the command count (and cost) down.
const BUCKETS: Record<RateBucket, () => Ratelimit> = {
  // Per-user backstop on all non-GET requests (server actions are POSTs).
  // 60/min is far more than one person generates by hand, and because the
  // key is an account it no longer collides with everyone else on campus.
  mutations: () =>
    new Ratelimit({ redis: redis!, limiter: Ratelimit.slidingWindow(60, "1 m"), prefix: "rl:mut", analytics: false }),
  // Anonymous non-GET traffic, keyed on IP because there is no better
  // identity. One key can stand for the whole campus — a signup wave after
  // an announcement is the case that matters — so the ceiling is a flood
  // guard, not a per-person limit. Cloudflare absorbs real floods at the
  // edge; Turnstile and Supabase's own auth limits are the precise controls
  // on the sensitive anonymous endpoints.
  anonMutations: () =>
    new Ratelimit({ redis: redis!, limiter: Ratelimit.slidingWindow(300, "1 m"), prefix: "rl:mut:anon", analytics: false }),
  // Precise per-user limit on listing/contact submissions.
  submit: () =>
    new Ratelimit({ redis: redis!, limiter: Ratelimit.slidingWindow(10, "1 h"), prefix: "rl:sub", analytics: false }),
};

const instances = new Map<RateBucket, Ratelimit>();

function instance(bucket: RateBucket): Ratelimit | null {
  if (!redis) return null;
  let inst = instances.get(bucket);
  if (!inst) {
    inst = BUCKETS[bucket]();
    instances.set(bucket, inst);
  }
  return inst;
}

// Whether to allow a request when the limiter backend (Upstash) is
// unreachable. The coarse `mutations` backstop fails OPEN — a transient
// Redis blip must not take down all traffic. The security-sensitive
// `submit` bucket fails CLOSED — an outage must not become a way to bypass
// the per-user abuse limit on submissions.
export function failOpen(bucket: RateBucket): boolean {
  return bucket !== "submit";
}

/**
 * Why this is three values and not a boolean.
 *
 * "limited" and "unavailable" are the same answer to the request and a
 * completely different answer to the person. `submit` fails CLOSED, so a
 * Redis outage — or a command quota spent, which on the free tier the
 * response cache shares (see lib/cache.ts) — refuses submissions while
 * telling the member they are posting too frequently. That message is
 * false, it blames them for an outage, and it gives whoever is on call
 * nothing to go on: the failure looks exactly like the feature working.
 *
 * Callers that fail closed should distinguish the two. Callers that fail
 * open can keep using allow() below.
 */
export type RateDecision = "allowed" | "limited" | "unavailable";

// Allows everything when rate limiting is disabled (no Upstash env) — the
// documented local/CI behaviour.
export async function check(bucket: RateBucket, identifier: string): Promise<RateDecision> {
  const inst = instance(bucket);
  if (!inst) return "allowed";
  try {
    const { success } = await inst.limit(identifier);
    return success ? "allowed" : "limited";
  } catch (e) {
    // Swallowing this was the reason a fail-closed submission looked like a
    // rate limit. It is logged here for every bucket; the callers that fail
    // closed also report it, because for them it is an outage.
    console.error(`ratelimit: the "${bucket}" bucket is unreachable`, e);
    return "unavailable";
  }
}

// Returns true when the request is allowed. On an unexpected Redis error the
// outcome is bucket-dependent — see failOpen().
export async function allow(bucket: RateBucket, identifier: string): Promise<boolean> {
  const decision = await check(bucket, identifier);
  return decision === "unavailable" ? failOpen(bucket) : decision === "allowed";
}

// Best-effort client IP from proxy headers (Vercel/Cloudflare set these).
// Prefer cf-connecting-ip: behind Cloudflare it's the true client IP, set
// (and overwritten) by Cloudflare on every request, so — unlike the leftmost
// x-forwarded-for hop, which the client controls — it can't be spoofed to
// evade the per-IP bucket. XFF/x-real-ip remain as fallbacks for paths that
// don't pass through Cloudflare (CI, direct origin hits).
export function clientIp(headers: Headers): string {
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "unknown";
}
