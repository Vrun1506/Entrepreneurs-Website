"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendRejectionEmail } from "@/lib/email";

type Result = { ok: true } | { ok: false; error: string };

export async function approveUser(userId: string): Promise<Result> {
  const supabase = await createClient();

  // is_admin() is verified inside the RPC; no need to re-check here.
  const { error } = await supabase.rpc("approve_user", {
    p_user_id: userId,
    p_notes:   null,
  });
  if (error) return { ok: false, error: error.message };

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function rejectUser(userId: string, reason: string): Promise<Result> {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "Rejection reason is required." };

  const supabase = await createClient();

  // The updated reject_user RPC (migration 9) returns the user's email +
  // first_name so we can email them without a second round-trip.
  const { data, error } = await supabase
    .rpc("reject_user", { p_user_id: userId, p_reason: trimmed });
  if (error) return { ok: false, error: error.message };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.email) {
    // Status flip succeeded but we couldn't find the email. Don't fail the
    // whole action — the admin's intent is recorded; just log.
    console.warn("reject_user returned no email for user:", userId);
    revalidatePath("/admin/users");
    return { ok: true };
  }

  try {
    await sendRejectionEmail({ to: row.email, firstName: row.first_name ?? null });
  } catch (e) {
    // Email failed but DB rejection is already committed. Surface to admin
    // so they know to follow up manually, but don't revert the rejection.
    const msg = e instanceof Error ? e.message : String(e);
    revalidatePath("/admin/users");
    return { ok: false, error: `User rejected, but email failed to send: ${msg}` };
  }

  revalidatePath("/admin/users");
  return { ok: true };
}
