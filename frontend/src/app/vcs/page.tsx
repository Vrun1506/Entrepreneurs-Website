import { Suspense } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import ListingPageShell from "@/components/ListingPageShell";
import { requireApprovedUser } from "@/lib/auth/guard";
import { markedListingIds } from "@/lib/listings/actionRow";
import { cached } from "@/lib/cache";
import { Skeleton, FilterBarSkeleton, RowListSkeleton } from "@/components/ui/Skeleton";
import type { Database } from "@/lib/database.overrides";
import VcsClient from "./VcsClient";

export default async function VcsPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { supabase, isAdmin } = await requireApprovedUser();
  const justSubmitted = (await searchParams)?.submitted === "1";

  // Started here but deliberately not awaited: the page returns immediately
  // so the nav and page header reach the browser while the query is still
  // running. Both consumers below await the *same* promise, so it stays one
  // query, and they resolve in the same tick — the count and the list swap
  // in together rather than flickering one after the other.
  const data = loadVcs(supabase, isAdmin);

  return (
    <ListingPageShell
      active="vcs"
      isAdmin={isAdmin}
      justSubmitted={justSubmitted}
      submittedKind="VC/grant"
      eyebrow="Grants & VCs"
      title="Funding for Foundry founders"
      summary={
        <Suspense fallback={<Skeleton className="h-3 w-36" />}>
          <VcCount data={data} />
        </Suspense>
      }
      cta={{ href: "/vcs/new", label: "Suggest a VC or grant →" }}
    >
      <Suspense
        fallback={
          <>
            <FilterBarSkeleton />
            <RowListSkeleton className="mt-8" />
          </>
        }
      >
        <VcList data={data} />
      </Suspense>
    </ListingPageShell>
  );
}

type VcsData = {
  items: ReturnType<typeof toVc>[];
  appliedIds: string[];
};

async function loadVcs(
  supabase: SupabaseClient<Database>,
  isAdmin: boolean,
): Promise<VcsData> {
  // Only the listing rows are cached. They are identical for every
  // approved member — vcs_grants carries no per-caller masking, unlike
  // opportunities and events, whose contact_email depends on who is
  // asking and which is why those two lists are not cached at all.
  //
  // get_my_listing_actions is per-user by definition and is always read
  // live; putting it inside the cached call would show one member another
  // member's "applied" pills.
  const [items, actionsRes] = await Promise.all([
    cached(
      "vcs",
      async () => {
        const res = await supabase
          .from("vcs_grants")
          .select(`
            id, kind, name, description, link,
            amount, deadline, stage,
            posted_by, created_at,
            profiles:posted_by ( first_name, surname )
          `)
          .eq("status", "approved")
          .order("created_at", { ascending: false });
        if (res.error) console.error("Failed to load vcs_grants:", res.error);
        return ((res.data ?? []) as unknown as RawRow[]).map(toVc);
      },
      // Don't cache an empty result: the loader falls back to [] on a
      // Supabase error, and pinning that would blank the page for the TTL.
      { skip: isAdmin, isCacheable: (rows) => rows.length > 0 },
    ),
    supabase.rpc("get_my_listing_actions"),
  ]);

  if (actionsRes.error) console.error("Failed to load listing actions:", actionsRes.error);

  return {
    items,
    appliedIds: markedListingIds(actionsRes.data, "vc_grant", "applied"),
  };
}

async function VcCount({ data }: { data: Promise<VcsData> }) {
  const { items } = await data;
  return <>{items.length} active listing{items.length === 1 ? "" : "s"}.</>;
}

async function VcList({ data }: { data: Promise<VcsData> }) {
  const { items, appliedIds } = await data;
  return <VcsClient items={items} appliedIds={appliedIds} />;
}

// The double-cast in the loader survives the move to generated types on
// purpose. supabase-js infers an embedded relation as an array, but
// PostgREST returns a single object for a many-to-one FK like posted_by —
// and the multi-line select string also defeats its type-level parser,
// degrading every scalar to `any`. The real fix is a flat RPC, as
// list_approved_opportunities/_events already use.
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

function toVc(r: RawRow) {
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
