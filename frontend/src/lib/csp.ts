// ════════════════════════════════════════════════════════════════════
// Content-Security-Policy — built per request in the middleware (proxy.ts)
// with a fresh nonce. The policy is derived from the SAME env the app uses
// (Supabase, PostHog, Sentry) so it can never drift from what actually
// loads, and no origin is hardcoded. Turnstile is a fixed Cloudflare host.
//
// Modern browsers enforce `'nonce-…' 'strict-dynamic'` for scripts; the
// `https:` and `'unsafe-inline'` tokens are ignored by CSP3 browsers when
// strict-dynamic is present and serve only as a fallback for older ones.
// ════════════════════════════════════════════════════════════════════

function originOf(value: string | undefined): string | null {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

// Edge-runtime-safe nonce: Web Crypto + btoa (no Node Buffer).
export function generateNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

export function buildCsp(nonce: string): string {
  const supabaseOrigin = originOf(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const supabaseWs = supabaseOrigin ? supabaseOrigin.replace(/^https:/, "wss:") : null;

  const posthogOrigin = originOf(process.env.NEXT_PUBLIC_POSTHOG_HOST ?? "https://eu.i.posthog.com");
  // PostHog serves its JS bundle/array from a sibling "-assets" host.
  const posthogAssets = posthogOrigin ? posthogOrigin.replace(".i.posthog.com", "-assets.i.posthog.com") : null;

  const sentryOrigin = originOf(process.env.NEXT_PUBLIC_SENTRY_DSN);

  const turnstile = "https://challenges.cloudflare.com";

  // Community post images. Served straight from Azure Blob over a
  // short-expiry SAS, so the browser fetches them from the storage account
  // host rather than from us. Derived from the same env the URL signer
  // uses — a literal here would drift the moment the account is renamed.
  //
  // Built by hand rather than through originOf(): AZURE_STORAGE_ACCOUNT is
  // an account name, not a URL. This module runs in the edge runtime, so it
  // cannot import lib/storage/blobRead.ts (server-only, pulls in the SDK).
  const azureAccount = process.env.AZURE_STORAGE_ACCOUNT;
  const blobOrigin = azureAccount ? `https://${azureAccount}.blob.core.windows.net` : null;

  // The upload gateway belongs in connect-src, not img-src: the browser
  // POSTs image bytes to it and never renders anything from it.
  const gatewayOrigin = originOf(process.env.UPLOAD_GATEWAY_URL);

  const connectSrc = [
    "'self'", supabaseOrigin, supabaseWs, posthogOrigin, posthogAssets, sentryOrigin, turnstile, gatewayOrigin,
  ].filter(Boolean);
  const imgSrc = ["'self'", "data:", "blob:", supabaseOrigin, blobOrigin].filter(Boolean);

  // React uses eval() in development for richer error stacks; not needed in prod.
  const devEval = process.env.NODE_ENV === "development" ? " 'unsafe-eval'" : "";

  const directives = [
    `default-src 'self'`,
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic' https: 'unsafe-inline'${devEval}`,
    `style-src 'self' 'unsafe-inline'`,
    `img-src ${imgSrc.join(" ")}`,
    `font-src 'self' data:`,
    `connect-src ${connectSrc.join(" ")}`,
    `frame-src ${turnstile}`,
    `worker-src 'self' blob:`,
    `object-src 'none'`,
    `base-uri 'self'`,
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ];

  return directives.join("; ");
}
