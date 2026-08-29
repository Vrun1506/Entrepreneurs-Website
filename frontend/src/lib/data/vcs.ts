import "server-only";
import { cached } from "@/lib/cache";
import { rows, maybeRow, type Db } from "./query";

export type Vc = {
  id: string;
  kind: "vc" | "grant";
  name: string;
  description: string;
  link: string;
  amount: string | null;
  deadline: string | null;
  stage: string | null;
  postedBy: { firstName: string; surname: string };
};

// The double-cast in the loader below survives on purpose. supabase-js
// infers an embedded relation as an array, but PostgREST returns a single
// object for a many-to-one FK like posted_by — and the multi-line select
// string also defeats its type-level parser, degrading every scalar to
// `any`. The real fix is a flat RPC, as list_approved_opportunities and
// list_approved_events already use.
//
// It stays at the call site rather than inside rows() so it is visible:
// this is the one read in the app whose row type is not checked against
// the generated schema.
type RawRow = {
  id: string;
  kind: "vc" | "grant";
  name: string;
  description: string;
  link: string;
  amount: string | null;
  deadline: string | null;
  stage: string | null;
  posted_by: string;
  created_at: string;
  profiles: { first_name: string; surname: string } | null;
};

export function toVc(r: RawRow): Vc {
  return {
    id: r.id,
    kind: r.kind,
    name: r.name,
    description: r.description,
    link: r.link,
    amount: r.amount,
    deadline: r.deadline,
    stage: r.stage,
    postedBy: {
      firstName: r.profiles?.first_name ?? "",
      surname:   r.profiles?.surname    ?? "",
    },
  };
}

/**
 * Approved VC/grant listings.
 *
 * Only these rows are cached. They are identical for every approved member
 * — vcs_grants carries no per-caller masking, unlike opportunities and
 * events, whose contact_email depends on who is asking and which is why
 * those two lists are not cached at all.
 *
 * @param isAdmin Admins skip the cache so an approval shows immediately.
 */
export async function listApprovedVcs(db: Db, isAdmin: boolean): Promise<Vc[]> {
  return cached(
    "vcs",
    async () => {
      const data = await rows("vcs_grants (approved)", () =>
        db
          .from("vcs_grants")
          .select(`
            id, kind, name, description, link,
            amount, deadline, stage,
            posted_by, created_at,
            profiles:posted_by ( first_name, surname )
          `)
          .eq("status", "approved")
          .order("created_at", { ascending: false }),
      );
      return (data as unknown as RawRow[]).map(toVc);
    },
    // Don't cache an empty result: the loader falls back to [] on a
    // Supabase error, and pinning that would blank the page for the TTL.
    { skip: isAdmin, isCacheable: (r) => r.length > 0 },
  );
}

/**
 * The one VC/grant the poster is editing, or null.
 *
 * A table read rather than an RPC, so unlike the other two this does not
 * check the poster — it returns posted_by and the caller compares. RLS
 * lets a member read approved rows and their own, so that comparison is
 * what stops someone opening the edit form for a listing they did not
 * post.
 */
export async function vcForEdit(db: Db, id: string) {
  return maybeRow("vcs_grants (for edit)", () =>
    db
      .from("vcs_grants")
      .select("posted_by, status, kind, name, description, link, amount, deadline, stage")
      .eq("id", id)
      .single());
}

/**
 * One approved VC/grant, or null.
 *
 * Reads the same cached list /vcs renders, so a detail view costs nothing
 * extra once the list is warm. `isAdmin` skips the cache for the same
 * reason it does there — an admin should see an approval immediately.
 */
export async function approvedVc(db: Db, id: string, isAdmin: boolean): Promise<Vc | null> {
  const items = await listApprovedVcs(db, isAdmin);
  return items.find((v) => v.id === id) ?? null;
}
