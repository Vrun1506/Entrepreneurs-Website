// Auth error text reaches us partly via ?error= in the URL, which is
// attacker-controllable — rendering it verbatim is a phishing/content-spoof
// vector. Map the cases users actually hit to fixed friendly copy and fall
// back to a generic line, so raw URL input is never shown as page content.
export function friendlyAuthError(raw: string): string {
  const e = raw.toLowerCase();
  if (e.includes("not confirmed")) return "Please confirm your email first — check your inbox for the verification code.";
  if (e.includes("expired") || e.includes("invalid") || e.includes("missing_token") || e.includes("missing_code")) return "That link is invalid or has expired. Please request a new one.";
  if (e.includes("code verifier") || e.includes("both auth code")) return "Please open the link in the same browser you started in, or try signing in again.";
  if (e.includes("access_denied") || e.includes("cancel")) return "Sign-in was cancelled.";
  if (e.includes("rate") || e.includes("too many")) return "Too many attempts. Please wait a moment and try again.";
  return "Something went wrong during sign-in. Please try again.";
}

// Friendly copy for verifyOtp failures (wrong/expired code). Distinct from
// friendlyAuthError so we say "code" not "link".
export function friendlyVerifyError(raw: string): string {
  const e = raw.toLowerCase();
  if (e.includes("expired")) return "That code has expired. Request a new one below.";
  if (e.includes("invalid") || e.includes("token")) return "That code is incorrect. Check it and try again.";
  if (e.includes("rate") || e.includes("too many")) return "Too many attempts. Please wait a moment and try again.";
  return "We couldn't verify that code. Please try again.";
}
