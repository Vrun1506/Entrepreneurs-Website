import "server-only";

// Cloudflare Turnstile server-side verification.
//
// ENV-GATED: with no TURNSTILE_SECRET_KEY, verifyTurnstile() returns true
// (skips the check), so local dev / CI / unconfigured deploys behave as
// before. It only enforces once the secret is set.

const SECRET = process.env.TURNSTILE_SECRET_KEY;

export const turnstileServerEnabled = Boolean(SECRET);

export async function verifyTurnstile(token: string | null | undefined): Promise<boolean> {
  if (!SECRET) return true; // not configured → skip
  if (!token) return false; // configured but no token → fail

  try {
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret: SECRET, response: token }),
    });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
