"use server";

import { after } from "next/server";
import { getActionAuth } from "@/lib/auth/actionAuth";
import { check } from "@/lib/ratelimit";
import { ok, err, type Result } from "@/lib/result";
import { describeSupabaseError } from "@/lib/supabaseErrors";
import {
  issueTicket,
  gatewayUploadUrl,
  uploadsEnabled,
  MAX_UPLOAD_BYTES,
} from "@/lib/storage/uploadTicket";
import { blobsExist, downloadCvBytes, signedCvUrl } from "@/lib/storage/blobRead";
import { extractCvText } from "@/lib/cv/extractText";
import { matchSkillsInText } from "@/lib/cv/matchSkills";
import { listSkillsDetailed } from "@/lib/data/taxonomy";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.overrides";
import * as Sentry from "@sentry/nextjs";

// ════════════════════════════════════════════════════════════════════
// Foundry · Profile media — avatar and CV upload/removal
//
// Mirrors community/actions.ts's upload-ticket pattern exactly: this file
// decides WHO may upload (approved member, rate limit) using the same
// guards that already exist, then hands the browser a short-lived ticket
// so bytes go straight to the gateway without passing through Vercel. The
// gateway decides WHAT may be stored; see server/app/documents.py and
// server/app/images.py.
//
// issue_upload_ticket also checks posting_enabled() — the community kill
// switch — but ONLY for purpose='post_image' (20260901000008). A member
// setting a profile photo or uploading a CV has nothing to do with
// whether the community feed is currently open, so that check does not
// apply here and these actions never need to touch it.
// ════════════════════════════════════════════════════════════════════

async function guardApprovedMember(noun: string) {
  const { user, isAdmin, status, supabase } = await getActionAuth();
  if (!user) return err(`You must be signed in to ${noun}.`);
  if (!isAdmin && status !== "approved") {
    return err("Your membership must be approved before you can do that.");
  }
  return ok({ supabase, user });
}

async function guardRate(bucket: "avatarUpload" | "cvUpload", userId: string, limitedMessage: string) {
  const decision = await check(bucket, userId);
  if (decision === "limited") return err(limitedMessage);
  if (decision === "unavailable") {
    // Fails CLOSED, matching every other upload-ticket bucket in this
    // codebase: an Upstash outage refuses the upload rather than silently
    // exceeding a limit nobody could then explain.
    Sentry.captureMessage(
      `${bucket} rate-limit bucket unreachable — uploads are being refused (fail-closed)`,
      { level: "error", tags: { bucket, surface: "profile-media" } },
    );
    return err("We can't accept this right now. Please try again in a few minutes.");
  }
  return ok();
}

// ─── Avatar ─────────────────────────────────────────────────────────

export async function requestAvatarTicket(): Promise<
  Result<{ token: string; key: string; uploadUrl: string; maxBytes: number }>
> {
  if (!uploadsEnabled()) return err("Photo upload is unavailable right now.");

  const guard = await guardApprovedMember("upload a photo");
  if (!guard.ok) return guard;
  const { supabase, user } = guard.data;

  const rate = await guardRate(
    "avatarUpload",
    user.id,
    "You've uploaded a lot of photos today. Try again tomorrow.",
  );
  if (!rate.ok) return rate;

  const { data, error } = await supabase.rpc("issue_upload_ticket", { p_purpose: "profile_picture" });
  if (error) return err(describeSupabaseError(error));
  if (!data) return err("Could not start the upload. Please try again.");

  return ok({
    token: issueTicket({ userId: user.id, key: data, purpose: "profile_picture" }),
    key: data,
    uploadUrl: gatewayUploadUrl("profile_picture"),
    maxBytes: MAX_UPLOAD_BYTES,
  });
}

/**
 * Confirm a photo that was uploaded to `key` should become the caller's
 * avatar. Verifies the blob actually exists before writing — the database
 * knows a ticket was issued, not that bytes were written (see
 * blobRead.blobsExist's own comment for the identical reasoning on posts).
 */
export async function confirmAvatarUpload(key: string): Promise<Result> {
  const guard = await guardApprovedMember("update your photo");
  if (!guard.ok) return guard;
  const { supabase } = guard.data;

  if (!(await blobsExist([key], "profile_picture"))) {
    return err("That upload didn't finish. Please try again.");
  }

  const { error } = await supabase.rpc("confirm_avatar_upload", { p_blob_key: key });
  if (error) return err(describeSupabaseError(error));
  return ok();
}

export async function removeAvatar(): Promise<Result> {
  const guard = await guardApprovedMember("remove your photo");
  if (!guard.ok) return guard;
  const { supabase } = guard.data;

  const { error } = await supabase.rpc("remove_my_avatar");
  if (error) return err(describeSupabaseError(error));
  return ok();
}

// ─── CV ─────────────────────────────────────────────────────────────

export async function requestCvTicket(): Promise<
  Result<{ token: string; key: string; uploadUrl: string; maxBytes: number }>
> {
  if (!uploadsEnabled()) return err("CV upload is unavailable right now.");

  const guard = await guardApprovedMember("upload a CV");
  if (!guard.ok) return guard;
  const { supabase, user } = guard.data;

  const rate = await guardRate(
    "cvUpload",
    user.id,
    "You've uploaded a lot of files today. Try again tomorrow.",
  );
  if (!rate.ok) return rate;

  const { data, error } = await supabase.rpc("issue_upload_ticket", { p_purpose: "cv" });
  if (error) return err(describeSupabaseError(error));
  if (!data) return err("Could not start the upload. Please try again.");

  return ok({
    token: issueTicket({ userId: user.id, key: data, purpose: "cv" }),
    key: data,
    uploadUrl: gatewayUploadUrl("cv"),
    maxBytes: MAX_UPLOAD_BYTES,
  });
}

