"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendListingRejectionEmail } from "@/lib/email";
import { describeSupabaseError } from "@/lib/supabaseErrors";

type Result = { ok: true } | { ok: false; error: string };

export async function approveOpportunity(opportunityId: string): Promise<Result> {
  const supabase = await createClient();
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

  const supabase = await createClient();
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
