"use server";

import type { BulkResult } from "@/app/admin/bulkTypes";
import type { Result } from "@/lib/result";
import {
  approveListing, rejectListing, bulkApproveListings, bulkRejectListings,
} from "@/lib/listings/admin";

// Thin "use server" wrappers. The logic lives in lib/listings/admin.ts,
// once for all three types; these exports have to stay because a
// "use server" module's exports *are* its action endpoints, and the
// review cards import them by name.
//
// What differs between the types is in lib/listings/registry.ts.

export async function approveVcGrant(id: string): Promise<Result> {
  return approveListing("vc_grant", id);
}

export async function rejectVcGrant(id: string, reason: string): Promise<Result> {
  return rejectListing("vc_grant", id, reason);
}

export async function bulkApproveVcGrants(ids: string[]): Promise<BulkResult> {
  return bulkApproveListings("vc_grant", ids);
}

export async function bulkRejectVcGrants(ids: string[], reason: string): Promise<BulkResult> {
  return bulkRejectListings("vc_grant", ids, reason);
}
