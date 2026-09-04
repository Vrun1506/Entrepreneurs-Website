import "server-only";
import { rows, type Db } from "./query";
import {
  markedListingIds,
  type ListingKind,
  type ListingActionType,
} from "@/lib/listings/actionRow";

/**
 * Ids of the listings of one kind the current user has self-marked
 * ("applied" / "going"). Every listing page needs exactly this.
 *
 * Deliberately per-user and never cached: get_my_listing_actions is
 * caller-dependent by definition, and serving one member's from a shared
 * cache would show another member's "applied" pills.
 */
export async function markedIds(
  db: Db,
  kind: ListingKind,
  action: ListingActionType,
): Promise<string[]> {
  const data = await rows("get_my_listing_actions", () => db.rpc("get_my_listing_actions"));
  return markedListingIds(data, kind, action);
}

/**
 * One thing the user marked as applied-to or going-to.
 *
 * `occursAt` is null for anything with no date attached — an opportunity
 * whose deadline has been cleared, say. /my-activity lists those happily;
 * /calendar filters them out, because an item with no date has nowhere to
 * sit on a calendar.
 */
export type ActivityItem = {
  listingKind: ListingKind;
  listingId: string;
  actionType: "applied" | "going";
  markedAt: string;
  title: string;
  subtitle: string | null;
  status: string;
  occursAt: string | null;
  url: string | null;
};

type ActivityRow = {
  listing_kind: ListingKind;
  listing_id: string;
  action_type: "applied" | "going";
  marked_at: string;
  title: string;
  subtitle: string | null;
  status: string;
  occurs_at: string | null;
  url: string | null;
};

export function toActivityItem(r: ActivityRow): ActivityItem {
  return {
    listingKind: r.listing_kind,
    listingId:   r.listing_id,
    actionType:  r.action_type,
    markedAt:    r.marked_at,
    title:       r.title,
    subtitle:    r.subtitle,
    status:      r.status,
    occursAt:    r.occurs_at,
    url:         r.url,
  };
}

/**
 * Everything the user has marked, newest first.
 *
 * Read by both /my-activity and /calendar, which each had their own copy
 * of the row type and their own mapping of it.
 */
export async function myActivity(db: Db): Promise<ActivityItem[]> {
  const data = await rows("get_my_activity", () => db.rpc("get_my_activity"));
  return data.map(toActivityItem);
}

/**
 * The view and click counts behind the numbers on /my-submissions.
 *
 * Recorded by the click-tracking path; only other members count, never the
 * poster. Both columns are non-null in the RPC, so no fallback is needed
 * here — the `?? 0` the page used to carry was for rows that cannot exist.
 */
export type ListingStats = { views: number; clicks: number };

/** `kind:id`, the key /my-submissions looks a listing's stats up by. */
export function statsKey(kind: "opportunity" | "event" | "vc_grant", id: string): string {
  return `${kind}:${id}`;
}

/**
 * Stats for every listing the current user posted, keyed by statsKey().
 *
 * A Map rather than an array because there is exactly one consumer and it
 * only ever does a lookup: /my-submissions renders three lists of its own
 * listings and asks this for each row. Returning the array would just move
 * the same Map-building loop back into the page.
 */
export async function myListingStats(
  db: Db,
): Promise<Map<string, ListingStats>> {
  const data = await rows("get_my_listing_stats", () => db.rpc("get_my_listing_stats"));
  return new Map(
    data.map((r) => [
      statsKey(r.listing_kind, r.listing_id),
      { views: r.view_count, clicks: r.click_count },
    ]),
  );
}
