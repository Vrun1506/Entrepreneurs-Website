import { browserClient } from "@/lib/supabase/browser";
import { err, ok, type Result } from "@/lib/result";

// ════════════════════════════════════════════════════════════════════
// Foundry · "Mark as applied / going" client helpers
//
// Talks to the mark_listing_action / unmark_listing_action RPCs in
// migration 20260531000005. The user clicks a pill on a listing card
// to flag "I've applied to this" (opportunities, VC/grants) or "I'm
// going to this" (events). Foundry takes their word for it — there is
// no verification against the external apply / RSVP target.
//
// The pill UI updates optimistically; the RPC failure path returns an
// Err result so the caller can roll back the local state.
// ════════════════════════════════════════════════════════════════════

export type ListingKind = "opportunity" | "event" | "vc_grant";
export type ListingActionType = "applied" | "going";

export function actionFor(kind: ListingKind): ListingActionType {
  return kind === "event" ? "going" : "applied";
}

export function actionLabel(kind: ListingKind, marked: boolean): string {
  if (kind === "event") return marked ? "Going" : "Mark as going";
  return marked ? "Applied" : "Mark as applied";
}

export async function markAction(kind: ListingKind, id: string): Promise<Result> {
  // A rejected promise (network blip, not a Postgrest-shaped {error})
  // used to propagate straight out of here as an unhandled rejection —
  // the caller's `if (!res.ok)` rollback never ran, leaving the pill
  // optimistically flipped and permanently disabled. Catching here fixes
  // it once for every MarkActionPill on the site instead of at each
  // call site.
  try {
    const { error } = await browserClient().rpc("mark_listing_action", {
      p_kind:   kind,
      p_id:     id,
      p_action: actionFor(kind),
    });
    if (error) return err(error.message);
    return ok();
  } catch (e) {
    return err(e instanceof Error ? e.message : "Something went wrong.");
  }
}

export async function unmarkAction(kind: ListingKind, id: string): Promise<Result> {
  try {
    const { error } = await browserClient().rpc("unmark_listing_action", {
      p_kind:   kind,
      p_id:     id,
      p_action: actionFor(kind),
    });
    if (error) return err(error.message);
    return ok();
  } catch (e) {
    return err(e instanceof Error ? e.message : "Something went wrong.");
  }
}
