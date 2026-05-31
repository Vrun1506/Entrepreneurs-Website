"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendListingRejectionEmail } from "@/lib/email";
import { describeSupabaseError } from "@/lib/supabaseErrors";

type Result = { ok: true } | { ok: false; error: string };

export async function approveVcGrant(id: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_vc_grant", { p_id: id, p_notes: null });
  if (error) return { ok: false, error: describeSupabaseError(error) };
  revalidatePath("/admin/vcs");
  revalidatePath("/vcs");
  return { ok: true };
}

export async function rejectVcGrant(id: string, reason: string): Promise<Result> {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "Rejection reason is required." };

  const supabase = await createClient();
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
