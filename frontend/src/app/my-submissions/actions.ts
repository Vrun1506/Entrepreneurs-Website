"use server";

import { revalidatePath } from "next/cache";
import { describeSupabaseError } from "@/lib/supabaseErrors";
import { getActionAuth } from "@/lib/auth/actionAuth";

export type ListingType = "opportunity" | "event" | "vc_grant";

type Result = { ok: true } | { ok: false; error: string };

const TABLE: Record<ListingType, string> = {
  opportunity: "opportunities",
  event:       "events",
  vc_grant:    "vcs_grants",
};

const REVALIDATE: Record<ListingType, string[]> = {
  opportunity: ["/opportunities", "/my-submissions"],
  event:       ["/events",        "/my-submissions"],
  vc_grant:    ["/vcs",           "/my-submissions"],
};

// Deletes one of the caller's own pending or rejected listings. RLS
// enforces ownership + status — a request to delete somebody else's row
// or an approved one returns 0 affected rows and we report that as not
// found.
export async function deleteOwnListing(type: ListingType, id: string): Promise<Result> {
  if (!TABLE[type]) return { ok: false, error: "Unknown listing type." };

  const { user, supabase } = await getActionAuth();
  if (!user) return { ok: false, error: "You must be signed in." };

  const { error, count } = await supabase
    .from(TABLE[type])
    .delete({ count: "exact" })
    .eq("id", id);

  if (error) return { ok: false, error: describeSupabaseError(error) };
  if (!count) return { ok: false, error: "Listing not found — it may have already been deleted." };

  for (const path of REVALIDATE[type]) revalidatePath(path);
  return { ok: true };
}
