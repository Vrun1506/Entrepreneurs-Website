import Link from "next/link";
import AppNav from "@/components/AppNav";
import { requireApprovedUser } from "@/lib/auth/guard";
import OpportunitiesClient from "../opportunities/OpportunitiesClient";

export default async function MyBookmarksPage() {
  const { supabase, isAdmin } = await requireApprovedUser();

  // SECURITY DEFINER RPC: contact_email is masked by the database, not
  // the app layer (migration 20260530000002 + 20260530000005).
  const [bookmarkRes, actionsRes] = await Promise.all([
    supabase.rpc("list_my_bookmarked_opportunities"),
    supabase.rpc("get_my_listing_actions"),
  ]);

  if (bookmarkRes.error) console.error("Failed to load bookmarked opportunities:", bookmarkRes.error);
  if (actionsRes.error) console.error("Failed to load listing actions:", actionsRes.error);

  const items = ((bookmarkRes.data ?? []) as RpcRow[]).map(toOpportunity);
  const bookmarkedIds = items.map((i) => i.id);
  const appliedIds = ((actionsRes.data ?? []) as ActionRow[])
    .filter((a) => a.listing_kind === "opportunity" && a.action_type === "applied")
    .map((a) => a.listing_id);

  return (
    <div className="min-h-screen bg-bg-primary flex flex-col">
      <AppNav active="opportunities" isApproved={true} isAdmin={isAdmin} />
      <main className="flex-1 px-4 sm:px-8 py-10 sm:py-12">
        <div className="max-w-[1200px] mx-auto">
          <div className="mb-8 flex items-start justify-between gap-4 flex-wrap">
            <div>
              <div className="text-[0.7rem] text-gold tracking-[0.18em] uppercase mb-2">Bookmarks</div>
              <h1 className="font-display text-text-primary leading-[1.1] tracking-tight text-[clamp(1.75rem,3.5vw,2.5rem)]">
                Saved opportunities
              </h1>
              <p className="text-[0.875rem] text-text-muted mt-3 leading-relaxed">
                {items.length === 0
                  ? "Nothing saved yet. Tap the star on any opportunity in the directory to save it for later."
                  : `${items.length} saved opportunit${items.length === 1 ? "y" : "ies"} still open for applications.`}
              </p>
            </div>
            <Link
              href="/opportunities"
              className="text-[0.8rem] text-text-secondary no-underline transition-colors duration-150 hover:text-text-primary"
            >
              ← Browse all opportunities
            </Link>
          </div>

          {items.length === 0 ? (
            <div className="rounded-2xl bg-bg-card border border-border-subtle p-10 text-center">
              <p className="text-[0.85rem] text-text-muted leading-relaxed">
                When you find a role that looks interesting, click the star to save it here. Saved opportunities stay in this list while they&apos;re open and disappear once the application deadline passes.
              </p>
              <Link
                href="/opportunities"
                className="inline-block mt-5 px-4 py-2 rounded-lg bg-gold text-bg-primary text-[0.825rem] font-medium no-underline transition-colors hover:bg-gold-light"
              >
                Browse opportunities →
              </Link>
            </div>
          ) : (
            <OpportunitiesClient items={items} bookmarkedIds={bookmarkedIds} appliedIds={appliedIds} removeOnUnbookmark />
          )}
        </div>
      </main>
    </div>
  );
}

type ActionRow = {
  listing_kind: "opportunity" | "event" | "vc_grant";
  listing_id:   string;
  action_type:  "applied" | "going";
  created_at:   string;
};

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
  bookmarked_at: string;
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
