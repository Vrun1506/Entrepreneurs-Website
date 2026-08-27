import "server-only";
import { rows, type Db } from "./query";

// ════════════════════════════════════════════════════════════════════
// Foundry · Skills and sectors
//
// These two selects were written out verbatim in five files —
// onboarding, profile, opportunities/new, admin/opportunities/new and
// opportunities/[id]/edit — because every form that renders a chip
// picker needs the same reference data:
//
//   supabase.from("skills").select("id, name").order("name")
//   supabase.from("sectors").select("id, name").order("name")
//
// None of the five went through reportIfCapped. That is the failure this
// module is really about: skills and sectors are seeded lists that a
// human adds to by hand, so nobody thinks of them as growing — but the
// cap does not care why a table got long, and a truncated picker would
// just quietly stop offering the last skill in the alphabet. Routing
// them through rows() applies the check without anyone remembering to.
//
// Having one home also makes the obvious next move — wrapping these in
// cached(), since they change maybe once a year — a change to one file
// rather than to five.
// ════════════════════════════════════════════════════════════════════

/**
 * A row from `skills` or `sectors`.
 *
 * Structurally identical to `ChipItem` in components/forms/ChipGroup,
 * which is what consumes it. Declared separately rather than imported
 * because lib/data is `server-only` and must not depend on a component;
 * TypeScript matches them structurally, so no conversion is needed.
 */
export type Taxon = { id: number; name: string };

export async function listSkills(db: Db): Promise<Taxon[]> {
  return rows("skills", () => db.from("skills").select("id, name").order("name"));
}

export async function listSectors(db: Db): Promise<Taxon[]> {
  return rows("sectors", () => db.from("sectors").select("id, name").order("name"));
}

/**
 * Both pickers at once. Every caller needs both, and running them as a
 * pair here keeps them concurrent even when the page has already put
 * this call inside a wider Promise.all.
 */
export async function listTaxonomy(db: Db): Promise<{ skills: Taxon[]; sectors: Taxon[] }> {
  const [skills, sectors] = await Promise.all([listSkills(db), listSectors(db)]);
  return { skills, sectors };
}

/** The ids a chip picker should start with, for the two junction shapes. */
export type SelectedTaxonomy = { skillIds: number[]; sectorIds: number[] };

/** Which skills and sectors a member has on their profile. */
export async function profileTaxonomy(db: Db, profileId: string): Promise<SelectedTaxonomy> {
  const [skills, sectors] = await Promise.all([
    rows("profile_skills", () => db.from("profile_skills").select("skill_id").eq("profile_id", profileId)),
    rows("profile_sectors", () => db.from("profile_sectors").select("sector_id").eq("profile_id", profileId)),
  ]);
  return {
    skillIds:  skills.map((r) => r.skill_id),
    sectorIds: sectors.map((r) => r.sector_id),
  };
}

/** Which skills and sectors are tagged on one opportunity. */
export async function opportunityTaxonomy(db: Db, opportunityId: string): Promise<SelectedTaxonomy> {
  const [skills, sectors] = await Promise.all([
    rows("opportunity_skills", () => db.from("opportunity_skills").select("skill_id").eq("opportunity_id", opportunityId)),
    rows("opportunity_sectors", () => db.from("opportunity_sectors").select("sector_id").eq("opportunity_id", opportunityId)),
  ]);
  return {
    skillIds:  skills.map((r) => r.skill_id),
    sectorIds: sectors.map((r) => r.sector_id),
  };
}
