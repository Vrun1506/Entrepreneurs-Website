import { createClient } from "@/lib/supabase/client";

// ════════════════════════════════════════════════════════════════════
// Foundry · Lightweight engagement tracking
//
// Fire-and-forget recording of listing interactions used to show
// posters how their content is performing on /my-submissions. The
// underlying RPC is best-effort: a failure here never blocks the
// user-facing action that triggered it.
//
// Per-event-type semantics:
//   * expand         — user opened the details panel of a card
//   * apply_click    — user clicked the apply button on an opportunity
//   * contact_click  — user clicked a poster's contact email
//   * external_click — user clicked through to Luma / VC site
// ════════════════════════════════════════════════════════════════════

export type ListingKind = "opportunity" | "event" | "vc_grant";
export type ListingEventType =
  | "expand"
  | "apply_click"
  | "contact_click"
  | "external_click";

let cachedClient: ReturnType<typeof createClient> | null = null;
function client() {
  if (!cachedClient) cachedClient = createClient();
  return cachedClient;
}

export function recordListingEvent(
  kind:      ListingKind,
  id:        string,
  eventType: ListingEventType,
): void {
  // Don't await — tracking failure must not affect UX. The RPC is
  // SECURITY DEFINER so it bypasses RLS but still requires an
  // authenticated session.
  void client().rpc("record_listing_event", {
    p_kind:       kind,
    p_id:         id,
    p_event_type: eventType,
  });
}
