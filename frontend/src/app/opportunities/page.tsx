import Link from "next/link";
import { Suspense } from "react";
import ListingPageShell from "@/components/ListingPageShell";
import { Skeleton, FilterBarSkeleton, RowListSkeleton } from "@/components/ui/Skeleton";
import { requireApprovedUser } from "@/lib/auth/guard";
import { markedIds } from "@/lib/data/activity";
import {
  listApprovedOpportunities,
  bookmarkedOpportunityIds,
  type Opportunity,
} from "@/lib/data/opportunities";
import type { Db } from "@/lib/data/query";
import OpportunitiesClient from "./OpportunitiesClient";

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { supabase, user, isAdmin } = await requireApprovedUser();
  const justSubmitted = (await searchParams)?.submitted === "1";

  // Started, not awaited — see the note in app/vcs/page.tsx.
  const data = loadOpportunities(supabase, user.id);

  return (
    <ListingPageShell
      active="opportunities"
      isAdmin={isAdmin}
      justSubmitted={justSubmitted}
      submittedKind="opportunity"
      eyebrow="Opportunities"
      title="Roles from the Foundry network"
      summary={
        <Suspense fallback={<Skeleton className="h-3 w-36" />}>
          <OpportunityCount data={data} />
        </Suspense>
      }
      cta={{ href: "/opportunities/new", label: "Post an opportunity →" }}
      actions={
        <Suspense fallback={<Skeleton className="h-3 w-28" />}>
          <BookmarksLink data={data} />
        </Suspense>
      }
    >
      <Suspense
        fallback={
          <>
            <FilterBarSkeleton />
            <RowListSkeleton className="mt-8" />
          </>
        }
      >
        <OpportunityList data={data} />
      </Suspense>
    </ListingPageShell>
  );
}

type OpportunitiesData = {
  items: Opportunity[];
  bookmarkedIds: string[];
  appliedIds: string[];
};

async function loadOpportunities(supabase: Db, userId: string): Promise<OpportunitiesData> {
  const [items, bookmarkedIds, appliedIds] = await Promise.all([
    listApprovedOpportunities(supabase),
    bookmarkedOpportunityIds(supabase, userId),
    markedIds(supabase, "opportunity", "applied"),
  ]);
  return { items, bookmarkedIds, appliedIds };
}

async function OpportunityCount({ data }: { data: Promise<OpportunitiesData> }) {
  const { items } = await data;
  return <>{items.length} open role{items.length === 1 ? "" : "s"}.</>;
}

async function BookmarksLink({ data }: { data: Promise<OpportunitiesData> }) {
  const { bookmarkedIds } = await data;
  return (
    <Link
      href="/my-bookmarks"
      className="text-[0.8rem] text-text-secondary no-underline transition-colors duration-150 hover:text-gold-light flex items-center gap-1.5"
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
      </svg>
      Your bookmarks{bookmarkedIds.length > 0 ? ` (${bookmarkedIds.length})` : ""}
    </Link>
  );
}

async function OpportunityList({ data }: { data: Promise<OpportunitiesData> }) {
  const { items, bookmarkedIds, appliedIds } = await data;
  return <OpportunitiesClient items={items} bookmarkedIds={bookmarkedIds} appliedIds={appliedIds} />;
}
