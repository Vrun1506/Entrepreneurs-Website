"use server";

import { revalidatePath } from "next/cache";
import { invalidate } from "@/lib/cache";
import { requireAdmin } from "@/lib/auth/actionAuth";
import { sendAcceptanceEmail, sendRejectionEmail } from "@/lib/email";
import { emailBaseUrl } from "@/lib/siteUrl";
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

export async function approveUser(userId: string): Promise<Result> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const { supabase } = auth;

  // is_admin() is verified again inside the RPC; this is defence in depth.
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
    // Membership changed, so the cached directory is stale.
    await invalidate("directory");
    revalidatePath("/admin/users");
    return { ok: true };
  }

  // Build the email link from trusted config, NOT request headers
  // (x-forwarded-host is attacker-controllable → email-link poisoning).
  const communityUrl = `${emailBaseUrl()}/community`;

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
    // Membership changed, so the cached directory is stale.
    await invalidate("directory");
    revalidatePath("/admin/users");
    return { ok: false, error: `User approved, but welcome email failed to queue: ${msg}` };
  }
  // Membership changed, so the cached directory is stale.
  await invalidate("directory");
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function rejectUser(userId: string, reason: string): Promise<Result> {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "Rejection reason is required." };

  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const { supabase } = auth;

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
    // Membership changed, so the cached directory is stale.
    await invalidate("directory");
    revalidatePath("/admin/users");
    return { ok: true };
  }

  try {
    await sendRejectionEmail({ to: row.email, firstName: row.first_name ?? null });
  } catch (e) {
    // Email failed but DB rejection is already committed. Surface to admin
    // so they know to follow up manually, but don't revert the rejection.
    const msg = e instanceof Error ? e.message : String(e);
    // Membership changed, so the cached directory is stale.
    await invalidate("directory");
    revalidatePath("/admin/users");
    return { ok: false, error: `User rejected, but email failed to send: ${msg}` };
  }
  // Membership changed, so the cached directory is stale.
  await invalidate("directory");
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function bulkApproveUsers(ids: string[]): Promise<BulkResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  return runBulk(ids, approveUser);
}

export async function bulkRejectUsers(ids: string[], reason: string): Promise<BulkResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!reason.trim()) return { ok: false, error: "Rejection reason is required." };
  return runBulk(ids, (id) => rejectUser(id, reason));
}
