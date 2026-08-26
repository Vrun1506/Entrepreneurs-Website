import "server-only";
import { revalidatePath } from "next/cache";
import { getActionAuth } from "@/lib/auth/actionAuth";
import { guardSubmission, type SubmissionMode } from "@/lib/actions/guardSubmission";
import { ok, err, type Result } from "@/lib/result";
import { LISTINGS, type ListingKind } from "./registry";
import { invalidate } from "@/lib/cache";

// ════════════════════════════════════════════════════════════════════
// Foundry · Member-facing listing writes, once instead of three times
//
// The ceremony around each write — guard, call, revalidate the right two
// paths — was identical in all three app/*/actions.ts files. What differs
// per type (schema, RPC, argument mapping) lives in the registry.
// ════════════════════════════════════════════════════════════════════

export async function submitListing(
  kind: ListingKind,
  args: { mode: SubmissionMode; payload: unknown; turnstileToken?: string },
): Promise<Result> {
  const def = LISTINGS[kind];

  const guard = await guardSubmission({
    mode: args.mode,
    noun: def.submitNoun,
    turnstileToken: args.turnstileToken,
  });
  if (!guard.ok) return guard;

  const res = await def.create(guard.data.supabase, args.mode, args.payload);
  if (!res.ok) return res;

  // An admin-mode create publishes immediately, so it can land in a cached
  // list. A user-mode create only enqueues something pending, which no
  // cached list contains — invalidating anyway keeps this one code path.
  await invalidate(...def.cacheKeys);
  revalidatePath(def.revalidate.public);
  if (args.mode === "admin") revalidatePath(def.revalidate.admin);
  return ok();
}

// Edit one of your own listings. Ownership and status='pending' are
// enforced inside the RPC — since 20260826000001 all three types work this
// way, which is what lets this be one function.
export async function updateOwnListing(
  kind: ListingKind,
  id: string,
  payload: unknown,
): Promise<Result> {
  const def = LISTINGS[kind];

  const { user, supabase } = await getActionAuth();
  if (!user) return err("You must be signed in.");

  const res = await def.update(supabase, id, payload);
  if (!res.ok) return res;

  await invalidate(...def.cacheKeys);
  revalidatePath("/my-submissions");
  revalidatePath(def.revalidate.public);
  return ok();
}
