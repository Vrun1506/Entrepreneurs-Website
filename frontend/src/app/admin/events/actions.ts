"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

type Result = { ok: true } | { ok: false; error: string };

export async function approveEvent(eventId: string): Promise<Result> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("approve_event", {
    p_event_id: eventId,
    p_notes:    null,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/events");
  revalidatePath("/events");
  return { ok: true };
}

export async function rejectEvent(eventId: string, reason: string): Promise<Result> {
  const trimmed = reason.trim();
  if (!trimmed) return { ok: false, error: "Rejection reason is required." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("reject_event", {
    p_event_id: eventId,
    p_reason:   trimmed,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/admin/events");
  return { ok: true };
}
