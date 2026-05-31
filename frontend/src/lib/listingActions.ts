import { createClient } from "@/lib/supabase/client";

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

type Ok  = { ok: true };
type Err = { ok: false; error: string };
export type Result = Ok | Err;

let cachedClient: ReturnType<typeof createClient> | null = null;
function client() {
  if (!cachedClient) cachedClient = createClient();
  return cachedClient;
}

export function actionFor(kind: ListingKind): ListingActionType {
  return kind === "event" ? "going" : "applied";
}

export function actionLabel(kind: ListingKind, marked: boolean): string {
  if (kind === "event") return marked ? "Going" : "Mark as going";
  return marked ? "Applied" : "Mark as applied";
}

export async function markAction(kind: ListingKind, id: string): Promise<Result> {
  const { error } = await client().rpc("mark_listing_action", {
    p_kind:   kind,
    p_id:     id,
    p_action: actionFor(kind),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function unmarkAction(kind: ListingKind, id: string): Promise<Result> {
  const { error } = await client().rpc("unmark_listing_action", {
    p_kind:   kind,
    p_id:     id,
    p_action: actionFor(kind),
  });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
