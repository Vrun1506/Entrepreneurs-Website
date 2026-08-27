import { Suspense } from "react";
import ListingPageShell from "@/components/ListingPageShell";
import { Skeleton, FilterBarSkeleton, RowListSkeleton } from "@/components/ui/Skeleton";
import { requireApprovedUser } from "@/lib/auth/guard";
import { markedIds } from "@/lib/data/activity";
import { listApprovedEvents, type FoundryEvent } from "@/lib/data/events";
import type { Db } from "@/lib/data/query";
import EventsClient from "./EventsClient";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { supabase, isAdmin } = await requireApprovedUser();
  const justSubmitted = (await searchParams)?.submitted === "1";

  // Started, not awaited — see the note in app/vcs/page.tsx. One query, two
  // awaits, both resolving in the same tick.
  const data = loadEvents(supabase);

  return (
    <ListingPageShell
      active="events"
      isAdmin={isAdmin}
      justSubmitted={justSubmitted}
      submittedKind="event"
      eyebrow="Events"
      title="Upcoming Foundry events"
      summary={
        <Suspense fallback={<Skeleton className="h-3 w-40" />}>
          <EventCount data={data} />
        </Suspense>
      }
      cta={{ href: "/events/new", label: "Post an event →" }}
    >
      <Suspense
        fallback={
          <>
            <FilterBarSkeleton />
            <RowListSkeleton className="mt-8" />
          </>
        }
      >
        <EventList data={data} />
      </Suspense>
    </ListingPageShell>
  );
}

type EventsData = {
  items: FoundryEvent[];
  goingIds: string[];
};

async function loadEvents(supabase: Db): Promise<EventsData> {
  const [items, goingIds] = await Promise.all([
    listApprovedEvents(supabase),
    markedIds(supabase, "event", "going"),
  ]);
  return { items, goingIds };
}

async function EventCount({ data }: { data: Promise<EventsData> }) {
  const { items } = await data;
  return <>{items.length} upcoming event{items.length === 1 ? "" : "s"}.</>;
}

async function EventList({ data }: { data: Promise<EventsData> }) {
  const { items, goingIds } = await data;
  return <EventsClient items={items} goingIds={goingIds} />;
}
