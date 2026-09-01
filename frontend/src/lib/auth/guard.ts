import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.overrides";
import type { UserStatus } from "@/lib/database.overrides";
import { destinationForStatus, postApprovalDestination } from "@/lib/auth/status";

// Auth + onboarding-status gating used by every authenticated page.
// Centralised so swapping Supabase for a different backend later (e.g.
// a FastAPI service) only touches this one module instead of every
// page.tsx that gates by status.
//
// Returns the resolved user, profile status, and isAdmin flag so the
// caller can use them without re-querying. Pages that don't need any
// of those can ignore the return value.

export type GateOptions = {
  /**
   * If true, send approved-and-onboarding users straight through; do
   * not redirect on any status. Default false. Admins always pass
   * through regardless (mirrors existing behaviour so admins can
   * preview user-facing UIs for diagnostics).
   */
  passthrough?: boolean;
  /**
   * If true, also bounce an approved-but-not-yet-intaken member to
   * /intake — see postApprovalDestination. Only /home passes this: it
   * is the one page whose whole job is "where you land after signing
   * in", so it is the one place a first-time invitation belongs. Every
   * other approved page (settings, members, opportunities…) must stay
   * reachable regardless, or a member who deep-links in gets bounced
   * somewhere they didn't ask to go.
   */
  bounceToIntake?: boolean;
};

export type GateResult = {
  user: User;
  isAdmin: boolean;
  status: UserStatus | null;
  supabase: SupabaseClient<Database>;
};

/**
 * Server-side gate for authenticated pages. Redirects:
 *  - no session → /login
 *  - non-admin with pending_onboarding → /onboarding
 *  - non-admin with pending_review → /pending
 *  - non-admin with rejected → /rejected
 *
 * Admins bypass status redirects so they can browse the user-facing UI.
 */
export async function requireApprovedUser(opts: GateOptions = {}): Promise<GateResult> {
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: isAdminData }, { data: profile }] = await Promise.all([
    supabase.rpc("is_admin"),
    supabase
      .from("profiles")
      .select("status, profile_version, intake_deferred_at")
      .eq("id", user.id)
      .single(),
  ]);

  const isAdmin = !!isAdminData;

  if (!profile) redirect("/login");

  if (!opts.passthrough && !isAdmin && profile.status !== "approved") {
    redirect(destinationForStatus(profile.status));
  }

  if (opts.bounceToIntake && profile.status === "approved") {
    const dest = postApprovalDestination({
      profileVersion: profile.profile_version,
      intakeDeferredAt: profile.intake_deferred_at,
      isAdmin,
    });
    if (dest) redirect(dest);
  }

  return {
    user,
    isAdmin,
    status: profile.status as GateResult["status"],
    supabase,
  };
}

/**
 * Server-side gate for pages that just need any authenticated user
 * regardless of onboarding status (e.g. /settings, /onboarding).
 * Redirects to /login if not signed in.
 */
export async function requireSignedInUser(): Promise<GateResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [{ data: isAdminData }, { data: profile }] = await Promise.all([
    supabase.rpc("is_admin"),
    supabase.from("profiles").select("status").eq("id", user.id).maybeSingle(),
  ]);

  return {
    user,
    isAdmin: !!isAdminData,
    status: (profile?.status ?? null) as GateResult["status"],
    supabase,
  };
}
