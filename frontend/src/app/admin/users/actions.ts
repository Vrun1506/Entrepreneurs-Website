"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { sendAcceptanceEmail, sendRejectionEmail } from "@/lib/email";
import { describeSupabaseError } from "@/lib/supabaseErrors";

type Result = { ok: true } | { ok: false; error: string };

export async function approveUser(userId: string): Promise<Result> {
  const supabase = await createClient();

  // is_admin() is verified inside the RPC; no need to re-check here.
  // Updated approve_user RPC (migration 20260530000004) returns the
  // user's email + first_name so we can send the welcome email in
  // the same round trip.
  const { data, error } = await supabase.rpc("approve_user", {
    p_user_id: userId,
    p_notes:   null,
  });
  if (error) return { ok: false, error: describeSupabaseError(error) };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.email) {
    console.warn("approve_user returned no email for user:", userId);
    revalidatePath("/admin/users");
    return { ok: true };
  }

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host  = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const communityUrl = host ? `${proto}://${host}/community` : "/community";

  try {
    await sendAcceptanceEmail({
      to:           row.email,
      firstName:    row.first_name ?? null,
      communityUrl,
    });
  } catch (e) {
    // Approval is committed; surface the email failure so the admin
    // can follow up but don't reverse the approval.
    const msg = e instanceof Error ? e.message : String(e);
    revalidatePath("/admin/users");
    return { ok: false, error: `User approved, but welcome email failed to queue: ${msg}` };
  }

  revalidatePath("/admin/users");
  return { ok: true };
}

export async function rejectUser(userId: string, reason: string): Promise<Result> {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "Rejection reason is required." };

  const supabase = await createClient();

  // The updated reject_user RPC (migration 6) returns the user's email +
  // first_name so we can email them without a second round-trip.
  const { data, error } = await supabase
    .rpc("reject_user", { p_user_id: userId, p_reason: trimmed });
  if (error) return { ok: false, error: describeSupabaseError(error) };

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
