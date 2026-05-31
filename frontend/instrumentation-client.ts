// Sentry — browser runtime. Loaded automatically by Next.js on the client.
// Inert unless NEXT_PUBLIC_SENTRY_DSN is set. EU residency comes from the DSN.
import * as Sentry from "@sentry/nextjs";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    tracesSampleRate: 0.1,
    // No session replay / PII capture — we keep client telemetry minimal.
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
    enabled: process.env.NODE_ENV === "production",
    environment: process.env.NODE_ENV,
  });
}

// Required by Next.js so Sentry can instrument client-side navigations.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
