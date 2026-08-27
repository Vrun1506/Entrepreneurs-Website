import "server-only";
import { rows, type Db } from "./query";

export type FoundryEvent = {
  id: string;
  title: string;
  description: string;
  lumaLink: string;
  eventAt: string;
  location: string;
  organiserName: string;
  contactEmail: string | null;
  isSocietyEvent: boolean;
  postedBy: { firstName: string; surname: string; linkedinUrl: string | null };
};

type Row = {
  id: string;
  title: string;
  description: string;
  luma_link: string;
  event_at: string;
  location: string;
  organiser_name: string;
  contact_email: string | null;
  is_society_event: boolean;
  poster_first_name: string | null;
  poster_surname: string | null;
  poster_linkedin_url: string | null;
};

export function toEvent(r: Row): FoundryEvent {
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

/**
 * Approved, upcoming events.
 *
 * SECURITY DEFINER RPC masks contact_email at the DB layer rather than the
 * application mapper (migration 20260530000002). It also filters to
 * event_at >= now(), so this list is bounded by what is actually upcoming
 * rather than by how many events have ever existed.
 */
export async function listApprovedEvents(db: Db): Promise<FoundryEvent[]> {
  const data = await rows("list_approved_events", () => db.rpc("list_approved_events"));
  return data.map(toEvent);
}

/**
 * The one event the poster is editing, or null if there is no such row.
 *
 * SECURITY DEFINER: the RPC checks caller = poster and returns
 * contact_email accordingly (migration 20260530000002). It returns a set,
 * so at most one row — the caller decides what a miss means, and every
 * caller so far 404s rather than saying whether the id exists.
 */
export async function eventForEdit(db: Db, id: string) {
  const data = await rows("get_event_for_edit", () =>
    db.rpc("get_event_for_edit", { p_id: id }));
  return data[0] ?? null;
}
