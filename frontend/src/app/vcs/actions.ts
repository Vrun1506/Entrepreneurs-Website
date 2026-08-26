"use server";

import { revalidatePath } from "next/cache";
import { describeSupabaseError } from "@/lib/supabaseErrors";
import type { Result } from "@/lib/result";
import { ok, err } from "@/lib/result";
import { getActionAuth } from "@/lib/auth/actionAuth";
import { guardSubmission, type SubmissionMode } from "@/lib/actions/guardSubmission";
import { vcGrantSchema, validate } from "@/lib/validation/listings";

// User-facing actions for VCs / grants. Admin actions live in
// /admin/vcs/actions.ts.

// Create a VC / grant listing. Auth → Zod → SECURITY DEFINER RPC.
export async function submitVcGrant(args: { mode: SubmissionMode; payload: unknown; turnstileToken?: string }): Promise<Result> {
  const guard = await guardSubmission({ mode: args.mode, noun: "a listing", turnstileToken: args.turnstileToken });
  if (!guard.ok) return guard;
  const { supabase } = guard.data;

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

  // Ownership and status='pending' are re-checked inside the RPC, which
  // raises 42501 with a message written for the user — describeSupabaseError
  // passes those through. RLS still gates the table underneath.
  const { error } = await supabase.rpc("update_vc_grant", {
    p_id:          id,
    p_kind:        p.kind,
    p_name:        p.name,
    p_description: p.description,
    p_link:        p.link,
    p_amount:      p.amount,
    p_deadline:    p.deadline,
    p_stage:       p.stage,
  });
  if (error) return err(describeSupabaseError(error));

  revalidatePath("/my-submissions");
  revalidatePath("/vcs");
  return ok();
}
