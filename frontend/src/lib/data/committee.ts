import "server-only";
import { rows, type Db } from "./query";
import { withAvatarUrls, type DirectoryMember } from "./directory";
import type { Affiliation } from "@/lib/intake/steps";

// ════════════════════════════════════════════════════════════════════
// Foundry · The committee gallery
//
// A small, unpaged read — a committee is a few dozen people, not a
// thousand-row directory — so unlike lib/data/directory.ts this has no
// filtering, paging or facets. list_committee_cards excludes everyone
// list_directory_cards would show: a member becomes visible here only
// once an admin escalates them (admin_set_committee), and drops back
// into the ordinary directory the moment that's undone.
// ════════════════════════════════════════════════════════════════════

type CommitteeRow = {
  id: string;
  first_name: string;
  surname: string;
  role: Affiliation;
  course: string | null;
  grad_year: number | null;
  avatar_path: string | null;
  bio_focus: string | null;
  bio_hobbies: string | null;
  committee_role: string | null;
  skill_names: string[] | null;
  sector_names: string[] | null;
};

/** A committee member is a directory member with a role banner. lookingFor
 *  is always empty here — this gallery answers "who's on committee", not
 *  "who's hiring". */
export type CommitteeMember = DirectoryMember & { committeeRole: string };

function toCommitteeMember(r: CommitteeRow): Omit<CommitteeMember, "avatarUrl"> {
  return {
    id: r.id,
    firstName: r.first_name,
    surname: r.surname,
    role: r.role,
    course: r.course,
    gradYear: r.grad_year,
    avatarPath: r.avatar_path,
    bioPreview: r.bio_focus,
    hobbiesPreview: r.bio_hobbies,
    skills: r.skill_names ?? [],
    sectors: r.sector_names ?? [],
    lookingFor: [],
    committeeRole: r.committee_role ?? "",
  };
}

/** Everyone currently on committee, for the /committee gallery. */
export async function committeeMembers(db: Db): Promise<CommitteeMember[]> {
  const data = await rows("list_committee_cards", () => db.rpc("list_committee_cards"));
  return withAvatarUrls(data.map(toCommitteeMember));
}
