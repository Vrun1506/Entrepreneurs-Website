import Link from "next/link";
import ListingPageShell from "@/components/ListingPageShell";
import { requireApprovedUser } from "@/lib/auth/guard";
import { markedListingIds } from "@/lib/listings/actionRow";
import OpportunitiesClient from "./OpportunitiesClient";

export default async function OpportunitiesPage({
  searchParams,
}: {
  searchParams: Promise<{ submitted?: string }>;
}) {
  const { supabase, user, isAdmin } = await requireApprovedUser();
  const justSubmitted = (await searchParams)?.submitted === "1";

  // Go through the SECURITY DEFINER RPC so contact_email is masked in
  // the database, not at the app layer. Migration 20260530000002.
  const [oppsRes, bookmarksRes, actionsRes] = await Promise.all([
    supabase.rpc("list_approved_opportunities"),
    supabase.from("opportunity_bookmarks").select("opportunity_id").eq("user_id", user.id),
    supabase.rpc("get_my_listing_actions"),
  ]);

  if (oppsRes.error) console.error("Failed to load opportunities:", oppsRes.error);
  if (bookmarksRes.error) console.error("Failed to load bookmarks:", bookmarksRes.error);
  if (actionsRes.error) console.error("Failed to load listing actions:", actionsRes.error);

  const items = ((oppsRes.data ?? []) as RpcRow[]).map(toOpportunity);
  const bookmarkedIds = (bookmarksRes.data ?? []).map((r) => r.opportunity_id as string);
  const appliedIds = markedListingIds(actionsRes.data, "opportunity", "applied");

  return (
    <ListingPageShell
      active="opportunities"
      isAdmin={isAdmin}
      justSubmitted={justSubmitted}
      submittedKind="opportunity"
      eyebrow="Opportunities"
      title="Roles from the Foundry network"
      summary={`${items.length} open role${items.length === 1 ? "" : "s"}.`}
      cta={{ href: "/opportunities/new", label: "Post an opportunity →" }}
      actions={
        <Link
          href="/my-bookmarks"
          className="text-[0.8rem] text-text-secondary no-underline transition-colors duration-150 hover:text-gold-light flex items-center gap-1.5"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
          </svg>
          Your bookmarks{bookmarkedIds.length > 0 ? ` (${bookmarkedIds.length})` : ""}
        </Link>
      }
    >
      <OpportunitiesClient items={items} bookmarkedIds={bookmarkedIds} appliedIds={appliedIds} />
    </ListingPageShell>
  );
}

type RpcRow = {
  id: string;
  position_name: string;
  company: string;
  pay: string;
  location_type: "remote" | "hybrid" | "onsite";
  location_text: string | null;
  description: string;
  start_month: number;
  start_year: number;
  application_deadline: string;
  contact_email: string | null;
  contact_email_visible: boolean;
  apply_method: "email" | "link";
  apply_url: string | null;
  posted_by: string;
  created_at: string;
  poster_first_name: string | null;
  poster_surname: string | null;
  poster_linkedin_url: string | null;
  skill_names: string[];
  sector_names: string[];
};

function toOpportunity(r: RpcRow) {
  return {
    id: r.id,
    positionName: r.position_name,
    company: r.company,
    pay: r.pay,
    locationType: r.location_type,
    locationText: r.location_text,
    description: r.description,
    startMonth: r.start_month,
    startYear: r.start_year,
    applicationDeadline: r.application_deadline,
    // contact_email is already masked by the RPC when visibility is off
    // and the caller isn't the poster / admin.
    contactEmail: r.contact_email,
    applyMethod: r.apply_method,
    applyUrl: r.apply_url,
    postedBy: {
      firstName:   r.poster_first_name ?? "",
      surname:     r.poster_surname    ?? "",
      linkedinUrl: r.poster_linkedin_url,
    },
    skills:  r.skill_names  ?? [],
    sectors: r.sector_names ?? [],
  };
}
