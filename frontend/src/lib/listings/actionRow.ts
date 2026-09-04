import type { ListingKind } from "@/lib/listings/registry";

export type { ListingKind };
export type ListingActionType = "applied" | "going";

/** A row from the get_my_listing_actions RPC. */
export type ActionRow = {
  listing_kind: ListingKind;
  listing_id:   string;
  action_type:  ListingActionType;
  created_at:   string;
};

/**
 * Ids of the listings of one kind the current user has marked. Every
 * listing page needs exactly this, and each had written the same
 * filter-and-map inline.
 */
export function markedListingIds(
  rows: ActionRow[],
  kind: ListingKind,
  action: ListingActionType,
): string[] {
  return rows
    .filter((a) => a.listing_kind === kind && a.action_type === action)
    .map((a) => a.listing_id);
}
