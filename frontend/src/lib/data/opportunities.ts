import "server-only";
import { rows, type Db } from "./query";

// Opportunity reads. The shape below is the single declaration of what an
// opportunity is on the client — page, loader and OpportunitiesClient all
// import it from here. It used to exist three times per listing type: a
// hand-written snake_case row type in the page, the mapper's return, and a
// hand-written camelCase type inside the client component.

export type Opportunity = {
  id: string;
  positionName: string;
  company: string;
  pay: string;
  locationType: "remote" | "hybrid" | "onsite";
  locationText: string | null;
  description: string;
  startMonth: number;
  startYear: number;
  applicationDeadline: string;
  contactEmail: string | null;
  applyMethod: "email" | "link";
  applyUrl: string | null;
  postedBy: { firstName: string; surname: string; linkedinUrl: string | null };
  skills: string[];
  sectors: string[];
};

/**
 * A row from list_approved_opportunities / list_my_bookmarked_opportunities.
 * Both RPCs return the same shape, which is why one mapper serves both —
 * and why toOpportunity previously existed twice, byte-identical.
 *
 * Structural, not hand-written: it is what the generated types say those
 * RPCs return, so a migration that changes a column breaks the build here.
 */
type Row = {
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
  apply_method: "email" | "link";
  apply_url: string | null;
  poster_first_name: string | null;
  poster_surname: string | null;
  poster_linkedin_url: string | null;
  skill_names: string[] | null;
  sector_names: string[] | null;
};

export function toOpportunity(r: Row): Opportunity {
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

/**
 * Approved, not-yet-expired opportunities.
 *
 * Goes through the SECURITY DEFINER RPC so contact_email is masked in the
 * database, not at the app layer (migration 20260530002). It also filters
 * to application_deadline >= current_date, so expired roles drop out
 * without anyone having to prune them.
 */
export async function listApprovedOpportunities(db: Db): Promise<Opportunity[]> {
  const data = await rows("list_approved_opportunities", () =>
    db.rpc("list_approved_opportunities"),
  );
  return data.map(toOpportunity);
}

/** Ids of the opportunities this user has bookmarked. */
export async function bookmarkedOpportunityIds(db: Db, userId: string): Promise<string[]> {
  const data = await rows("opportunity_bookmarks", () =>
    db.from("opportunity_bookmarks").select("opportunity_id").eq("user_id", userId),
  );
  return data.map((r) => r.opportunity_id);
}
