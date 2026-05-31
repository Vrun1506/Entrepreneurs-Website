import Link from "next/link";
import AppNav from "@/components/AppNav";
import SubmittedBanner from "@/components/SubmittedBanner";
import { requireApprovedUser } from "@/lib/auth/guard";
import EventsClient from "./EventsClient";

type ActionRow = {
  listing_kind: "opportunity" | "event" | "vc_grant";
  listing_id:   string;
  action_type:  "applied" | "going";
  created_at:   string;
};

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
  const goingIds = ((actionsRes.data ?? []) as ActionRow[])
    .filter((a) => a.listing_kind === "event" && a.action_type === "going")
    .map((a) => a.listing_id);

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <AppNav active="events" isApproved={true} isAdmin={isAdmin} />
      <main className="flex-1 px-4 sm:px-8 py-10 sm:py-12">
        <div className="max-w-[1200px] mx-auto">
          {justSubmitted && <SubmittedBanner kind="event" />}
          <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Events</div>
              <h1 className="font-display text-text-primary leading-[1.1] tracking-tight text-[clamp(1.75rem,3.5vw,2.5rem)]">
                Upcoming Foundry events
              </h1>
              <p className="text-[0.875rem] text-text-muted mt-3 leading-relaxed">
                {items.length} upcoming event{items.length === 1 ? "" : "s"}.
              </p>
            </div>
            <Link
              href="/events/new"
              className="px-4 py-2 rounded-full bg-gold text-bg-primary text-[0.825rem] font-medium no-underline transition-colors duration-150 hover:bg-gold-light"
            >
              Post an event →
            </Link>
          </div>
          <EventsClient items={items} goingIds={goingIds} />
        </div>
      </main>
    </div>
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
    postedBy: {
      firstName:   r.poster_first_name ?? "",
      surname:     r.poster_surname    ?? "",
      linkedinUrl: r.poster_linkedin_url,
    },
  };
}
