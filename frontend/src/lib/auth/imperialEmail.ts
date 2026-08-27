// The Imperial domain rule, in one place.
//
// This is the app-side mirror of public.is_imperial_email (migration
// 20260529000001), which is the copy that actually enforces it: the DB
// trigger re-checks on both INSERT and email UPDATE, so a client that
// skips this cannot get a student off the domain.
//
// It exists client-side anyway because the trigger fires late. On an
// email change with Secure email change on, GoTrue writes the pending
// address to email_change and only touches `email` once BOTH codes are
// confirmed — so the trigger's rejection would land after the member has
// been to two mailboxes and typed two codes. Checking here means they are
// told before any of that happens.
//
// Kept identical to the SQL, including the exact-domain match: the SQL
// takes split_part(email, '@', 2), so a subdomain like @cs.imperial.ac.uk
// does not qualify there and must not qualify here either.

export const IMPERIAL_DOMAINS = ["ic.ac.uk", "imperial.ac.uk"];

/** True if the address is on an Imperial domain. Students are pinned to these. */
export function isImperialEmail(email: string): boolean {
  const domain = email.trim().toLowerCase().split("@")[1];
  return !!domain && IMPERIAL_DOMAINS.includes(domain);
}
