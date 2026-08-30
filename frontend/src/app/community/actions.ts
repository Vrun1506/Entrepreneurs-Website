"use server";

import { revalidatePath } from "next/cache";
import * as Sentry from "@sentry/nextjs";
import { getActionAuth, requireAdmin } from "@/lib/auth/actionAuth";
import { check, type RateBucket } from "@/lib/ratelimit";
import { ok, err, type Result } from "@/lib/result";
import { describeSupabaseError } from "@/lib/supabaseErrors";
import { sendPostTakedownEmail } from "@/lib/email";
import { postSchema, reportSchema, validatePost } from "@/lib/validation/posts";
import { issueTicket, gatewayUrl, uploadsEnabled, MAX_UPLOAD_BYTES } from "@/lib/storage/uploadTicket";
import { blobsExist } from "@/lib/storage/blobRead";
import { communityFeedPage, myPostsPage, decodeCursor } from "@/lib/data/posts";
import { toFeedView, toMyPostView, type FeedPostView, type MyPostView } from "./feedView";

// ════════════════════════════════════════════════════════════════════
// Foundry · Community post actions
//
// The Community feed publishes without review, so these actions are the
// only gate between a member and ~2,000 readers. Each one runs the same
// three checks in the same order — identity, then membership, then abuse
// controls — mirroring lib/actions/guardSubmission.ts.
//
// Turnstile is NOT used here, unlike listing submission. Turnstile guards
// surfaces a bot can reach (signup, login, the anonymous contact form) and
// listings, which one member submits every few days. A feed is meant to be
// used repeatedly by an already-authenticated, already-approved member, and
// a CAPTCHA on every post would suppress exactly the activity the feature
// needs. The rate limits below are the control instead.
// ════════════════════════════════════════════════════════════════════

/**
 * Identity + approved membership. Never `auth.uid() is not null`: a ban here
 * is `status = 'rejected'` and GoTrue's banned_until can take an hour to
 * invalidate an already-issued JWT, so a just-banned member still arrives
 * with a perfectly valid session.
 */
async function guardMember(noun: string) {
  const { user, isAdmin, status, supabase } = await getActionAuth();
  if (!user) return err(`You must be signed in to ${noun}.`);
  if (!isAdmin && status !== "approved") {
    return err("Your membership must be approved before you can post.");
  }
  return ok({ supabase, user, isAdmin });
}

/**
 * Rate limit with all three outcomes handled.
 *
 * "limited" and "unavailable" are the same answer to the request and a
 * completely different answer to the person. These buckets fail CLOSED, so
 * an Upstash outage refuses posts — reporting that as "you're posting too
 * frequently" would be false, would blame the member for an outage, and
 * would make the failure indistinguishable from the feature working.
 */
async function guardRate(bucket: RateBucket, userId: string, limitedMessage: string) {
  const decision = await check(bucket, userId);
  if (decision === "limited") return err(limitedMessage);
  if (decision === "unavailable") {
    Sentry.captureMessage(
      `${bucket} rate-limit bucket unreachable — community writes are being refused (fail-closed)`,
      { level: "error", tags: { bucket, surface: "community" } },
    );
    return err("We can't accept this right now. Please try again in a few minutes.");
  }
  return ok();
}

// ─── Upload ticket ──────────────────────────────────────────────────
// Authorises the upload here, in Next.js, using the guards that already
// exist — then hands the browser a 5-minute token so the bytes can go
// straight to the gateway without passing through Vercel.
export async function requestUploadTicket(): Promise<
  Result<{ token: string; key: string; uploadUrl: string; maxBytes: number }>
> {
  if (!uploadsEnabled()) return err("Image upload is unavailable right now.");

  const guard = await guardMember("upload an image");
  if (!guard.ok) return guard;
  const { supabase, user } = guard.data;

  // Its own bucket, not the posting one. Sharing meant a two-image post
  // spent three tokens out of ten, so the effective limit for anyone
  // posting pictures was three a day — and re-attaching a different image
  // spent another without publishing anything. What has to be capped at ten
  // is posts reaching the feed, and create_post caps that.
  const rate = await guardRate(
    "communityUpload",
    user.id,
    "You've attached a lot of images today. Try again tomorrow.",
  );
  if (!rate.ok) return rate;

  const { data, error } = await supabase.rpc("issue_upload_ticket", { p_purpose: "post_image" });
  if (error) return err(describeSupabaseError(error));
  if (!data) return err("Could not start the upload. Please try again.");

  return ok({
    token: issueTicket({ userId: user.id, key: data }),
    key: data,
    uploadUrl: `${gatewayUrl()}/v1/images`,
    maxBytes: MAX_UPLOAD_BYTES,
  });
}

