import { Ratelimit } from "@upstash/ratelimit";
import { Redis } from "@upstash/redis";
import { isCloudflareIp } from "@/lib/cloudflareIps";

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

export type RateBucket =
  | "mutations"
  | "anonMutations"
  | "submit"
  | "communityPost"
  | "communityUpload"
  | "postReport"
  | "avatarUpload"
  | "cvUpload"
  | "otpVerify";

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
  // Community posts. Its own bucket rather than sharing `submit`, because
  // posting to the feed should not consume the quota for posting a job.
  //
  // 10/day, and deliberately not also a tighter burst limit. One a day was
  // considered and rejected: it throttles hardest exactly the members
  // keeping a new feed alive, while the abuse case is a script, which
  // 10/day stops dead either way. A separate per-hour bucket was also
  // rejected — the `mutations` backstop above already caps any one account
  // at 60 POSTs/minute, so a burst check would spend Upstash commands (a
  // budget shared with the response cache on the free tier) to re-enforce
  // something already enforced.
  communityPost: () =>
    new Ratelimit({ redis: redis!, limiter: Ratelimit.slidingWindow(10, "24 h"), prefix: "rl:post", analytics: false }),
  // Report-bombing — one member mass-reporting someone they dislike — is a
  // real abuse vector, and a lower ceiling than posting because a member
  // with more than a handful of genuine reports in a day is an outlier
  // worth an admin noticing.
  postReport: () =>
    new Ratelimit({ redis: redis!, limiter: Ratelimit.slidingWindow(5, "24 h"), prefix: "rl:rep", analytics: false }),
  // Uploads get their own allowance rather than drawing on `communityPost`.
  // Sharing looked tidy and was wrong: a post with two images spent three
  // tokens, so the real ceiling for anyone who posts pictures was three a
  // day rather than the ten the limit advertises — and swapping an attached
  // image for a different one burned another token without ever publishing
  // anything. 40 covers ten two-image posts with room to change your mind,
  // and the ceiling that actually matters (how much reaches the feed) is
  // still `communityPost`.
  communityUpload: () =>
    new Ratelimit({ redis: redis!, limiter: Ratelimit.slidingWindow(40, "24 h"), prefix: "rl:upl", analytics: false }),
  // Avatar and CV uploads each get their own allowance rather than sharing
  // communityUpload — posting pictures to the feed and setting a profile
  // photo are unrelated activities, and lumping them would let a member
  // who posts a lot of images burn through their own avatar quota. 10/day
  // covers re-cropping and changing your mind several times over; the
  // abuse case either bucket guards against is a script, which 10/day
  // stops just as dead as 40/day does. No new database backstop is
  // needed alongside these — issue_upload_ticket's existing cap is 60
  // *outstanding* (unconsumed) tickets, global per member, and a normal
  // member never holds more than one unconsumed avatar ticket and one CV
  // ticket at a time, so it cannot be approached by traffic through
  // these two buckets alone.
  avatarUpload: () =>
    new Ratelimit({ redis: redis!, limiter: Ratelimit.slidingWindow(10, "24 h"), prefix: "rl:ava", analytics: false }),
  cvUpload: () =>
    new Ratelimit({ redis: redis!, limiter: Ratelimit.slidingWindow(10, "24 h"), prefix: "rl:cv", analytics: false }),
  // verifyOtp (student/alum login-signup codes, email-change confirmation)
  // runs on the browser Supabase client, straight to Supabase's REST
  // endpoint — it never passes through proxy.ts's `mutations` backstop and,
  // unlike every other auth call in this app, carries no captchaToken. This
  // is the only app-level throttle standing between a guessed target email
  // and unlimited 6-digit-code guesses. Keyed on the email being verified
  // (see verifyOtpGate.ts), not the caller, and generous enough for a
  // typo-prone human: 10 tries in 10 minutes.
  otpVerify: () =>
    new Ratelimit({ redis: redis!, limiter: Ratelimit.slidingWindow(10, "10 m"), prefix: "rl:otp", analytics: false }),
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
//
// `communityPost` and `postReport` join `submit` on the fail-CLOSED side.
// They are abuse limits on an unmoderated, publish-immediately surface, so
// a Redis outage becoming an unlimited-posting window is the one outcome
// worth refusing traffic to avoid. NOTE: this is a list, not a default —
// a new bucket added without being named here silently fails OPEN.
const FAIL_CLOSED: readonly RateBucket[] = [
  "submit", "communityPost", "communityUpload", "postReport", "avatarUpload", "cvUpload", "otpVerify",
];

export function failOpen(bucket: RateBucket): boolean {
  return !FAIL_CLOSED.includes(bucket);
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
//
// cf-connecting-ip is only trusted when the request's VERIFIED connecting
// peer is actually one of Cloudflare's own published IP ranges (see
// lib/cloudflareIps.ts for why: this app's custom domain sits behind
// Cloudflare, but Vercel's own <project>.vercel.app domain is always live
// alongside it and is NOT — anyone hitting that directly could set
// cf-connecting-ip to anything, on every request, and defeat every
// IP-keyed bucket below).
//
// "Verified" means the LAST hop of x-forwarded-for, not the first. Vercel's
// edge appends the real connecting IP as the final entry on every request —
// see https://vercel.com/docs/edge-network/headers — so it can't be spoofed
// the way a client-supplied leftmost hop can. x-real-ip is the fallback for
// runtimes that don't set x-forwarded-for at all (e.g. local dev).
function verifiedPeerIp(headers: Headers): string | null {
  const xff = headers.get("x-forwarded-for");
  if (xff) {
    const hops = xff.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1]!;
  }
  return headers.get("x-real-ip");
}

export function clientIp(headers: Headers): string {
  const peer = verifiedPeerIp(headers);
  const cf = headers.get("cf-connecting-ip");
  if (cf && peer && isCloudflareIp(peer)) return cf.trim();
  return peer ?? "unknown";
}
