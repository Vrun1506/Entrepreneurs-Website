import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import { Archivo, IBM_Plex_Mono } from "next/font/google";
import "./globals.css";
import { PostHogProvider } from "@/components/analytics/PostHogProvider";

// Canonical host: the apex 307-redirects to www, so www is the indexable origin.
const SITE_URL = "https://www.imperialentrepreneurs.com";
const SITE_NAME = "Imperial Entrepreneurs";

// One grotesque for the whole app. The wordmark builds its hierarchy from
// weight and tracking inside a single family, so a second display face would
// be arguing with the logo rather than extending it. Archivo is variable, so
// every step from 400 to 700 costs the same single file.
const archivo = Archivo({
  subsets: ["latin"],
  // Archivo is variable on BOTH weight and width, and the width axis is the
  // point. The wordmark is a condensed grotesque; at the default width this
  // family is a competent neutral sans and looks like every other one. Pulling
  // `wdth` down to ~80 on display sizes is what makes a heading read as
  // belonging to that lockup rather than merely sharing a page with it.
  axes: ["wdth"],
  variable: "--font-archivo",
  display: "swap",
});

// Measured values only — dates, counts, money, IDs. Two weights is the whole
// range this needs; it never sets a heading or a paragraph.
const plexMono = IBM_Plex_Mono({
  weight: ["400", "500"],
  subsets: ["latin"],
  variable: "--font-plex-mono",
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
    // Dedicated 1200x630 export. This file is served RAW to every scraper —
    // next/image never touches it — so it is sized and compressed for the
    // wire. The full-resolution artwork would be ~1.5 MB, which several
    // scrapers (WhatsApp, iMessage) skip outright, losing the preview.
    images: [{ url: "/og-image.png", width: 1200, height: 630, alt: "Imperial Entrepreneurs" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Imperial Entrepreneurs — Foundry",
    description: "The founder community at Imperial College London.",
    images: ["/og-image.png"],
  },
};

// Matches --color-bg-primary so mobile browser chrome blends into the page
// instead of framing it in white.
export const viewport: Viewport = {
  themeColor: "#08080a",
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
      // Square mark, not the banner lockup: this slot is cropped to a
      // square in knowledge panels and chat unfurls, and is also served raw.
      logo: `${SITE_URL}/logo-square.png`,
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
    <html lang="en" className={`${archivo.variable} ${plexMono.variable}`} data-scroll-behavior="smooth">
      <body suppressHydrationWarning>
        {/* First thing in the tab order on every page: lets a keyboard or
            screen-reader user jump the nav instead of tabbing through it on
            each navigation. Hidden until it takes focus. */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-100 focus:px-4 focus:py-2 focus:rounded-lg focus:bg-accent focus:text-bg-primary focus:text-[0.85rem] focus:font-medium focus:no-underline"
        >
          Skip to content
        </a>
        {/* React 19 hoists these into <head> — no hand-written <head> needed
            (and Next.js discourages one in a root layout). */}
        {PRECONNECT_ORIGINS.map((origin) => (
          <link key={origin} rel="preconnect" href={origin} crossOrigin="anonymous" />
        ))}
        {/* suppressHydrationWarning is load-bearing, not a papered-over bug.
            The CSP spec has browsers *hide* the nonce after parsing: the
            content attribute is emptied (getAttribute -> "") while the value
            survives on the .nonce IDL property. That exists so an attacker
            who can inject CSS cannot exfiltrate the nonce with a
            `script[nonce^="a"]` selector. React hydrates by comparing the
            content attribute, so it sees "" against the server's real value
            and reports a mismatch on every page load. The difference is
            correct and expected; the warning is not actionable. */}
        <script
          type="application/ld+json"
          nonce={nonce}
          suppressHydrationWarning
          dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData) }}
        />
        <PostHogProvider>{children}</PostHogProvider>
      </body>
    </html>
  );
}
