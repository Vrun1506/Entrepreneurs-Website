"use server";

import { revalidatePath } from "next/cache";
import { describeSupabaseError } from "@/lib/supabaseErrors";
import { getActionAuth } from "@/lib/auth/actionAuth";
import type { Database } from "@/lib/database.overrides";

export type ListingType = "opportunity" | "event" | "vc_grant";

type Result = { ok: true } | { ok: false; error: string };

// `as const satisfies` rather than Record<ListingType, string>: the wider
// type erases the table names, and supabase-js can only resolve columns
// from a literal. It also makes a typo here a compile error instead of a
// runtime 404 from PostgREST.
const TABLE = {
  opportunity: "opportunities",
  event:       "events",
  vc_grant:    "vcs_grants",
} as const satisfies Record<ListingType, keyof Database["public"]["Tables"]>;

const REVALIDATE: Record<ListingType, string[]> = {
  opportunity: ["/opportunities", "/my-submissions"],
  event:       ["/events",        "/my-submissions"],
  vc_grant:    ["/vcs",           "/my-submissions"],
};

// Deletes one of the caller's own listings. RLS already enforces
// ownership, but we also filter by posted_by at the app layer as defence
// in depth — so an ownership regression in a policy can't widen this into
// a delete-anyone's-row primitive. A request for somebody else's row (or a
// missing one) affects 0 rows and we report that as not found.
export async function deleteOwnListing(type: ListingType, id: string): Promise<Result> {
  if (!TABLE[type]) return { ok: false, error: "Unknown listing type." };

  const { user, supabase } = await getActionAuth();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { error, count } = await supabase
    .from(TABLE[type])
    .delete({ count: "exact" })
    .eq("id", id)
    .eq("posted_by", user.id);

  if (error) return { ok: false, error: describeSupabaseError(error) };
  if (!count) return { ok: false, error: "Listing not found — it may have already been deleted." };

  for (const path of REVALIDATE[type]) revalidatePath(path);
  return { ok: true };
}
