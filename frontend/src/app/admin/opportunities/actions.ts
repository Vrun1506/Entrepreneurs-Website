"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

export async function approveOpportunity(opportunityId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_opportunity", {
    p_opportunity_id: opportunityId,
    p_notes:          null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/opportunities");
  revalidatePath("/opportunities");
  return { ok: true };
}

export async function rejectOpportunity(opportunityId: string, reason: string): Promise<Result> {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "Rejection reason is required." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_opportunity", {
    p_opportunity_id: opportunityId,
    p_reason:         trimmed,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/opportunities");
  return { ok: true };
}
