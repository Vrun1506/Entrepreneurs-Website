import "server-only";
import { maybeRow, type Db } from "./query";

// ════════════════════════════════════════════════════════════════════
// Foundry · Profile reads that are not the directory
//
// The directory's own reads live in directory.ts. This is the small
// stuff: the name lookup three form pages do to prefill an organiser
// field, written out identically in each of them.
//
// The duplication worth removing here is not really the query — it is
// the `${first} ${surname}`.trim() that followed it at all three sites.
// A display name assembled at the call site is a display name that can
// drift between call sites, which is exactly what "Firstname " with a
// trailing space looks like when a surname is missing.
// ════════════════════════════════════════════════════════════════════

export type PosterName = {
  firstName: string;
  surname: string;
  /** `first surname`, trimmed — what the organiser field prefills with. */
  displayName: string;
};

/**
 * The current member's name, for prefilling a form they are posting.
 *
 * Returns null when the profile row is missing, which the three callers
 * treat differently — /events/new redirects to login, the admin twin
 * tolerates it, /events/[id]/edit 404s — so the decision stays with
 * them rather than being made in here.
 */
export async function posterName(db: Db, userId: string): Promise<PosterName | null> {
  const row = await maybeRow("profiles.poster_name", () =>
    db.from("profiles").select("first_name, surname").eq("id", userId).single(),
  );
  if (!row) return null;

  const firstName = row.first_name ?? "";
  const surname = row.surname ?? "";
  return { firstName, surname, displayName: `${firstName} ${surname}`.trim() };
}
