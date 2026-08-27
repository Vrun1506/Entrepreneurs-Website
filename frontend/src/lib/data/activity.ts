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
