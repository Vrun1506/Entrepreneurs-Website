import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listTaxonomy } from "@/lib/data/taxonomy";
import IntakeFlow from "@/components/intake/IntakeFlow";
import type { Match } from "@/components/intake/screens";
import type { Affiliation } from "@/lib/intake/steps";

// ════════════════════════════════════════════════════════════════════
// Foundry · Intake preview
//
// The rebuilt nine-screen intake, mounted where it can be reviewed without
// being a live signup path.
//
// Admin-only, deliberately. Several fields in this flow — preferred name,
// the hobbies bio, photo, CV, core skills and screens 06-08 — have no
// column in the schema yet, so nothing here is submitted. Putting it in
// front of the eleven members currently sitting at pending_onboarding
// would take their answers and drop them, which is exactly the "success
// screen over an unchanged database" that PRODUCT.md rules out.
//
// When the migrations land and the FastAPI upload endpoint exists, this
// component moves to /onboarding and this route goes away.
// ════════════════════════════════════════════════════════════════════

export const metadata = { robots: { index: false, follow: false } };

type RecentRow = {
  id: string;
  first_name: string;
  surname: string;
  role: string;
  course: string | null;
  grad_year: number | null;
  working_on: string | null;
  sector_names: string[] | null;
};

export default async function IntakePreviewPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profileRes, taxonomy, isAdminRes, recentRes] = await Promise.all([
    supabase.from("profiles").select("role, first_name, surname").eq("id", user.id).single(),
    listTaxonomy(supabase),
    supabase.rpc("is_admin"),
    supabase.rpc("list_directory_cards", { p_limit: 3, p_sort: "recent" }),
  ]);

  if (!isAdminRes.data) redirect("/");

  const profile = profileRes.data;
  if (!profile) redirect("/login");

  // Real members, described factually. No similarity is claimed — the
  // matcher is a FastAPI concern and does not exist yet, so these cards
  // say who someone is rather than why they were picked.
  const matches: Match[] = ((recentRes.data as RecentRow[] | null) ?? []).map((r) => ({
    id: r.id,
    name: [r.first_name, r.surname].filter(Boolean).join(" "),
    line: [r.course, r.grad_year ? `'${String(r.grad_year).slice(2)}` : null]
      .filter(Boolean)
      .join(" "),
    because: r.sector_names?.length
      ? r.sector_names.slice(0, 2).join(" · ")
      : (r.working_on?.slice(0, 70) ?? "Recently joined"),
  }));

  return (
    <IntakeFlow
      email={user.email ?? ""}
      firstName={profile.first_name}
      surname={profile.surname}
      affiliation={profile.role as Affiliation}
      skillSuggestions={taxonomy.skills.map((k) => k.name)}
      sectors={taxonomy.sectors}
      matches={matches}
    />
  );
}