/**
 * Runs after confirmCvUpload's response has already been sent — see
 * next/server's after(). Downloads the CV, extracts its text, matches it
 * against the closed skills taxonomy, and persists the ids to
 * cv_suggested_skill_ids for the Skills screen (a few steps later in the
 * same intake flow) to pick up. The text itself never leaves this
 * function: it is read once, matched, and discarded — see
 * lib/cv/extractText.ts and lib/cv/matchSkills.ts for why this is
 * deterministic rather than LLM-based.
 *
 * Uses the same request-scoped, cookie-bound `supabase` client
 * confirmCvUpload authenticated with — after() runs in the same
 * invocation before it is torn down, so auth.uid() inside
 * set_cv_suggested_skills is still this member, not a service role.
 *
 * A failed or empty extraction (scanned PDF, unsupported layout, parse
 * error) degrades to no suggestions — this is best-effort background
 * work with nothing left to report a failure to.
 */
async function prefillCvSkillsInBackground(
  supabase: SupabaseClient<Database>,
  key: string,
): Promise<void> {
  try {
    const bytes = await downloadCvBytes(key);
    if (!bytes) return;

    const text = await extractCvText(bytes);
    if (!text) return;

    const taxonomy = await listSkillsDetailed(supabase);
    if (taxonomy.length === 0) return;

    const suggestedSkillIds = matchSkillsInText(
      text,
      taxonomy.map((s) => ({ id: s.id, name: s.name, aliases: s.aliases ?? [] })),
    );
    if (suggestedSkillIds.length === 0) return;

    const { error } = await supabase.rpc("set_cv_suggested_skills", { p_skill_ids: suggestedSkillIds });
    if (error) throw error;
  } catch (e) {
    // The CV is already saved — a parsing hiccup here must not look like
    // the upload itself failed, and there is no request left to tell.
    Sentry.captureException(e, { tags: { surface: "cv-skill-prefill" } });
  }
}

/**
 * Confirms the upload and returns immediately. If the member ticked the
 * parsing consent box, the text extraction and skill matching happen in
 * after() — see prefillCvSkillsInBackground — instead of blocking this
 * request, since downloading and parsing a CV is the slowest step in the
 * whole intake flow and has nothing to do with whether the upload itself
 * succeeded.
 */
export async function confirmCvUpload(
  key: string,
  filename: string,
  consent: boolean,
): Promise<Result> {
  const guard = await guardApprovedMember("update your CV");
  if (!guard.ok) return guard;
  const { supabase } = guard.data;

  if (!(await blobsExist([key], "cv"))) {
    return err("That upload didn't finish. Please try again.");
  }

  const { error } = await supabase.rpc("confirm_cv_upload", {
    p_blob_key: key,
    p_filename: filename,
    p_consent: consent,
  });
  if (error) return err(describeSupabaseError(error));

  if (consent) {
    after(() => prefillCvSkillsInBackground(supabase, key));
  }

  return ok();
}

export async function removeCv(): Promise<Result> {
  const guard = await guardApprovedMember("remove your CV");
  if (!guard.ok) return guard;
  const { supabase } = guard.data;

  const { error } = await supabase.rpc("remove_my_cv");
  if (error) return err(describeSupabaseError(error));
  return ok();
}

/**
 * A short-lived download URL for the caller's own CV, or null if they
 * have none. get_my_cv_info() is SECURITY DEFINER and scoped to
 * auth.uid() — there is no parameter naming a different member, which is
 * what makes this safe to call with no further check here.
 */
export async function getMyCvDownloadUrl(): Promise<Result<string | null>> {
  const guard = await guardApprovedMember("view your CV");
  if (!guard.ok) return guard;
  const { supabase } = guard.data;

  const { data, error } = await supabase.rpc("get_my_cv_info").maybeSingle();
  if (error) return err(describeSupabaseError(error));
  if (!data?.cv_path) return ok(null);

  const url = await signedCvUrl(data.cv_path);
  return ok(url);
}

/**
 * The suggestions confirmCvUpload's background extraction persisted for
 * the caller's own CV, or [] if there are none yet (extraction still
 * running, no consent given, or nothing matched). Same auth.uid()-scoped
 * RPC as getMyCvDownloadUrl above.
 */
export async function getMySuggestedCvSkillIds(): Promise<Result<number[]>> {
  const guard = await guardApprovedMember("view your CV");
  if (!guard.ok) return guard;
  const { supabase } = guard.data;

  const { data, error } = await supabase.rpc("get_my_cv_info").maybeSingle();
  if (error) return err(describeSupabaseError(error));
  return ok(data?.cv_suggested_skill_ids ?? []);
}

/**
 * The admin equivalent — a short-lived download URL for ANY member's CV,
 * logged on every call via admin_log_cv_access. Access is permitted
 * (abuse handling, DSARs) but never silent.
 */
export async function adminGetCvDownloadUrl(profileId: string): Promise<Result<string | null>> {
  const { user, isAdmin, supabase } = await getActionAuth();
  if (!user) return err("You must be signed in.");
  if (!isAdmin) return err("Admin access required.");

  const { data, error } = await supabase.rpc("admin_get_cv_info", { p_profile_id: profileId }).maybeSingle();
  if (error) return err(describeSupabaseError(error));
  if (!data?.cv_path) return ok(null);

  // Logged before the URL is handed back, not after — a crash between
  // minting the URL and logging it must not produce an unlogged access.
  const { error: logError } = await supabase.rpc("admin_log_cv_access", { p_profile_id: profileId });
  if (logError) {
    Sentry.captureException(logError, { tags: { surface: "admin-cv-access-log" } });
    return err("Could not verify access. Please try again.");
  }

  const url = await signedCvUrl(data.cv_path);
  return ok(url);
}
