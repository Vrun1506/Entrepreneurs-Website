"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { sendListingRejectionEmail } from "@/lib/email";
import { describeSupabaseError } from "@/lib/supabaseErrors";

type Result = { ok: true } | { ok: false; error: string };

export async function approveEvent(eventId: string): Promise<Result> {
  const supabase = await createClient();
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

  const supabase = await createClient();
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
