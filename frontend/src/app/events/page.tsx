import ListingPageShell from "@/components/ListingPageShell";
import { requireApprovedUser } from "@/lib/auth/guard";
import { markedListingIds } from "@/lib/listings/actionRow";
import EventsClient from "./EventsClient";

export default async function EventsPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { supabase, isAdmin } = await requireApprovedUser();
  const justSubmitted = (await searchParams)?.submitted === "1";

  // SECURITY DEFINER RPC masks contact_email at the DB layer rather
  // than the application mapper (migration 20260530000002).
  const [evRes, actionsRes] = await Promise.all([
    supabase.rpc("list_approved_events"),
    supabase.rpc("get_my_listing_actions"),
  ]);

  if (evRes.error) console.error("Failed to load events:", evRes.error);
  if (actionsRes.error) console.error("Failed to load listing actions:", actionsRes.error);

  const items = ((evRes.data ?? []) as RpcRow[]).map(toEvent);
  const goingIds = markedListingIds(actionsRes.data, "event", "going");

  return (
    <ListingPageShell
      active="events"
      isAdmin={isAdmin}
      justSubmitted={justSubmitted}
      submittedKind="event"
      eyebrow="Events"
      title="Upcoming Foundry events"
      summary={`${items.length} upcoming event${items.length === 1 ? "" : "s"}.`}
      cta={{ href: "/events/new", label: "Post an event →" }}
    >
      <EventsClient items={items} goingIds={goingIds} />
    </ListingPageShell>
  );
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
