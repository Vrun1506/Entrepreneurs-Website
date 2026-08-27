"use server";

import { revalidatePath } from "next/cache";
import { invalidate } from "@/lib/cache";
import { requireAdmin } from "@/lib/auth/actionAuth";
import {
  sendAcceptanceEmail, sendRejectionEmail,
  renderAcceptanceEmail, renderRejectionEmail,
  acceptanceReplyTo, rejectionReplyTo,
  enqueueEmailsBulk,
} from "@/lib/email";
import { emailBaseUrl } from "@/lib/siteUrl";
import { describeSupabaseError } from "@/lib/supabaseErrors";
import type { BulkResult } from "@/app/admin/bulkTypes";

type Result = { ok: true } | { ok: false; error: string };

/** What an RPC gives back about one member so we can email them. */
type Recipient = { email: string; first_name: string | null };

/**
 * Runs a per-member RPC across a list, then does the shared follow-up work
 * ONCE for the whole batch.
 *
 * This used to call the single-member action per id, and each of those
 * re-authenticated (getUser + is_admin + a profiles select), enqueued its
 * own email, dropped the cache key and revalidated the path — roughly six
 * round trips per member, sequential, in no transaction. Approving a
 * fifty-person backlog was three hundred round trips and would hit the
 * function timeout part-way through, leaving some members approved and
 * some not, with the admin shown nothing at all.
 *
 * Now: authenticate once, one RPC per member, one bulk email insert, one
 * cache drop, one revalidate. The pattern is the one admin_delete_graduates
 * already uses. Per-member results are still collected, so a partial batch
 * is still reported rather than guessed at.
 */
async function runBulk(
  ids: string[],
  rpc: (id: string) => Promise<{ recipient: Recipient | null; error?: string }>,
  email: (r: Recipient) => { subject: string; text: string; html: string },
  replyTo: string,
): Promise<BulkResult> {
  let succeeded = 0;
  const errors: string[] = [];
  const recipients: Recipient[] = [];

  for (const id of ids) {
    const r = await rpc(id);
    if (r.error) {
      errors.push(r.error);
      continue;
    }
    succeeded++;
    if (r.recipient?.email) recipients.push(r.recipient);
  }

  if (recipients.length > 0) {
    try {
      await enqueueEmailsBulk(
        recipients.map((r) => ({ to: r.email, replyTo, ...email(r) })),
      );
    } catch (e) {
      // The status changes are committed. Say so rather than reporting a
      // clean success the admin would read as "they've all been told".
      const msg = e instanceof Error ? e.message : String(e);
      errors.push(`Applied to ${succeeded}, but the notification emails failed to queue: ${msg}`);
    }
  }

  // Membership changed, so the cached directory is stale. Once, not per member.
  await invalidate("directoryFacets");
  revalidatePath("/admin/users");

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
    await invalidate("directoryFacets");
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
    await invalidate("directoryFacets");
    revalidatePath("/admin/users");
    return { ok: false, error: `User approved, but welcome email failed to queue: ${msg}` };
  }
  // Membership changed, so the cached directory is stale.
  await invalidate("directoryFacets");
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
    await invalidate("directoryFacets");
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
    await invalidate("directoryFacets");
    revalidatePath("/admin/users");
    return { ok: false, error: `User rejected, but email failed to send: ${msg}` };
  }
  // Membership changed, so the cached directory is stale.
  await invalidate("directoryFacets");
  revalidatePath("/admin/users");
  return { ok: true };
}

export async function bulkApproveUsers(ids: string[]): Promise<BulkResult> {
  // Authenticated once here, not once per member. The RPC re-checks
  // is_admin() on every call regardless, so the boundary is unchanged.
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  const { supabase } = auth;

  const communityUrl = `${emailBaseUrl()}/community`;

  return runBulk(
    ids,
    async (id) => {
      const { data, error } = await supabase.rpc("approve_user", {
        p_user_id: id,
        p_notes:   null,
      });
      if (error) return { recipient: null, error: describeSupabaseError(error) };
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.email) console.warn("approve_user returned no email for user:", id);
      return { recipient: row?.email ? { email: row.email, first_name: row.first_name ?? null } : null };
    },
    (r) => renderAcceptanceEmail({ firstName: r.first_name, communityUrl }),
    acceptanceReplyTo(),
  );
}

export async function bulkRejectUsers(ids: string[], reason: string): Promise<BulkResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "Rejection reason is required." };
  const { supabase } = auth;

  return runBulk(
    ids,
    async (id) => {
      const { data, error } = await supabase
        .rpc("reject_user", { p_user_id: id, p_reason: trimmed });
      if (error) return { recipient: null, error: describeSupabaseError(error) };
      const row = Array.isArray(data) ? data[0] : data;
      if (!row?.email) console.warn("reject_user returned no email for user:", id);
      return { recipient: row?.email ? { email: row.email, first_name: row.first_name ?? null } : null };
    },
    (r) => renderRejectionEmail({ firstName: r.first_name }),
    rejectionReplyTo(),
  );
}
