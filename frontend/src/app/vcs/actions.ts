"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { describeSupabaseError } from "@/lib/supabaseErrors";
import type { Result } from "@/lib/result";
import { ok, err } from "@/lib/result";

// User-facing actions for VCs / grants. Admin actions live in
// /admin/vcs/actions.ts.

export type VcEditPayload = {
  kind: "vc" | "grant";
  name: string;
  description: string;
  link: string;
  amount: string | null;
  deadline: string | null;
  stage: string | null;
};

export async function updateOwnVcGrant(id: string, payload: VcEditPayload): Promise<Result> {
  const supabase = await createClient();

  // RLS gates the update to posted_by=auth.uid() AND status='pending'.
  const { error, count } = await supabase
    .from("vcs_grants")
    .update({
      kind:        payload.kind,
      name:        payload.name,
      description: payload.description,
      link:        payload.link,
      amount:      payload.amount,
      deadline:    payload.deadline,
      stage:       payload.stage,
    }, { count: "exact" })
    .eq("id", id);

  if (error) return err(describeSupabaseError(error));
  if (!count) return err("Listing not found, or it's already been approved (only pending listings can be edited).");

  revalidatePath("/my-submissions");
  revalidatePath("/vcs");
  return ok();
}
