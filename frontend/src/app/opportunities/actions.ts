"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { describeSupabaseError } from "@/lib/supabaseErrors";

type ToggleResult =
  | { ok: true; bookmarked: boolean }
  | { ok: false; error: string };

export async function toggleOpportunityBookmark(opportunityId: string): Promise<ToggleResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Look up current state — single round trip is cheap and lets us
  // decide insert-vs-delete without relying on the unique-violation
  // error code as control flow.
  const { data: existing, error: lookupErr } = await supabase
    .from("opportunity_bookmarks")
    .select("opportunity_id")
    .eq("user_id", user.id)
    .eq("opportunity_id", opportunityId)
    .maybeSingle();
  if (lookupErr) return { ok: false, error: describeSupabaseError(lookupErr) };

  if (existing) {
    const { error } = await supabase
      .from("opportunity_bookmarks")
      .delete()
      .eq("user_id", user.id)
      .eq("opportunity_id", opportunityId);
    if (error) return { ok: false, error: describeSupabaseError(error) };
    revalidatePath("/my-bookmarks");
    return { ok: true, bookmarked: false };
  }

  const { error } = await supabase
    .from("opportunity_bookmarks")
    .insert({ user_id: user.id, opportunity_id: opportunityId });
  if (error) return { ok: false, error: describeSupabaseError(error) };
  revalidatePath("/my-bookmarks");
  return { ok: true, bookmarked: true };
}
