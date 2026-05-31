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
// NAT caveat: Imperial students on campus share one public IP, so the
// per-IP `mutations` bucket is deliberately generous — it's a coarse
// backstop only. The precise, NAT-safe control is the per-user `submit`
// bucket applied inside the submission server actions.
// ════════════════════════════════════════════════════════════════════

const url = process.env.UPSTASH_REDIS_REST_URL;
const token = process.env.UPSTASH_REDIS_REST_TOKEN;

export const rateLimitEnabled = Boolean(url && token);

const redis = rateLimitEnabled ? new Redis({ url: url!, token: token! }) : null;

export type RateBucket = "mutations" | "submit";

// Factory per bucket. slidingWindow chosen for smooth limiting; analytics
// off to keep the command count (and cost) down.
const BUCKETS: Record<RateBucket, () => Ratelimit> = {
  // Coarse per-IP backstop on all non-GET requests (server actions are
  // POSTs). Generous because of campus NAT.
  mutations: () =>
    new Ratelimit({ redis: redis!, limiter: Ratelimit.slidingWindow(60, "1 m"), prefix: "rl:mut", analytics: false }),
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

// Returns true when the request is allowed. Allows everything when rate
// limiting is disabled or on an unexpected Redis error (fail-open — a
// transient Upstash blip must not take down submissions).
export async function allow(bucket: RateBucket, identifier: string): Promise<boolean> {
  const inst = instance(bucket);
  if (!inst) return true;
  try {
    const { success } = await inst.limit(identifier);
    return success;
  } catch {
    return true;
  }
}

// Best-effort client IP from proxy headers (Vercel/Cloudflare set these).
export function clientIp(headers: Headers): string {
  const xff = headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0]!.trim();
  return headers.get("x-real-ip") ?? "unknown";
}
