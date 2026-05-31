"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { describeSupabaseError } from "@/lib/supabaseErrors";
import { getActionAuth } from "@/lib/auth/actionAuth";
import { allow } from "@/lib/ratelimit";
import { verifyTurnstile } from "@/lib/turnstile";
import { opportunitySchema, validate, type OpportunityPayload } from "@/lib/validation/listings";
import { ok, err, type Result } from "@/lib/result";

type Mode = "user" | "admin";

function toRpcParams(p: OpportunityPayload) {
  return {
    p_position_name:         p.positionName,
    p_company:               p.company,
    p_pay:                   p.pay,
    p_location_type:         p.locationType,
    p_location_text:         p.locationText,
    p_description:           p.description,
    p_start_month:           p.startMonth,
    p_start_year:            p.startYear,
    p_application_deadline:  p.applicationDeadline,
    p_contact_email:         p.contactEmail,
    p_contact_email_visible: p.contactEmailVisible,
    p_apply_method:          p.applyMethod,
    p_apply_url:             p.applyUrl,
    p_skill_ids:             p.skillIds,
    p_sector_ids:            p.sectorIds,
  };
}

// Create an opportunity. mode="user" enqueues for review (status=pending);
// mode="admin" publishes immediately. Auth, then Zod, then the RPC — the
// SECURITY DEFINER RPC re-checks the caller as the last line of defence.
export async function submitOpportunity(args: { mode: Mode; payload: unknown; turnstileToken?: string }): Promise<Result> {
  const { user, isAdmin, status, supabase } = await getActionAuth();
  if (!user) return err("You must be signed in to post an opportunity.");
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

  const parsed = validate(opportunitySchema, args.payload);
  if (!parsed.ok) return parsed;

  const rpc = args.mode === "admin" ? "admin_create_opportunity" : "submit_opportunity";
  const { error } = await supabase.rpc(rpc, toRpcParams(parsed.data));
  if (error) return err(describeSupabaseError(error));

  revalidatePath("/opportunities");
  if (args.mode === "admin") revalidatePath("/admin/opportunities");
  return ok();
}

// Edit one of the caller's own pending opportunities. RLS gates the
// update_opportunity RPC to posted_by=auth.uid() AND status='pending'.
export async function updateOwnOpportunity(id: string, payload: unknown): Promise<Result> {
  const { user, supabase } = await getActionAuth();
  if (!user) return err("You must be signed in.");

  const parsed = validate(opportunitySchema, payload);
  if (!parsed.ok) return parsed;

  const { error } = await supabase.rpc("update_opportunity", { p_id: id, ...toRpcParams(parsed.data) });
  if (error) return err(describeSupabaseError(error));

  revalidatePath("/my-submissions");
  revalidatePath("/opportunities");
  return ok();
}

type ToggleResult =
  | { ok: true; bookmarked: boolean }
  | { ok: false; error: string };

export async function toggleOpportunityBookmark(opportunityId: string): Promise<ToggleResult> {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in." };

  // Look up current state — single round trip is cheap and lets us
  // decide insert-vs-delete without relying on the unique-violation
  // error code as control flow.
  const { data: existing, error: lookupErr } = await supabase
    .from("opportunity_bookmarks")
    .select("opportunity_id")
    .eq("user_id", user.id)
    .eq("opportunity_id", opportunityId)
    .maybeSingle();
  if (lookupErr) return { ok: false, error: describeSupabaseError(lookupErr) };

  if (existing) {
    const { error } = await supabase
      .from("opportunity_bookmarks")
      .delete()
      .eq("user_id", user.id)
      .eq("opportunity_id", opportunityId);
    if (error) return { ok: false, error: describeSupabaseError(error) };
    revalidatePath("/my-bookmarks");
    return { ok: true, bookmarked: false };
  }

  const { error } = await supabase
    .from("opportunity_bookmarks")
    .insert({ user_id: user.id, opportunity_id: opportunityId });
  if (error) return { ok: false, error: describeSupabaseError(error) };
  revalidatePath("/my-bookmarks");
  return { ok: true, bookmarked: true };
}
