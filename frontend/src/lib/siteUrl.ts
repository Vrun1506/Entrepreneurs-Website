import "server-only";

// ════════════════════════════════════════════════════════════════════
// Canonical base URL for links embedded in OUTBOUND EMAIL.
//
// Built from configuration, never from request headers. x-forwarded-host
// / Host are attacker-controllable, so deriving an email link from them
// lets a crafted request poison links in mail we send (e.g. an approval
// email whose "Open Foundry" button points at evil.example). Email links
// must come from a trusted, fixed source.
//
// NEXT_PUBLIC_SITE_URL is set per-environment (prod = the live domain).
// Falls back to the production domain so a missing var degrades to the
// correct public site rather than a broken/spoofable link.
// ════════════════════════════════════════════════════════════════════

const DEFAULT_SITE_URL = "https://www.imperialentrepreneurs.com";

export function emailBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  const base = raw && /^https?:\/\//i.test(raw) ? raw : DEFAULT_SITE_URL;
  return base.replace(/\/+$/, "");
}