// ─── Create ─────────────────────────────────────────────────────────
// Returns the created post so the client can prepend it to the feed it is
// already showing.
//
// The alternative — revalidatePath plus router.refresh() — does not work
// here, and the E2E suite caught it: the feed component seeds useState from
// its props, and React ignores prop changes after mount, so a refreshed
// server render never reached the list. Returning the row means the new card
// appears because the client was told about it, not because a re-render
// happened to land.
export async function createPost(payload: unknown): Promise<Result<FeedPostView>> {
  const guard = await guardMember("post");
  if (!guard.ok) return guard;
  const { supabase, user } = guard.data;

  const parsed = validatePost(postSchema, payload);
  if (!parsed.ok) return parsed;

  const rate = await guardRate(
    "communityPost",
    user.id,
    "You've reached the daily posting limit. Try again tomorrow.",
  );
  if (!rate.ok) return rate;

  // The database knows a ticket was ISSUED; it cannot know whether bytes
  // were ever written. Without this, a client could submit a key it never
  // uploaded to and publish a post with a permanently broken image.
  const keys = parsed.data.images.map((i) => i.blob_key);
  if (keys.length > 0 && !(await blobsExist(keys))) {
    return err("One of your images didn't finish uploading. Please re-attach it.");
  }

  const { data, error } = await supabase.rpc("create_post", {
    p_title: parsed.data.title,
    p_body: parsed.data.body,
    p_images: parsed.data.images,
  });
  if (error) return err(describeSupabaseError(error));

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return err("The post was saved but could not be displayed. Refresh to see it.");

  // Signed here rather than in the browser: the read credential is
  // server-side only, and the SAS expires, so the URL has to be minted at
  // the moment it is handed over.
  const [view] = await toFeedView([
    {
      id: row.id,
      kind: "member" as const,
      title: parsed.data.title,
      body: parsed.data.body,
      createdAt: row.created_at,
      expiresAt: row.expires_at,
      authorId: user.id,
      authorName: [row.author_first_name, row.author_surname].filter(Boolean).join(" ").trim() || "You",
      authorRole: row.author_role,
      sourceTable: null,
      sourceId: null,
      images: parsed.data.images.map((i) => ({
        blobKey: i.blob_key,
        altText: i.alt_text,
        width: i.width,
        height: i.height,
      })),
    },
  ]);

  revalidatePath("/community");
  revalidatePath("/community/mine");
  return ok(view);
}

// ─── Delete (author) ────────────────────────────────────────────────
export async function deleteMyPost(postId: string): Promise<Result> {
  const { user, supabase } = await getActionAuth();
  if (!user) return err("You must be signed in.");

  const { error } = await supabase.rpc("delete_my_post", { p_post_id: postId });
  if (error) return err(describeSupabaseError(error));

  revalidatePath("/community");
  revalidatePath("/community/mine");
  return ok();
}

// ─── Delete (admin, with reason + notice) ───────────────────────────
// The RPC returns the author's identity because the delete cascades it
// away — capturing it afterwards is impossible, which is why
// reject_opportunity has the same shape.
//
// Once the database write has committed, an email failure is reported
// without pretending the removal didn't happen. That is why revalidatePath
// runs on every exit path.
export async function adminDeletePost(postId: string, reason: string): Promise<Result> {
  const trimmed = reason.trim();
  if (!trimmed) return err("A reason is required — it is sent to the author.");

  const auth = await requireAdmin();
  if (!auth.ok) return err(auth.error);

  const { data, error } = await auth.supabase.rpc("admin_delete_post", {
    p_post_id: postId,
    p_reason: trimmed,
  });
  if (error) return err(describeSupabaseError(error));

  const row = Array.isArray(data) ? data[0] : data;

  if (!row?.email) {
    // The post is gone and the moderation record is written; only the
    // notice is missing. Worth a log, not worth failing the action.
    console.warn("admin_delete_post returned no author email for post:", postId);
    revalidatePath("/community");
    revalidatePath("/admin/reports");
    return ok();
  }

  try {
    await sendPostTakedownEmail({
      to: row.email,
      firstName: row.first_name ?? null,
      postTitle: row.title,
      postedAt: new Date(row.posted_at),
      reason: trimmed,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    revalidatePath("/community");
    revalidatePath("/admin/reports");
    return err(`Post removed, but the notice email failed to send: ${msg}`);
  }

  revalidatePath("/community");
  revalidatePath("/admin/reports");
  return ok();
}

// ─── Load more ──────────────────────────────────────────────────────
// Keyset paging, driven from the client so a longer scroll appends rather
// than replacing the page. The cursor is decoded defensively — it arrives
// from the browser, and a bad one means "start at the top", never an error.
export async function loadMoreFeed(
  cursor: string,
): Promise<Result<{ posts: FeedPostView[]; nextCursor: string | null }>> {
  const guard = await guardMember("view the feed");
  if (!guard.ok) return guard;

  const decoded = decodeCursor(cursor);
  if (!decoded) return err("Couldn't load more posts. Refresh the page to start again.");

  const page = await communityFeedPage(guard.data.supabase, decoded);
  return ok({ posts: await toFeedView(page.posts), nextCursor: page.nextCursor });
}

export async function loadMoreMyPosts(
  cursor: string,
): Promise<Result<{ posts: MyPostView[]; nextCursor: string | null }>> {
  const guard = await guardMember("view your posts");
  if (!guard.ok) return guard;

  const decoded = decodeCursor(cursor);
  if (!decoded) return err("Couldn't load more posts. Refresh the page to start again.");

  const page = await myPostsPage(guard.data.supabase, decoded);
  return ok({ posts: await toMyPostView(page.posts), nextCursor: page.nextCursor });
}

// ─── Report ─────────────────────────────────────────────────────────
export async function reportPost(payload: unknown): Promise<Result> {
  const guard = await guardMember("report a post");
  if (!guard.ok) return guard;
  const { supabase, user } = guard.data;

  const parsed = validatePost(reportSchema, payload);
  if (!parsed.ok) return parsed;

  const rate = await guardRate(
    "postReport",
    user.id,
    "You've reported several posts today. If something urgent needs attention, email us.",
  );
  if (!rate.ok) return rate;

  const { error } = await supabase.rpc("report_post", {
    p_post_id: parsed.data.postId,
    p_category: parsed.data.category,
    p_reason: parsed.data.reason,
  });
  if (error) return err(describeSupabaseError(error));

  revalidatePath("/admin/reports");
  return ok();
}
