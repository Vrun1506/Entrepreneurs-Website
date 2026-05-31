"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { describeSupabaseError } from "@/lib/supabaseErrors";
import type { Result } from "@/lib/result";
import { ok, err } from "@/lib/result";

// User-facing actions for events. Admin actions live in
// /admin/events/actions.ts.
//
// Why a server action instead of a direct client-side
// supabase.from().update() call: we want a stable RPC boundary that
// will translate cleanly to a FastAPI endpoint later. Client-direct
// PostgREST UPDATEs are migration-hostile because they're tied to
// Supabase's SDK + RLS shape rather than a plain HTTP contract.

export type EventEditPayload = {
  title: string;
  description: string;
  lumaLink: string;
  eventAtIso: string;
  location: string;
  organiserName: string;
  contactEmail: string;
  contactEmailVisible: boolean;
};

export async function updateOwnEvent(id: string, payload: EventEditPayload): Promise<Result> {
  const supabase = await createClient();

  // RLS gates the update to posted_by=auth.uid() AND status='pending'.
  // We still surface a 0-row response as "not found / no longer
  // editable" so the caller can show a meaningful message.
  const { error, count } = await supabase
    .from("events")
    .update({
      title:                 payload.title,
      description:           payload.description,
      luma_link:             payload.lumaLink,
      event_at:              payload.eventAtIso,
      location:              payload.location,
      organiser_name:        payload.organiserName,
      contact_email:         payload.contactEmail,
      contact_email_visible: payload.contactEmailVisible,
    }, { count: "exact" })
    .eq("id", id);

  if (error) return err(describeSupabaseError(error));
  if (!count) return err("Event not found, or it's already been approved (only pending events can be edited).");

  revalidatePath("/my-submissions");
  revalidatePath("/events");
  return ok();
}
