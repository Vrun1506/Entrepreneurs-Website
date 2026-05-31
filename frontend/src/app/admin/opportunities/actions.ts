"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/actionAuth";
import { sendListingRejectionEmail } from "@/lib/email";
import { describeSupabaseError } from "@/lib/supabaseErrors";
import type { BulkResult } from "@/app/admin/bulkTypes";

type Result = { ok: true } | { ok: false; error: string };

async function runBulk(ids: string[], one: (id: string) => Promise<Result>): Promise<BulkResult> {
  let succeeded = 0;
  const errors: string[] = [];
  for (const id of ids) {
    const r = await one(id);
    if (r.ok) succeeded++;
    else errors.push(r.error);
  }
  return { ok: true, succeeded, failed: errors.length, firstError: errors[0] };
}

export async function approveOpportunity(opportunityId: string): Promise<Result> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const { supabase } = auth;
  const { error } = await supabase.rpc("approve_opportunity", {
    p_opportunity_id: opportunityId,
    p_notes:          null,
  });
  if (error) return { ok: false, error: describeSupabaseError(error) };
  revalidatePath("/admin/opportunities");
  revalidatePath("/opportunities");
  return { ok: true };
}

export async function rejectOpportunity(opportunityId: string, reason: string): Promise<Result> {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "Rejection reason is required." };

  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const { supabase } = auth;
  const { data, error } = await supabase.rpc("reject_opportunity", {
    p_opportunity_id: opportunityId,
    p_reason:         trimmed,
  });
  if (error) return { ok: false, error: describeSupabaseError(error) };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.email) {
    console.warn("reject_opportunity returned no email for opportunity:", opportunityId);
    revalidatePath("/admin/opportunities");
    return { ok: true };
  }

  try {
    await sendListingRejectionEmail({
      to:           row.email,
      firstName:    row.first_name ?? null,
      listingKind:  "opportunity",
      listingTitle: row.title,
      reason:       trimmed,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    revalidatePath("/admin/opportunities");
    return { ok: false, error: `Opportunity rejected, but email failed to send: ${msg}` };
  }

  revalidatePath("/admin/opportunities");
  return { ok: true };
}

export async function bulkApproveOpportunities(ids: string[]): Promise<BulkResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  return runBulk(ids, approveOpportunity);
}

export async function bulkRejectOpportunities(ids: string[], reason: string): Promise<BulkResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!reason.trim()) return { ok: false, error: "Rejection reason is required." };
  return runBulk(ids, (id) => rejectOpportunity(id, reason));
}
