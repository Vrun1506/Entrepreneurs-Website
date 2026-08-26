import "server-only";
import type { BulkResult } from "@/app/admin/bulkTypes";
import type { Result } from "@/lib/result";

// Runs a single-item admin action across a selection, one at a time, and
// reports how many landed. Sequential on purpose: each item's action hits
// a SECURITY DEFINER RPC and (for rejections) sends an email, so firing
// them in parallel would multiply the load for no user-visible gain on a
// selection this size.
//
// A failure doesn't abort the rest — a bad row shouldn't strand the ones
// after it in the queue — so the caller gets counts plus the first error
// rather than a single pass/fail.
//
// Lived byte-identically in all three admin actions files before this.
export async function runBulk(
  ids: string[],
  one: (id: string) => Promise<Result>,
): Promise<BulkResult> {
  let succeeded = 0;
  const errors: string[] = [];
  for (const id of ids) {
    const r = await one(id);
    if (r.ok) succeeded++;
    else errors.push(r.error);
  }
  return { ok: true, succeeded, failed: errors.length, firstError: errors[0] };
}
