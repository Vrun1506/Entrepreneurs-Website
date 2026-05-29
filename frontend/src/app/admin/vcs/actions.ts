"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

export async function approveVcGrant(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_vc_grant", { p_id: id, p_notes: null });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/vcs");
  revalidatePath("/vcs");
  return { ok: true };
}

export async function rejectVcGrant(id: string, reason: string): Promise<Result> {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "Rejection reason is required." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_vc_grant", { p_id: id, p_reason: trimmed });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/vcs");
  return { ok: true };
}
