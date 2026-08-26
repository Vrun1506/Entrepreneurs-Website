"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/actionAuth";
import { sendListingRejectionEmail } from "@/lib/email";
import { describeSupabaseError } from "@/lib/supabaseErrors";
import type { BulkResult } from "@/app/admin/bulkTypes";
import type { Result } from "@/lib/result";
import { runBulk } from "@/lib/admin/bulk";

export async function approveVcGrant(id: string): Promise<Result> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const { supabase } = auth;
  const { error } = await supabase.rpc("approve_vc_grant", { p_id: id, p_notes: null });
  if (error) return { ok: false, error: describeSupabaseError(error) };
  revalidatePath("/admin/vcs");
  revalidatePath("/vcs");
  return { ok: true };
}

export async function rejectVcGrant(id: string, reason: string): Promise<Result> {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "Rejection reason is required." };

  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const { supabase } = auth;
  const { data, error } = await supabase.rpc("reject_vc_grant", { p_id: id, p_reason: trimmed });
  if (error) return { ok: false, error: describeSupabaseError(error) };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.email) {
    console.warn("reject_vc_grant returned no email for VC/grant:", id);
    revalidatePath("/admin/vcs");
    return { ok: true };
  }

  try {
    await sendListingRejectionEmail({
      to:           row.email,
      firstName:    row.first_name ?? null,
      listingKind:  "VC/grant submission",
      listingTitle: row.title,
      reason:       trimmed,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    revalidatePath("/admin/vcs");
    return { ok: false, error: `VC/grant rejected, but email failed to send: ${msg}` };
  }

  revalidatePath("/admin/vcs");
  return { ok: true };
}

export async function bulkApproveVcGrants(ids: string[]): Promise<BulkResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  return runBulk(ids, approveVcGrant);
}

export async function bulkRejectVcGrants(ids: string[], reason: string): Promise<BulkResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!reason.trim()) return { ok: false, error: "Rejection reason is required." };
  return runBulk(ids, (id) => rejectVcGrant(id, reason));
}
