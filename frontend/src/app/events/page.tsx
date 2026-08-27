import { Suspense } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import ListingPageShell from "@/components/ListingPageShell";
import { Skeleton, FilterBarSkeleton, RowListSkeleton } from "@/components/ui/Skeleton";
import type { Database } from "@/lib/database.overrides";
import { requireApprovedUser } from "@/lib/auth/guard";
import { markedListingIds } from "@/lib/listings/actionRow";
import EventsClient from "./EventsClient";
import { reportIfCapped } from "@/lib/supabase/rowCap";

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
  items: ReturnType<typeof toEvent>[];
  goingIds: string[];
};

async function loadEvents(supabase: SupabaseClient<Database>): Promise<EventsData> {
  // SECURITY DEFINER RPC masks contact_email at the DB layer rather
  // than the application mapper (migration 20260530000002). It also
  // filters to event_at >= now(), so this list is bounded by what is
  // actually upcoming rather than by how many events have ever existed.
  const [evRes, actionsRes] = await Promise.all([
    supabase.rpc("list_approved_events"),
    supabase.rpc("get_my_listing_actions"),
  ]);

  if (evRes.error) console.error("Failed to load events:", evRes.error);
  if (actionsRes.error) console.error("Failed to load listing actions:", actionsRes.error);

  return {
    items: reportIfCapped("list_approved_events", (evRes.data ?? []) as RpcRow[]).map(toEvent),
    goingIds: markedListingIds(reportIfCapped("get_my_listing_actions", actionsRes.data ?? []), "event", "going"),
  };
}

async function EventCount({ data }: { data: Promise<EventsData> }) {
  const { items } = await data;
  return <>{items.length} upcoming event{items.length === 1 ? "" : "s"}.</>;
}

async function EventList({ data }: { data: Promise<EventsData> }) {
  const { items, goingIds } = await data;
  return <EventsClient items={items} goingIds={goingIds} />;
}

type RpcRow = {
  id: string;
  title: string;
  description: string;
  luma_link: string;
  event_at: string;
  location: string;
  organiser_name: string;
  contact_email: string | null;
  contact_email_visible: boolean;
  is_society_event: boolean;
  posted_by: string;
  created_at: string;
  poster_first_name: string | null;
  poster_surname: string | null;
  poster_linkedin_url: string | null;
};

function toEvent(r: RpcRow) {
  return {
    id: r.id,
    title: r.title,
    description: r.description,
    lumaLink: r.luma_link,
    eventAt: r.event_at,
    location: r.location,
    organiserName: r.organiser_name,
    contactEmail: r.contact_email,
    isSocietyEvent: r.is_society_event,
    postedBy: {
      firstName:   r.poster_first_name ?? "",
      surname:     r.poster_surname    ?? "",
      linkedinUrl: r.poster_linkedin_url,
    },
  };
}
