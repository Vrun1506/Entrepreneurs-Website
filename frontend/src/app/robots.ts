import type { MetadataRoute } from "next";

const SITE_URL = "https://www.imperialentrepreneurs.com";

// NOTE: Cloudflare currently serves a managed /robots.txt (AI content-signals
// boilerplate) which will SHADOW this app route at the edge. To make this the
// live robots.txt, disable Cloudflare's managed robots.txt (or add a rule that
// lets /robots.txt hit the origin). Until then this is the origin's fallback.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        // Auth-gated and machine routes — no SEO value, keep them out of the index.
        disallow: ["/api/", "/admin", "/home", "/members", "/community", "/onboarding", "/pending", "/rejected", "/reset-password", "/settings", "/my-submissions", "/my-bookmarks", "/my-activity", "/profile"],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
