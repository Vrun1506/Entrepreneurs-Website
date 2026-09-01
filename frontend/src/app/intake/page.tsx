import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listSkillsDetailed, listSectors } from "@/lib/data/taxonomy";
import { destinationForStatus } from "@/lib/auth/status";
import IntakeFlow from "@/components/intake/IntakeFlow";
import type { Match } from "@/components/intake/screens";

// ════════════════════════════════════════════════════════════════════
// Foundry · Post-approval intake
//
// Identity is already done — this only ever mounts for an approved
// member who hasn't completed it (profile_version < 2). Admins bypass
// both checks so they can preview the flow for diagnostics, matching
// every other status-gated page in the app.
// ════════════════════════════════════════════════════════════════════

export const metadata = { robots: { index: false, follow: false } };

type RecentRow = {
  id: string;
  first_name: string;
  surname: string;
  role: string;
  course: string | null;
  grad_year: number | null;
  bio_focus: string | null;
  sector_names: string[] | null;
};

export default async function IntakePage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [profileRes, isAdminRes] = await Promise.all([
    supabase
      .from("profiles")
      .select("status, profile_version, first_name")
      .eq("id", user.id)
      .single(),
    supabase.rpc("is_admin"),
  ]);

  const profile = profileRes.data;
  if (!profile) redirect("/login");
  const isAdmin = !!isAdminRes.data;

  if (!isAdmin) {
    if (profile.status !== "approved") redirect(destinationForStatus(profile.status));
    if ((profile.profile_version ?? 1) >= 2) redirect("/home");
  }

  const [skillTaxonomy, sectors, recentRes] = await Promise.all([
    listSkillsDetailed(supabase),
    listSectors(supabase),
    supabase.rpc("list_directory_cards", { p_limit: 3, p_sort: "recent" }),
  ]);

  const matches: Match[] = ((recentRes.data as RecentRow[] | null) ?? []).map((r) => ({
    id: r.id,
    name: [r.first_name, r.surname].filter(Boolean).join(" "),
    line: [r.course, r.grad_year ? `'${String(r.grad_year).slice(2)}` : null]
      .filter(Boolean)
      .join(" "),
    because: r.sector_names?.length
      ? r.sector_names.slice(0, 2).join(" · ")
      : (r.bio_focus?.slice(0, 70) ?? "Recently joined"),
  }));

  return (
    <IntakeFlow
      firstName={profile.first_name}
      skillTaxonomy={skillTaxonomy.map((t) => ({ id: t.id, name: t.name, category: t.category }))}
      sectors={sectors}
      matches={matches}
    />
  );
}
