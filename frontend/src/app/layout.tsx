import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { DM_Serif_Display, DM_Sans } from "next/font/google";
import "./globals.css";
import { PostHogProvider } from "@/components/analytics/PostHogProvider";

// Canonical host: the apex 307-redirects to www, so www is the indexable origin.
const SITE_URL = "https://www.imperialentrepreneurs.com";
const SITE_NAME = "Imperial Entrepreneurs";

const dmSerifDisplay = DM_Serif_Display({
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-dm-serif-display",
  display: "swap",
});

const dmSans = DM_Sans({
  weight: ["300", "400", "500", "600"],
  style: ["normal", "italic"],
  subsets: ["latin"],
  variable: "--font-dm-sans",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "Imperial Entrepreneurs — Foundry | Imperial College Startup Community",
    // Child pages set their own title; this appends the brand for the SERP.
    template: "%s | Imperial Entrepreneurs",
  },
  description:
    "Imperial Entrepreneurs is the founder community at Imperial College London — connect with student founders, alumni, mentors, and investors through Foundry.",
  applicationName: SITE_NAME,
  keywords: ["Imperial Entrepreneurs", "Imperial College", "Foundry", "student founders", "startup community", "Imperial startups"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    siteName: SITE_NAME,
    title: "Imperial Entrepreneurs — Foundry",
    description:
      "The founder community at Imperial College London. Connect with student founders, alumni, mentors, and investors through Foundry.",
    url: SITE_URL,
    locale: "en_GB",
    images: [{ url: "/entrepreneurs-logo.png", alt: "Imperial Entrepreneurs" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Imperial Entrepreneurs — Foundry",
    description: "The founder community at Imperial College London.",
    images: ["/entrepreneurs-logo.png"],
  },
};

// Matches --color-bg-primary so mobile browser chrome blends into the page
// instead of framing it in white.
export const viewport: Viewport = {
  themeColor: "#0c0c0b",
};

// Origins the app opens a connection to on nearly every page. Warming the
// TCP+TLS handshake here saves a round trip on the first request to each.
// Derived from the same env as the CSP (see lib/csp.ts) so they can't drift.
const PRECONNECT_ORIGINS = [
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com",
  process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ? "https://challenges.cloudflare.com" : undefined,
]
  .map((value) => {
    if (!value) return null;
    try {
      return new URL(value).origin;
    } catch {
      return null;
    }
  })
  .filter((origin): origin is string => origin !== null);

// Organization + WebSite structured data. This is the primary signal that the
// site *is* the entity "Imperial Entrepreneurs" (knowledge panel / sitelinks /
// branded-search recognition). alternateName carries the "Foundry" product brand.
const structuredData = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_URL}/#organization`,
      name: SITE_NAME,
      alternateName: "Foundry",
      url: SITE_URL,
      logo: `${SITE_URL}/entrepreneurs-logo.png`,
      description:
        "The founder community at Imperial College London, connecting student founders, alumni, mentors, and investors through Foundry.",
      sameAs: [
        "https://www.linkedin.com/company/imperial-entrepreneurs/",
        "https://www.instagram.com/imperialentrepreneurs/",
      ],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_URL}/#website`,
      name: SITE_NAME,
      alternateName: "Foundry",
      url: SITE_URL,
      publisher: { "@id": `${SITE_URL}/#organization` },
      inLanguage: "en-GB",
    },
  ],
};

// The middleware (proxy.ts) sets a per-request CSP nonce; Next.js only stamps
// that nonce onto its scripts when the page is dynamically rendered. Force it
// app-wide so the strict (nonce + strict-dynamic) CSP holds on every route.
// Cost is minimal here — only /login, /privacy, /terms were ever static.
export const dynamic = "force-dynamic";

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // The middleware (proxy.ts) mints a per-request CSP nonce and exposes it on
  // x-nonce. Carry it onto the JSON-LD tag so the strict nonce CSP never flags it.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="en" className={`${dmSerifDisplay.variable} ${dmSans.variable}`} data-scroll-behavior="smooth">
      <body suppressHydrationWarning>
        {/* React 19 hoists these into <head> — no hand-written <head> needed
            (and Next.js discourages one in a root layout). */}
        {PRECONNECT_ORIGINS.map((origin) => (
          <link key={origin} rel="preconnect" href={origin} crossOrigin="anonymous" />
        ))}
        <script
          type="application/ld+json"
          nonce={nonce}
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
