"use server";

import { revalidatePath } from "next/cache";
import { describeSupabaseError } from "@/lib/supabaseErrors";
import type { Result } from "@/lib/result";
import { ok, err } from "@/lib/result";
import { getActionAuth } from "@/lib/auth/actionAuth";
import { allow } from "@/lib/ratelimit";
import { verifyTurnstile } from "@/lib/turnstile";
import { vcGrantSchema, validate } from "@/lib/validation/listings";

// User-facing actions for VCs / grants. Admin actions live in
// /admin/vcs/actions.ts.

type Mode = "user" | "admin";

// Create a VC / grant listing. Auth → Zod → SECURITY DEFINER RPC.
export async function submitVcGrant(args: { mode: Mode; payload: unknown; turnstileToken?: string }): Promise<Result> {
  const { user, isAdmin, status, supabase } = await getActionAuth();
  if (!user) return err("You must be signed in to post a listing.");
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

  const parsed = validate(vcGrantSchema, args.payload);
  if (!parsed.ok) return parsed;
  const p = parsed.data;

  const rpc = args.mode === "admin" ? "admin_create_vc_grant" : "submit_vc_grant";
  const { error } = await supabase.rpc(rpc, {
    p_kind:        p.kind,
    p_name:        p.name,
    p_description: p.description,
    p_link:        p.link,
    p_amount:      p.amount,
    p_deadline:    p.deadline,
    p_stage:       p.stage,
  });
  if (error) return err(describeSupabaseError(error));

  revalidatePath("/vcs");
  if (args.mode === "admin") revalidatePath("/admin/vcs");
  return ok();
}

export async function updateOwnVcGrant(id: string, payload: unknown): Promise<Result> {
  const { user, supabase } = await getActionAuth();
  if (!user) return err("You must be signed in.");

  const parsed = validate(vcGrantSchema, payload);
  if (!parsed.ok) return parsed;
  const p = parsed.data;

  // RLS gates the update to posted_by=auth.uid() AND status='pending'.
  const { error, count } = await supabase
    .from("vcs_grants")
    .update({
      kind:        p.kind,
      name:        p.name,
      description: p.description,
      link:        p.link,
      amount:      p.amount,
      deadline:    p.deadline,
      stage:       p.stage,
    }, { count: "exact" })
    .eq("id", id);

  if (error) return err(describeSupabaseError(error));
  if (!count) return err("Listing not found, or it's already been approved (only pending listings can be edited).");

  revalidatePath("/my-submissions");
  revalidatePath("/vcs");
  return ok();
}
