import type { UserStatus } from "@/lib/database.overrides";

// ════════════════════════════════════════════════════════════════════
// Where a signed-in non-admin belongs, given their profile status.
//
// This mapping used to exist independently in seven places — guard.ts,
// /auth/callback, /auth/confirm, the login page's post-sign-in routing,
// and the self-guards on /pending, /rejected. /auth/confirm even said so
// out loud ("duplicated verbatim from /auth/callback"). Adding a status
// meant finding all seven, and missing one silently stranded those users.
//
// The `satisfies Record<UserStatus, string>` is the point of the whole
// file: UserStatus comes from the generated schema, so adding a value to
// the user_status enum and regenerating types breaks the build here until
// the new status is given a home.
// ════════════════════════════════════════════════════════════════════

export const HOME_FOR_STATUS = {
  pending_onboarding: "/onboarding",
  pending_review:     "/pending",
  approved:           "/home",
  rejected:           "/rejected",
} as const satisfies Record<UserStatus, string>;

/**
 * The page this status should land on. Falls back to "/" for a missing or
 * unrecognised status — `profiles.status` is a NOT NULL enum, so in practice
 * that only covers a profile row that failed to load.
 */
export function destinationForStatus(status: string | null | undefined): string {
  if (!status) return "/";
  return HOME_FOR_STATUS[status as UserStatus] ?? "/";
}

/**
 * For a page that is itself one status's home (e.g. /pending): the
 * destination to bounce to, or null when the user is already in the
 * right place.
 */
export function redirectAwayFrom(
  ownPath: string,
  status: string | null | undefined,
): string | null {
  const dest = destinationForStatus(status);
  return dest === ownPath ? null : dest;
}

/**
 * Where an approved member belongs before /home, if anywhere.
 *
 * "/home bounces to /intake" only for a member who has never seen it —
 * profile_version < 2 (submit_intake hasn't run) AND intake_deferred_at
 * is null (they've never hit Skip either). The 20260901000004 backfill
 * set intake_deferred_at for every already-approved member at migration
 * time, specifically so this bounce is a one-time invitation rather than
 * a wall for existing members — they get /home's dismissible prompt card
 * instead. Admins are exempt, matching every other status-gated page.
 */
export function postApprovalDestination(opts: {
  profileVersion: number | null;
  intakeDeferredAt: string | null;
  isAdmin: boolean;
}): string | null {
  if (opts.isAdmin) return null;
  if ((opts.profileVersion ?? 1) >= 2) return null;
  if (opts.intakeDeferredAt) return null;
  return "/intake";
}
