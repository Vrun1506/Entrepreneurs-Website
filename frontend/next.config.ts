import type { NextConfig } from "next";

const securityHeaders = [
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  {
    key: "X-Frame-Options",
    value: "DENY",
  },
  {
    key: "X-Content-Type-Options",
    value: "nosniff",
  },
  {
    key: "Referrer-Policy",
    value: "strict-origin-when-cross-origin",
  },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  },
  {
    key: "X-DNS-Prefetch-Control",
    value: "on",
  },
];

// Every authenticated route segment. `no-store` here is what actually
// answers the "does bfcache show a stale member-only page after logout"
// question — the middleware's own session re-check only runs on a real
// network request, and bfcache restores without one. Scoped to these
// segments rather than site-wide so the public marketing pages keep normal
// caching behaviour.
const AUTHENTICATED_SEGMENTS = [
  "home", "profile", "settings", "admin", "calendar", "community", "intake",
  "onboarding", "members", "opportunities", "events", "vcs", "messaging",
  "my-activity", "my-bookmarks", "my-submissions", "pending", "rejected",
];

const nextConfig: NextConfig = {
  reactCompiler: true,
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders,
      },
      ...AUTHENTICATED_SEGMENTS.map((segment) => ({
        source: `/${segment}/:path*`,
        headers: [{ key: "Cache-Control", value: "no-store" }],
      })),
      ...AUTHENTICATED_SEGMENTS.map((segment) => ({
        source: `/${segment}`,
        headers: [{ key: "Cache-Control", value: "no-store" }],
      })),
    ];
  },
};

export default nextConfig;
