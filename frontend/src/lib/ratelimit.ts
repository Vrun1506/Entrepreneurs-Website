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

// Whether to allow a request when the limiter backend (Upstash) is
// unreachable. The coarse `mutations` backstop fails OPEN — a transient
// Redis blip must not take down all traffic. The security-sensitive
// `submit` bucket fails CLOSED — an outage must not become a way to bypass
// the per-user abuse limit on submissions.
export function failOpen(bucket: RateBucket): boolean {
  return bucket !== "submit";
}

// Returns true when the request is allowed. Allows everything when rate
// limiting is disabled (no Upstash env). On an unexpected Redis error the
// outcome is bucket-dependent — see failOpen().
export async function allow(bucket: RateBucket, identifier: string): Promise<boolean> {
  const inst = instance(bucket);
  if (!inst) return true;
  try {
    const { success } = await inst.limit(identifier);
    return success;
  } catch {
    return failOpen(bucket);
  }
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
