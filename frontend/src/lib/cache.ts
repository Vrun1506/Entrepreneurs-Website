import "server-only";
import { Redis } from "@upstash/redis";

// ════════════════════════════════════════════════════════════════════
// Foundry · Read-through cache (Upstash Redis)
//
// The app renders with `dynamic = "force-dynamic"` (the nonce CSP needs
// it), so Next's own route and data caches are off. This is the layer
// that puts something between a page render and Supabase.
//
// WHAT MAY BE CACHED HERE — read this before adding a key.
//
// Only responses that are byte-identical for every member. Several of
// this app's RPCs are deliberately caller-dependent:
// list_approved_opportunities and list_approved_events return
// contact_email only when the row is marked visible OR the caller is the
// poster OR the caller is an admin (migration 20260530000002). Caching
// one member's response and serving it to another would disclose
// posters' private contact addresses. Those lists are therefore NOT
// cached here, and anything per-user (bookmarks, listing actions,
// submissions) obviously isn't either.
//
// QUOTA COUPLING. By default this shares the rate limiter's Upstash
// database, because that is the instance the project already has. The
// two then draw on one command quota, and the `submit` rate-limit bucket
// fails CLOSED — so exhausting the quota with cache traffic would start
// refusing submissions. Setting UPSTASH_CACHE_REDIS_REST_URL/TOKEN
// points the cache at a separate database and removes that coupling;
// that is the recommended production setup.
//
// Every failure mode here degrades to "go to Supabase". A cache outage
// slows the app down; it never breaks or falsifies it.
// ════════════════════════════════════════════════════════════════════

const url =
  process.env.UPSTASH_CACHE_REDIS_REST_URL ?? process.env.UPSTASH_REDIS_REST_URL;
const token =
  process.env.UPSTASH_CACHE_REDIS_REST_TOKEN ?? process.env.UPSTASH_REDIS_REST_TOKEN;

export const cacheEnabled = Boolean(url && token);

/** True when the cache is sharing the rate limiter's database. */
export const cacheSharesRateLimitDb =
  cacheEnabled && !process.env.UPSTASH_CACHE_REDIS_REST_URL;

const redis = cacheEnabled ? new Redis({ url: url!, token: token! }) : null;

/**
 * Bump to invalidate every key at once. Cheaper and more reliable than
 * hunting down stale keys after a shape change: a mapper edit that
 * changes the cached JSON only needs this number incremented.
 */
const VERSION = 1;

export type CacheKey = "directory" | "vcs" | "lookups";

const key = (k: CacheKey) => `cache:v${VERSION}:${k}`;

/**
 * TTLs are the safety net, not the mechanism. Writes invalidate
 * explicitly (see invalidate() and its callers); these bound how long a
 * *missed* invalidation can show stale data. Kept short for the
 * directory because profile edits are written client-side, straight to
 * the RPC, with no server action able to bust the key.
 */
const TTL_SECONDS: Record<CacheKey, number> = {
  directory: 60,
  vcs: 300,
  lookups: 3600,
};

/**
 * Read-through. Returns the cached value if present, otherwise runs the
 * loader, stores the result and returns it.
 *
 * The loader's result is stored only if it looks like real data — an
 * empty array is far more often a transient Supabase error (the loaders
 * log and fall back to []) than a genuinely empty table, and caching
 * that would pin an empty page in front of every member for the TTL.
 */
export async function cached<T>(
  name: CacheKey,
  loader: () => Promise<T>,
  opts: {
    /**
     * Bypass the cache entirely for this call — neither read nor write.
     * Used for admin requests: RLS can show an admin rows a member can't,
     * so an admin must never be the one who populates a shared key. The
     * current queries all filter by status explicitly and so return the
     * same rows either way, but that is a property of today's queries and
     * not something a future edit should have to remember.
     */
    skip?: boolean;
    isCacheable?: (value: T) => boolean;
  } = {},
): Promise<T> {
  const isCacheable = opts.isCacheable ?? (() => true);
  if (!redis || opts.skip) return loader();

  try {
    const hit = await redis.get<T>(key(name));
    if (hit !== null && hit !== undefined) return hit;
  } catch (e) {
    // A read failure is not a reason to fail the page.
    console.warn(`cache: read failed for ${name}`, e);
  }

  const value = await loader();

  if (isCacheable(value)) {
    try {
      await redis.set(key(name), value, { ex: TTL_SECONDS[name] });
    } catch (e) {
      console.warn(`cache: write failed for ${name}`, e);
    }
  }
  return value;
}

/**
 * Drop cached entries. Called from the write paths — see
 * lib/listings/admin.ts and lib/listings/user.ts — so an approval or an
 * edit is visible immediately rather than at the end of a TTL.
 */
export async function invalidate(...names: CacheKey[]): Promise<void> {
  if (!redis || names.length === 0) return;
  try {
    await redis.del(...names.map(key));
  } catch (e) {
    // Worst case the TTL expires it. Log rather than fail the write —
    // the user's action has already committed at this point.
    console.warn(`cache: invalidation failed for ${names.join(", ")}`, e);
  }
}
