import "server-only";
import { rows, type Db } from "./query";

// ════════════════════════════════════════════════════════════════════
// Foundry · A member's own listings
//
// /calendar and /my-submissions both read "the three listing tables,
// filtered to what I posted", three .from() calls each, six in total —
// and not one of the six went through reportIfCapped. RLS is what makes
// them safe: a poster can see their own rows at any status, so no status
// filter is doing security work here.
//
// Two functions rather than one parameterised one: the pages want
// different columns (only /my-submissions renders rejected_reason),
// different statuses (/calendar wants live commitments, /my-submissions
// wants the whole history including rejected) and different ordering.
// Folding that into one function means a column-set argument, which is
// the untyped-Record problem query.ts exists to avoid.
//
// These return the rows as the schema describes them rather than a
// camelCase domain type, unlike the rest of lib/data. Each page maps
// straight into its own client component's shape — CalItem for one, a
// submission card for the other — so an intermediate camelCase type
// would be mapped twice and rendered never. What the pages gain here is
// the error handling, the cap check, and row types inferred from the
// generated schema instead of hand-written casts.
// ════════════════════════════════════════════════════════════════════

/** Statuses that represent a live commitment — what /calendar shows. */
const LIVE = ["pending", "approved"] as const;

/**
 * The user's own pending and approved listings, for the calendar.
 *
 * No ordering: /calendar sorts by date across all three kinds after
 * merging them, so ordering each query would be work thrown away.
 */
export async function myCalendarListings(db: Db, userId: string) {
  const [events, opportunities, vcs] = await Promise.all([
    rows("events (own, calendar)", () =>
      db
        .from("events")
        .select("id, title, description, location, organiser_name, luma_link, event_at, status")
        .eq("posted_by", userId)
        .in("status", LIVE)),
    rows("opportunities (own, calendar)", () =>
      db
        .from("opportunities")
        .select("id, position_name, company, pay, location_type, location_text, description, application_deadline, apply_method, apply_url, status")
        .eq("posted_by", userId)
        .in("status", LIVE)),
    rows("vcs_grants (own, calendar)", () =>
      db
        .from("vcs_grants")
        .select("id, kind, name, description, link, amount, deadline, stage, status")
        .eq("posted_by", userId)
        .in("status", LIVE)),
  ]);

  return { events, opportunities, vcs };
}

/**
 * Everything the user has ever posted, newest first, at every status.
 *
 * Includes rejected_reason, which is why this cannot share a query with
 * the calendar: it is the one place a member is shown why a listing was
 * turned down.
 */
export async function mySubmissions(db: Db, userId: string) {
  const [opportunities, events, vcs] = await Promise.all([
    rows("opportunities (own, submissions)", () =>
      db
        .from("opportunities")
        .select("id, position_name, company, status, created_at, rejected_reason")
        .eq("posted_by", userId)
        .order("created_at", { ascending: false })),
    rows("events (own, submissions)", () =>
      db
        .from("events")
        .select("id, title, status, created_at, rejected_reason")
        .eq("posted_by", userId)
        .order("created_at", { ascending: false })),
    rows("vcs_grants (own, submissions)", () =>
      db
        .from("vcs_grants")
        .select("id, name, kind, status, created_at, rejected_reason")
        .eq("posted_by", userId)
        .order("created_at", { ascending: false })),
  ]);

  return { opportunities, events, vcs };
}
