"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth/actionAuth";
import { sendListingRejectionEmail } from "@/lib/email";
import { describeSupabaseError } from "@/lib/supabaseErrors";
import type { BulkResult } from "@/app/admin/bulkTypes";
import type { Result } from "@/lib/result";
import { runBulk } from "@/lib/admin/bulk";

export async function approveEvent(eventId: string): Promise<Result> {
  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const { supabase } = auth;
  const { error } = await supabase.rpc("approve_event", {
    p_event_id: eventId,
    p_notes:    null,
  });
  if (error) return { ok: false, error: describeSupabaseError(error) };
  revalidatePath("/admin/events");
  revalidatePath("/events");
  return { ok: true };
}

export async function rejectEvent(eventId: string, reason: string): Promise<Result> {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "Rejection reason is required." };

  const auth = await requireAdmin();
  if (!auth.ok) return auth;
  const { supabase } = auth;
  const { data, error } = await supabase.rpc("reject_event", {
    p_event_id: eventId,
    p_reason:   trimmed,
  });
  if (error) return { ok: false, error: describeSupabaseError(error) };

  const row = Array.isArray(data) ? data[0] : data;
  if (!row?.email) {
    console.warn("reject_event returned no email for event:", eventId);
    revalidatePath("/admin/events");
    return { ok: true };
  }

  try {
    await sendListingRejectionEmail({
      to:           row.email,
      firstName:    row.first_name ?? null,
      listingKind:  "event",
      listingTitle: row.title,
      reason:       trimmed,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    revalidatePath("/admin/events");
    return { ok: false, error: `Event rejected, but email failed to send: ${msg}` };
  }

  revalidatePath("/admin/events");
  return { ok: true };
}

export async function bulkApproveEvents(ids: string[]): Promise<BulkResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  return runBulk(ids, approveEvent);
}

export async function bulkRejectEvents(ids: string[], reason: string): Promise<BulkResult> {
  const auth = await requireAdmin();
  if (!auth.ok) return { ok: false, error: auth.error };
  if (!reason.trim()) return { ok: false, error: "Rejection reason is required." };
  return runBulk(ids, (id) => rejectEvent(id, reason));
}
