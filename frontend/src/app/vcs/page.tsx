import { redirect } from "next/navigation";
import { Suspense } from "react";
import ListingPageShell from "@/components/ListingPageShell";
import { Skeleton, FilterBarSkeleton, RowListSkeleton } from "@/components/ui/Skeleton";
import { requireApprovedUser } from "@/lib/auth/guard";
import { markedIds } from "@/lib/data/activity";
import { listApprovedVcs, type Vc } from "@/lib/data/vcs";
import type { Db } from "@/lib/data/query";
import VcsClient from "./VcsClient";

export default async function VcsPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string; v?: string }>;
}) {
  const { supabase, isAdmin } = await requireApprovedUser();
  const sp = await searchParams;

  // /vcs?v=<id> was how a listing was linked to before it had a
  // page of its own. Those links are out in the world — in members'
  // browsers, in whatever they pasted them into — so the param stays, as a
  // redirect to the one canonical address rather than as a second way to
  // read a listing. encodeURIComponent because the id is user input and
  // this builds a path.
  if (sp?.v) redirect(`/vcs/${encodeURIComponent(sp.v)}`);

  const justSubmitted = sp?.submitted === "1";

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
  items: Vc[];
  appliedIds: string[];
};

async function loadVcs(supabase: Db, isAdmin: boolean): Promise<VcsData> {
  // The listing rows are cached; get_my_listing_actions is per-user by
  // definition and is always read live. See lib/data/vcs.ts.
  const [items, appliedIds] = await Promise.all([
    listApprovedVcs(supabase, isAdmin),
    markedIds(supabase, "vc_grant", "applied"),
  ]);
  return { items, appliedIds };
}

async function VcCount({ data }: { data: Promise<VcsData> }) {
  const { items } = await data;
  return <>{items.length} active listing{items.length === 1 ? "" : "s"}.</>;
}

async function VcList({ data }: { data: Promise<VcsData> }) {
  const { items, appliedIds } = await data;
  return <VcsClient items={items} appliedIds={appliedIds} />;
}
