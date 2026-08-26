import "server-only";
import { getActionAuth } from "@/lib/auth/actionAuth";
import { allow } from "@/lib/ratelimit";
import { verifyTurnstile } from "@/lib/turnstile";
import { ok, err, type Result } from "@/lib/result";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export type SubmissionMode = "user" | "admin";

// The gate every listing submission passes through, in the order it has to
// happen: identity, then authorisation for the mode, then the abuse
// controls — which are skipped in admin mode, since an admin publishing
// directly is not the traffic those exist to shape.
//
// This preamble was copied verbatim into submitOpportunity, submitEvent
// and submitVcGrant, differing only in the noun in the first message. A
// check added to one of three copies is a check that isn't enforced, which
// is the whole reason it's here.
//
// The SECURITY DEFINER RPCs behind these actions re-check the caller
// regardless; this layer exists to fail early with a message worth showing.
export async function guardSubmission(args: {
  mode: SubmissionMode;
  /** Completes "You must be signed in to post …". */
  noun: string;
  turnstileToken?: string;
}): Promise<Result<{ supabase: SupabaseClient; user: User }>> {
  const { user, isAdmin, status, supabase } = await getActionAuth();

  if (!user) return err(`You must be signed in to post ${args.noun}.`);
  if (args.mode === "admin" && !isAdmin) return err("Admin access required.");
  if (args.mode === "user" && !isAdmin && status !== "approved") {
    return err("Your membership must be approved before you can post.");
  }

  if (args.mode === "user") {
    if (!(await verifyTurnstile(args.turnstileToken))) {
      return err("Verification failed. Please complete the challenge and try again.");
    }
    if (!(await allow("submit", user.id))) {
      return err("You're posting too frequently. Please try again later.");
    }
  }

  return ok({ supabase, user });
}
