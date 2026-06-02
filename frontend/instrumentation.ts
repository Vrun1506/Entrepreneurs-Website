import * as Sentry from "@sentry/nextjs";

// Next.js instrumentation hook. Loads the right Sentry config per runtime.
// Both configs are inert unless NEXT_PUBLIC_SENTRY_DSN is set.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
    assertProductionAbuseControls();
  }
  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Rate limiting (Upstash) and bot protection (Turnstile) fail OPEN when their
// env vars are absent — deliberate, so local dev / CI / `next build` run
// unprotected without ceremony. The risk that buys is a *production* deploy
// silently shipping with a protection layer disabled because a var was dropped
// or mistyped. This makes that loud at boot instead of silent.
//
// Non-fatal on purpose: an abuse-control gap must never pass unnoticed, but it
// also shouldn't take the whole site down (availability shouldn't hinge on a
// rate-limiter being reachable). If you'd rather fail closed, throw here.
function assertProductionAbuseControls() {
  if (process.env.NODE_ENV !== "production") return;

  const missing: string[] = [];
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) {
    missing.push("rate limiting (UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN)");
  }
  if (!process.env.TURNSTILE_SECRET_KEY) {
    missing.push("bot protection (TURNSTILE_SECRET_KEY)");
  }
  if (missing.length === 0) return;

  const message =
    `[startup] Production abuse controls are FAIL-OPEN — disabled: ${missing.join("; ")}. ` +
    `These layers are no-ops until their env vars are set in Vercel.`;
  console.error(message);
  // Surfaces in Sentry if a DSN is configured; no-op otherwise.
  Sentry.captureMessage(message, "error");
}

export { captureRequestError as onRequestError } from "@sentry/nextjs";
