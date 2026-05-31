"use server";

import { revalidatePath } from "next/cache";
import { describeSupabaseError } from "@/lib/supabaseErrors";
import type { Result } from "@/lib/result";
import { ok, err } from "@/lib/result";
import { getActionAuth } from "@/lib/auth/actionAuth";
import { allow } from "@/lib/ratelimit";
import { verifyTurnstile } from "@/lib/turnstile";
import { eventSchema, validate } from "@/lib/validation/listings";

// User-facing actions for events. Admin actions live in
// /admin/events/actions.ts.
//
// Why a server action instead of a direct client-side
// supabase.from().update() call: we want a stable RPC boundary that
// will translate cleanly to a FastAPI endpoint later. Client-direct
// PostgREST UPDATEs are migration-hostile because they're tied to
// Supabase's SDK + RLS shape rather than a plain HTTP contract.

type Mode = "user" | "admin";

// Create an event. mode="user" enqueues for review; mode="admin"
// publishes immediately. Auth → Zod → SECURITY DEFINER RPC.
export async function submitEvent(args: { mode: Mode; payload: unknown; turnstileToken?: string }): Promise<Result> {
  const { user, isAdmin, status, supabase } = await getActionAuth();
  if (!user) return err("You must be signed in to post an event.");
  if (args.mode === "admin" && !isAdmin) return err("Admin access required.");
  if (args.mode === "user" && !isAdmin && status !== "approved") {
    return err("Your membership must be approved before you can post.");
  }
  if (args.mode === "user") {
    if (!(await verifyTurnstile(args.turnstileToken))) {
      return err("Verification failed. Please complete the challenge and try again.");
    }
    if (!(await allow("submit", user.id))) {
      return err("You're posting too frequently. Please try again later.");
    }
  }

  const parsed = validate(eventSchema, args.payload);
  if (!parsed.ok) return parsed;
  const p = parsed.data;

  const rpc = args.mode === "admin" ? "admin_create_event" : "submit_event";
  const { error } = await supabase.rpc(rpc, {
    p_title:                 p.title,
    p_description:           p.description,
    p_luma_link:             p.lumaLink,
    p_event_at:              p.eventAtIso,
    p_location:              p.location,
    p_organiser_name:        p.organiserName,
    p_contact_email:         p.contactEmail,
    p_contact_email_visible: p.contactEmailVisible,
  });
  if (error) return err(describeSupabaseError(error));

  revalidatePath("/events");
  if (args.mode === "admin") revalidatePath("/admin/events");
  return ok();
}

export async function updateOwnEvent(id: string, payload: unknown): Promise<Result> {
  const { user, supabase } = await getActionAuth();
  if (!user) return err("You must be signed in.");

  const parsed = validate(eventSchema, payload);
  if (!parsed.ok) return parsed;
  const p = parsed.data;

  // RLS gates the update to posted_by=auth.uid() AND status='pending'.
  // We still surface a 0-row response as "not found / no longer
  // editable" so the caller can show a meaningful message.
  const { error, count } = await supabase
    .from("events")
    .update({
      title:                 p.title,
      description:           p.description,
      luma_link:             p.lumaLink,
      event_at:              p.eventAtIso,
      location:              p.location,
      organiser_name:        p.organiserName,
      contact_email:         p.contactEmail,
      contact_email_visible: p.contactEmailVisible,
    }, { count: "exact" })
    .eq("id", id);

  if (error) return err(describeSupabaseError(error));
  if (!count) return err("Event not found, or it's already been approved (only pending events can be edited).");

  revalidatePath("/my-submissions");
  revalidatePath("/events");
  return ok();
}
